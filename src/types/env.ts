import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Env {
  DB: D1Database;
  OAUTH_KV: KVNamespace;

  COOKIE_ENCRYPTION_KEY: string;

  PUBLIC_BASE_URL?: string;

  TICKTICK_CLIENT_ID: string;
  TICKTICK_CLIENT_SECRET: string;
  TICKTICK_BASE_URL?: string;
  TICKTICK_AUTH_URL?: string;
  TICKTICK_TOKEN_URL?: string;
  TICKTICK_OAUTH_SCOPE?: string;

  OAUTH_PROVIDER: OAuthHelpers;

  MCP_RATE_LIMITER: RateLimit;
  AUTH_RATE_LIMITER: RateLimit;
}
