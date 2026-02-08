import { describe, expect, it } from 'vitest';
import { guardIdempotency } from '../../src/security/idempotency';
import { createTestEnv } from '../helpers/test-env';

describe('guardIdempotency', () => {
  it('requires idempotency key for mutating operations', async () => {
    const { env } = createTestEnv();
    await expect(guardIdempotency(env, 'user-1', 'ticktick_create_task', undefined)).rejects.toThrow(
      'idempotencyKey is required',
    );
  });

  it('rejects duplicate idempotency key within ttl', async () => {
    const { env } = createTestEnv();
    await guardIdempotency(env, 'user-1', 'ticktick_create_task', 'idem-1');
    await expect(guardIdempotency(env, 'user-1', 'ticktick_create_task', 'idem-1')).rejects.toThrow(
      'Duplicate idempotency key',
    );
  });
});
