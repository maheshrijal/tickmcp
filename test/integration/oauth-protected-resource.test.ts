import { describe, expect, it } from 'vitest';
import { tickTickAuthHandler } from '../../src/auth/ticktick-auth-handler';
import { createTestEnv } from '../helpers/test-env';

describe('OAuth protected resource metadata', () => {
  const handler = tickTickAuthHandler as unknown as {
    fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response>;
  };

  it('serves metadata for root well-known endpoint', async () => {
    const { env } = createTestEnv({ PUBLIC_BASE_URL: 'https://tickmcp-dev.mrjl.dev' });
    const request = new Request('https://tickmcp-dev.mrjl.dev/.well-known/oauth-protected-resource');
    const response = await handler.fetch(request, env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      resource: string;
      authorization_servers: string[];
      bearer_methods_supported: string[];
    };
    expect(json.resource).toBe('https://tickmcp-dev.mrjl.dev');
    expect(json.authorization_servers).toEqual(['https://tickmcp-dev.mrjl.dev']);
    expect(json.bearer_methods_supported).toContain('header');
  });

  it('serves metadata for path-specific well-known endpoint', async () => {
    const { env } = createTestEnv({ PUBLIC_BASE_URL: 'https://tickmcp-dev.mrjl.dev' });
    const request = new Request('https://tickmcp-dev.mrjl.dev/.well-known/oauth-protected-resource/mcp');
    const response = await handler.fetch(request, env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = (await response.json()) as { resource: string };
    expect(json.resource).toBe('https://tickmcp-dev.mrjl.dev');
  });
});
