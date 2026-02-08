import { describe, expect, it } from 'vitest';
import { UsersRepository, AuditEventsRepository, OAuthStatesRepository } from '../../src/db/repositories';
import { MemoryD1Database } from '../helpers/memory-d1';

describe('D1 repositories', () => {
  it('creates and resolves users by subject', async () => {
    const db = new MemoryD1Database();
    const users = new UsersRepository(db as unknown as D1Database);

    const first = await users.ensureBySubject('sub-1');
    const second = await users.ensureBySubject('sub-1');

    expect(first.id).toBe(second.id);
    expect(first.mcpSubject).toBe('sub-1');
  });

  it('inserts audit events', async () => {
    const db = new MemoryD1Database();
    const audit = new AuditEventsRepository(db as unknown as D1Database);

    await audit.insert({
      userId: 'u1',
      eventType: 'ticktick_list_projects',
      status: 'success',
    });

    const events = db.getAuditEvents();
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('ticktick_list_projects');
    expect(events[0].status).toBe('success');
  });

  it('stores and consumes oauth state once', async () => {
    const db = new MemoryD1Database();
    const oauthStates = new OAuthStatesRepository(db as unknown as D1Database);

    const now = new Date('2026-02-08T00:00:00.000Z');
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    await oauthStates.create({
      state: 'state-1',
      mcpOAuthRequest: {
        clientId: 'client-1',
        redirectUri: 'http://127.0.0.1/callback',
        state: 'outer-state',
        scope: ['scope-a'],
        responseType: 'code',
      },
      codeVerifier: 'verifier-1',
      expiresAt,
    });

    const consumed = await oauthStates.consume('state-1', now.toISOString());
    expect(consumed).toBeTruthy();
    expect(consumed?.codeVerifier).toBe('verifier-1');

    const second = await oauthStates.consume('state-1', now.toISOString());
    expect(second).toBeNull();
  });
});
