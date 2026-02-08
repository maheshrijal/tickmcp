import { Env } from '../../src/types/env';
import { MemoryD1Database } from './memory-d1';

function createMemoryKV(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  return {
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      const expiresAt = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined;
      store.set(key, { value, expiresAt });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

export function createTestEnv(overrides?: Partial<Env>): { env: Env; db: MemoryD1Database } {
  const db = new MemoryD1Database();

  const env: Env = {
    DB: db as unknown as D1Database,
    OAUTH_KV: createMemoryKV(),
    COOKIE_ENCRYPTION_KEY: 'test-cookie-encryption-key-0123456789abcdef',
    TICKTICK_CLIENT_ID: 'client-id',
    TICKTICK_CLIENT_SECRET: 'client-secret',
    TICKTICK_BASE_URL: 'https://api.ticktick.com/open/v1',
    TICKTICK_AUTH_URL: 'https://ticktick.com/oauth/authorize',
    TICKTICK_TOKEN_URL: 'https://ticktick.com/oauth/token',
    TICKTICK_OAUTH_SCOPE: 'tasks:read tasks:write',
    OAUTH_PROVIDER: {} as any,
    MCP_RATE_LIMITER: { limit: async () => ({ success: true }) } as unknown as RateLimit,
    AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) } as unknown as RateLimit,
    ...overrides,
  };

  return { env, db };
}
