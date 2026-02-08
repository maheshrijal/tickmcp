import { describe, expect, it, vi } from 'vitest';
import { exchangeTickTickCode, refreshTickTickToken, getTickTickUserIdentity } from '../../src/auth/ticktick-upstream';
import { createTestEnv } from '../helpers/test-env';

describe('ticktick-upstream helpers', () => {
  it('exchanges code for tokens', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'tasks:read tasks:write',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await exchangeTickTickCode(
      'auth-code',
      'code-verifier',
      'https://example.com/callback',
      env,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.access_token).toBe('new-access');
    expect(result.refresh_token).toBe('new-refresh');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ticktick.com/oauth/token');
    expect(options.method).toBe('POST');
    // Credentials are sent as body params, not Basic Auth
    const body = (options.body as string);
    expect(body).toContain('client_id=');
    expect(body).toContain('client_secret=');
  });

  it('throws on failed code exchange', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":"invalid_request"}', { status: 400 }),
    );

    await expect(
      exchangeTickTickCode('bad-code', 'verifier', 'https://example.com/callback', env, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('TickTick token exchange failed');
  });

  it('refreshes tokens successfully', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'refreshed-access',
          refresh_token: 'refreshed-refresh',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await refreshTickTickToken('old-refresh', env, fetchMock as unknown as typeof fetch);
    expect(result.access_token).toBe('refreshed-access');
  });

  it('throws on failed refresh', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"error":"invalid_grant"}', { status: 400 }),
    );

    await expect(
      refreshTickTickToken('stale-refresh', env, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('TickTick token refresh failed');
  });

  it('gets TickTick user identity', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ username: 'testuser123' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const info = await getTickTickUserIdentity('valid-token', env, fetchMock as unknown as typeof fetch);
    expect(info.subject).toBe('testuser123');
    expect(info.displayName).toBe('testuser123');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://api.ticktick.com/open/v1/user');
  });

  it('falls back to email when username is missing', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ email: 'user@example.com' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const info = await getTickTickUserIdentity('valid-token', env, fetchMock as unknown as typeof fetch);
    expect(info.subject).toBe('user@example.com');
  });

  it('throws when user identity has no stable subject fields', async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({}),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(getTickTickUserIdentity('valid-token', env, fetchMock as unknown as typeof fetch)).rejects.toThrow(
      'TickTick user identity response is missing a usable subject',
    );
  });
});
