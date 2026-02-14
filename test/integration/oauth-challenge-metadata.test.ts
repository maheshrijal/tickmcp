import { describe, expect, it } from 'vitest';
import { buildResourceMetadataUrl, withOAuthChallengeMetadata } from '../../src/auth/oauth-metadata';
import { createTestEnv } from '../helpers/test-env';

describe('OAuth challenge metadata header', () => {
  it('builds path-specific protected-resource metadata URL', () => {
    const { env } = createTestEnv({ PUBLIC_BASE_URL: 'https://tickmcp.mrjl.dev' });
    const request = new Request('https://tickmcp.mrjl.dev/mcp');
    expect(buildResourceMetadataUrl(request, env)).toBe('https://tickmcp.mrjl.dev/.well-known/oauth-protected-resource/mcp');
  });

  it('adds resource_metadata to bearer challenge for 401 responses', () => {
    const { env } = createTestEnv({ PUBLIC_BASE_URL: 'https://tickmcp.mrjl.dev' });
    const request = new Request('https://tickmcp.mrjl.dev/mcp');
    const response = new Response('unauthorized', {
      status: 401,
      headers: {
        'www-authenticate': 'Bearer realm="OAuth", error="invalid_token"',
      },
    });

    const updated = withOAuthChallengeMetadata(response, request, env);
    const challenge = updated.headers.get('www-authenticate');
    expect(challenge).toContain('resource_metadata="https://tickmcp.mrjl.dev/.well-known/oauth-protected-resource/mcp"');
  });
});
