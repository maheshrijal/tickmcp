import { Env } from '../types/env';
import { TickTickTokenResponse } from '../types/models';
import { TickTickApiError } from '../utils/errors';

const TOKEN_TIMEOUT_MS = 10_000;
const USERINFO_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 200;

function getTokenUrl(env: Env): string {
  return env.TICKTICK_TOKEN_URL ?? 'https://ticktick.com/oauth/token';
}

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  const credentials = `${clientId}:${clientSecret}`;
  return `Basic ${btoa(credentials)}`;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function jitteredBackoffMs(attempt: number): number {
  const base = BACKOFF_BASE_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
  return base + jitter;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonBody(response: Response): Promise<{ body: Record<string, unknown>; rawText: string }> {
  const rawText = await response.text();
  if (!rawText) {
    return { body: {}, rawText };
  }
  try {
    return { body: JSON.parse(rawText) as Record<string, unknown>, rawText };
  } catch {
    return { body: {}, rawText };
  }
}

function normalizeTokenBody(body: Record<string, unknown>): TickTickTokenResponse {
  const accessToken = asString(body.access_token) ?? asString(body.accessToken);
  const refreshToken = asString(body.refresh_token) ?? asString(body.refreshToken);
  const tokenType = asString(body.token_type) ?? asString(body.tokenType);
  const scope = asString(body.scope);
  const expiresIn = asNumber(body.expires_in) ?? asNumber(body.expiresIn);

  if (!accessToken) {
    throw new TickTickApiError('TickTick token response is missing access token', 502, { body });
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: tokenType,
    scope,
    expires_in: expiresIn,
  };
}

export async function exchangeTickTickCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<TickTickTokenResponse> {
  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: env.TICKTICK_CLIENT_ID,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        getTokenUrl(env),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: buildBasicAuthHeader(env.TICKTICK_CLIENT_ID, env.TICKTICK_CLIENT_SECRET),
          },
          body: payload.toString(),
        },
        TOKEN_TIMEOUT_MS,
        fetchImpl,
      );
      const { body, rawText } = await parseJsonBody(response);
      if (response.ok && !body.error) {
        return normalizeTokenBody(body);
      }

      const status = response.status;
      if (shouldRetryStatus(status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
        await sleep(retryAfter ?? jitteredBackoffMs(attempt));
        continue;
      }

      throw new TickTickApiError(
        `TickTick token exchange failed (${status}): ${body.error ?? 'unknown'}`,
        status,
        { body, responseBody: rawText },
      );
    } catch (error) {
      lastError = error;
      if (error instanceof TickTickApiError) {
        throw error;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }
      if (isAbortError(error)) {
        throw new TickTickApiError('TickTick token exchange timed out', 504);
      }
      throw new TickTickApiError('TickTick token exchange failed due to network error', 502, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new TickTickApiError('TickTick token exchange failed', 502, {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

export async function refreshTickTickToken(
  refreshToken: string,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<TickTickTokenResponse> {
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: env.TICKTICK_CLIENT_ID,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        getTokenUrl(env),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: buildBasicAuthHeader(env.TICKTICK_CLIENT_ID, env.TICKTICK_CLIENT_SECRET),
          },
          body: payload.toString(),
        },
        TOKEN_TIMEOUT_MS,
        fetchImpl,
      );
      const { body, rawText } = await parseJsonBody(response);
      if (response.ok && !body.error) {
        return normalizeTokenBody(body);
      }

      const status = response.status;
      if (shouldRetryStatus(status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
        await sleep(retryAfter ?? jitteredBackoffMs(attempt));
        continue;
      }

      throw new TickTickApiError(
        `TickTick token refresh failed (${status}): ${body.error ?? 'unknown'}`,
        status,
        { body, responseBody: rawText },
      );
    } catch (error) {
      lastError = error;
      if (error instanceof TickTickApiError) {
        throw error;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }
      if (isAbortError(error)) {
        throw new TickTickApiError('TickTick token refresh timed out', 504);
      }
      throw new TickTickApiError('TickTick token refresh failed due to network error', 502, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new TickTickApiError('TickTick token refresh failed', 502, {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

export interface TickTickUserInfo {
  username: string;
}

export async function getTickTickUserIdentity(
  accessToken: string,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<TickTickUserInfo> {
  const baseUrl = env.TICKTICK_BASE_URL ?? 'https://api.ticktick.com/open/v1';
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}/user`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        USERINFO_TIMEOUT_MS,
        fetchImpl,
      );

      if (response.ok) {
        return (await response.json()) as TickTickUserInfo;
      }

      if (shouldRetryStatus(response.status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
        await sleep(retryAfter ?? jitteredBackoffMs(attempt));
        continue;
      }

      throw new TickTickApiError(`Failed to get TickTick user identity (${response.status})`, response.status);
    } catch (error) {
      lastError = error;
      if (error instanceof TickTickApiError) {
        throw error;
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }
      if (isAbortError(error)) {
        throw new TickTickApiError('TickTick user identity request timed out', 504);
      }
      throw new TickTickApiError('Failed to get TickTick user identity due to network error', 502, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new TickTickApiError('Failed to get TickTick user identity', 502, {
    cause: lastError instanceof Error ? lastError.message : String(lastError),
  });
}
