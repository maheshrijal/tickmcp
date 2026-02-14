import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Props } from './auth/props';
import { tickTickAuthHandler } from './auth/ticktick-auth-handler';
import { AuditEventsRepository, OAuthStatesRepository } from './db/repositories';
import { Env } from './types/env';
import { registerTickTickTools } from './mcp/tools/register-tools';

const AUDIT_RETENTION_DAYS = 90;
const IDEMPOTENCY_CLEANUP_SECONDS = 10 * 60;

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
  apiRoute: '/mcp',
  apiHandler: TickMcpAgent.serve('/mcp'),
  defaultHandler: tickTickAuthHandler as ExportedHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  tokenExchangeCallback: async ({ props }) => {
    // Return the props unchanged - they're already correctly set during authorization
    // This ensures props are properly passed through to the MCP agent
    return { accessTokenProps: props };
  },
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

    return provider.fetch(request, env, ctx);
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
