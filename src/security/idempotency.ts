import { Env } from '../types/env';
import { ValidationAppError } from '../utils/errors';

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 10 * 60;

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

  const cutoff = new Date(Date.now() - DEFAULT_IDEMPOTENCY_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare('DELETE FROM idempotency_keys WHERE created_at < ?').bind(cutoff).run();

  try {
    await env.DB
      .prepare('INSERT INTO idempotency_keys (user_id, operation, key, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, operation, normalized, new Date().toISOString())
      .run();
  } catch (error) {
    if (error instanceof Error && (error.message.includes('UNIQUE') || error.message.includes('PRIMARY KEY') || error.message.includes('constraint'))) {
      throw new ValidationAppError('Duplicate idempotency key for mutating operation', {
        operation,
        idempotencyKey: normalized,
      });
    }
    throw error;
  }
}
