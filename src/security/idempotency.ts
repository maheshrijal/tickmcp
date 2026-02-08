import { Env } from '../types/env';
import { ValidationAppError } from '../utils/errors';

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 10 * 60;
const IDEMPOTENCY_KEY_PREFIX = 'idempotency';

function normalizeIdempotencyKey(key: string): string {
  return key.trim();
}

export async function guardIdempotency(
  env: Env,
  userId: string,
  operation: string,
  key: string | undefined,
): Promise<void> {
  const normalized = normalizeIdempotencyKey(key ?? '');
  if (!normalized) {
    throw new ValidationAppError('idempotencyKey is required for mutating operations');
  }

  const composite = `${IDEMPOTENCY_KEY_PREFIX}:${userId}:${operation}:${normalized}`;
  const existing = await env.OAUTH_KV.get(composite);
  if (existing) {
    throw new ValidationAppError('Duplicate idempotency key for mutating operation', {
      operation,
      idempotencyKey: normalized,
    });
  }

  // KV does not provide strict atomic set-if-not-exists semantics.
  // This still provides durable best-effort deduplication across worker instances.
  await env.OAUTH_KV.put(composite, '1', { expirationTtl: DEFAULT_IDEMPOTENCY_TTL_SECONDS });
}
