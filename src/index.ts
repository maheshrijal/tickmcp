import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Props } from './auth/props';
import { tokenExchangeCallback, withOAuthChallengeMetadata } from './auth/oauth-metadata';
import { tickTickAuthHandler } from './auth/ticktick-auth-handler';
import { AuditEventsRepository, OAuthStatesRepository } from './db/repositories';
import { Env } from './types/env';
import { registerTickTickTools } from './mcp/tools/register-tools';

const AUDIT_RETENTION_DAYS = 90;
const IDEMPOTENCY_CLEANUP_SECONDS = 10 * 60;
const MCP_ROUTE = '/mcp';

function summarizeAuthHeader(authHeader: string | null): Record<string, unknown> {
  if (!authHeader) {
    return { present: false };
  }
  const isBearer = authHeader.startsWith('Bearer ');
  const token = isBearer ? authHeader.slice('Bearer '.length) : authHeader;
  return {
    present: true,
    bearer: isBearer,
    tokenLength: token.length,
    tokenPrefix: token.slice(0, 8),
  };
}

export class TickMcpAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: 'ticktick-mcp-server',
    version: '0.1.0',
  });

  async init() {
    if (!this.props) {
      throw new Error('Missing auth props — user must authorize via OAuth first');
    }
    registerTickTickTools(this.server, this.env, this.props);
  }
}

const provider = new OAuthProvider({
  apiRoute: MCP_ROUTE,
  apiHandler: TickMcpAgent.serve(MCP_ROUTE),
  defaultHandler: tickTickAuthHandler as ExportedHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  tokenExchangeCallback,
});

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    }

    if (['/authorize', '/callback', '/register', '/token'].includes(url.pathname)) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const outcome = await env.AUTH_RATE_LIMITER.limit({ key: `auth:${ip}` });
      if (!outcome.success) {
        return new Response('Too Many Requests', { status: 429 });
      }
    }

    const response = await provider.fetch(request, env, ctx);

    if (url.pathname === '/token' && response.ok) {
      const cloned = response.clone();
      try {
        const body = await cloned.json() as Record<string, unknown>;
        if (typeof body.token_type === 'string') {
          body.token_type = 'Bearer';
        }
        return new Response(JSON.stringify(body), {
          status: response.status,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        });
      } catch {
        return response;
      }
    }

    if (url.pathname.startsWith(MCP_ROUTE)) {
      if (response.status === 401) {
        console.warn('MCP 401 response', {
          path: url.pathname,
          method: request.method,
          authHeader: summarizeAuthHeader(request.headers.get('authorization')),
          userAgent: request.headers.get('user-agent') ?? 'unknown',
        });
      }
      return withOAuthChallengeMetadata(response, request, env);
    }
    return response;
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCleanup(env));
  },
} satisfies ExportedHandler<Env>;

async function runCleanup(env: Env): Promise<void> {
  const now = new Date();

  const oauthStates = new OAuthStatesRepository(env.DB);
  const expiredStates = await oauthStates.deleteExpired(now.toISOString());

  const auditRepo = new AuditEventsRepository(env.DB);
  const auditCutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const oldAudits = await auditRepo.deleteOlderThan(auditCutoff);

  const idempotencyCutoff = new Date(now.getTime() - IDEMPOTENCY_CLEANUP_SECONDS * 1000).toISOString();
  const idempotencyResult = await env.DB
    .prepare('DELETE FROM idempotency_keys WHERE created_at < ?')
    .bind(idempotencyCutoff)
    .run();
  const oldIdempotency = idempotencyResult.meta.changes ?? 0;

  console.log('Cleanup complete', { expiredStates, oldAudits, oldIdempotency });
}
