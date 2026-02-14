import { describe, expect, it, vi } from 'vitest';
import { TickTickClient } from '../../src/ticktick/client';
import { Props } from '../../src/auth/props';
import { Env } from '../../src/types/env';
import { TaskNotFoundError, TickTickAuthRequiredError, TickTickRateLimitError } from '../../src/utils/errors';

function makeProps(overrides?: Partial<Props>): Props {
  return {
    userId: 'u1',
    ...overrides,
  };
}

function createMockKV(
  tokens?: { accessToken: string; refreshToken: string; expiresAt: string; scope: string },
): KVNamespace {
  const store = new Map<string, string>();
  if (tokens) {
    store.set(
      'ticktick_tokens:u1',
      JSON.stringify({
        ...tokens,
        updatedAt: new Date().toISOString(),
      }),
    );
  }
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function makeEnv(overrides?: Partial<Env>): Env {
  return {
    DB: {} as any,
    OAUTH_KV: createMockKV({
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'tasks:read tasks:write',
    }),
    COOKIE_ENCRYPTION_KEY: 'test',
    TICKTICK_CLIENT_ID: 'client-id',
    TICKTICK_CLIENT_SECRET: 'client-secret',
    TICKTICK_BASE_URL: 'https://api.ticktick.com/open/v1',
    TICKTICK_TOKEN_URL: 'https://ticktick.com/oauth/token',
    TICKTICK_OAUTH_SCOPE: 'tasks:read tasks:write',
    OAUTH_PROVIDER: {} as any,
    MCP_RATE_LIMITER: {} as any,
    ...overrides,
  } as Env;
}

describe('TickTickClient', () => {
  it('refreshes token after 401 and retries once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      // refresh token call
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'refreshed-token',
            refresh_token: 'refreshed-refresh',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // retried API call
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'p1', name: 'Inbox' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const projects = await client.listProjects();

    expect(projects).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3); // original + refresh + retry
  });

  it('maps 429 to TickTickRateLimitError', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('limited', { status: 429 }));
    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);

    await expect(client.listProjects()).rejects.toBeInstanceOf(TickTickRateLimitError);
  });

  it('maps refresh invalid_grant to TickTickAuthRequiredError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await expect(client.listProjects()).rejects.toBeInstanceOf(TickTickAuthRequiredError);
  });

  it('uses rotated refresh token and updated expiry after refresh', async () => {
    const fetchMock = vi
      .fn()
      // call 1: api -> 401
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      // call 1: refresh
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'refreshed-token-1',
            refresh_token: 'refreshed-refresh-1',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // call 1: retry api -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'p1', name: 'Inbox' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      // call 2: api -> 401
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      // call 2: refresh (should use rotated refresh token from previous refresh)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'refreshed-token-2',
            refresh_token: 'refreshed-refresh-2',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // call 2: retry api -> 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'p2', name: 'Work' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);

    const first = await client.listProjects();
    const second = await client.listProjects();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);

    const firstRefreshBody = fetchMock.mock.calls[1][1]?.body as string;
    const secondRefreshBody = fetchMock.mock.calls[4][1]?.body as string;
    expect(firstRefreshBody).toContain('refresh_token=refresh-1');
    expect(secondRefreshBody).toContain('refresh_token=refreshed-refresh-1');
  });

  it('throws TickTickAuthRequiredError when KV has no tokens', async () => {
    const env = makeEnv({
      OAUTH_KV: createMockKV(),
    });
    const fetchMock = vi.fn();
    const client = new TickTickClient(env, makeProps(), fetchMock as unknown as typeof fetch);

    await expect(client.listProjects()).rejects.toBeInstanceOf(TickTickAuthRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws TaskNotFoundError for active task missing from active project data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 't1',
            projectId: 'p1',
            title: 'task',
            status: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [{ id: 't2', projectId: 'p1', title: 'other', status: 0 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await expect(client.getTask('p1', 't1')).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('returns completed task even if not in active project data', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 't1',
          projectId: 'p1',
          title: 'completed',
          status: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const task = await client.getTask('p1', 't1');
    expect(task.status).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not misclassify active task as missing when project has more than 5000 active tasks', async () => {
    const activeTasks = Array.from({ length: 6001 }, (_, i) => ({
      id: `task-${i + 1}`,
      projectId: 'p1',
      title: `Task ${i + 1}`,
      status: 0,
    }));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'task-6001',
            projectId: 'p1',
            title: 'Task 6001',
            status: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tasks: activeTasks }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const task = await client.getTask('p1', 'task-6001');

    expect(task.id).toBe('task-6001');
  });

  it('revalidates cached active task ids before returning active getTask results', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 't1',
            projectId: 'p1',
            title: 'Task 1',
            status: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [
              { id: 't1', projectId: 'p1', title: 'Task 1', status: 0 },
              { id: 't2', projectId: 'p1', title: 'Task 2', status: 0 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 't2',
            projectId: 'p1',
            title: 'Task 2',
            status: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tasks: [{ id: 't1', projectId: 'p1', title: 'Task 1', status: 0 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await client.getTask('p1', 't1'); // prime cache
    await expect(client.getTask('p1', 't2')).rejects.toBeInstanceOf(TaskNotFoundError);

    // call 1: get_task + project data
    // call 2: get_task + forced project data refresh due to cache hit
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns TaskNotFoundError after deleteTask even if upstream still resolves the task', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await client.deleteTask('p1', 't1');
    await expect(client.getTask('p1', 't1')).rejects.toBeInstanceOf(TaskNotFoundError);

    // getTask is blocked by tombstone and must not call TickTick endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dueFilter today includes only today and excludes overdue', async () => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const addDays = (days: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + days);
      return fmt(d);
    };
    const today = addDays(0);
    const yesterday = addDays(-1);
    const tomorrow = addDays(1);

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            { id: 'today', projectId: 'p1', title: 'today', dueDate: `${today}T10:00:00.000+0000`, timeZone: 'UTC' },
            { id: 'yesterday', projectId: 'p1', title: 'yesterday', dueDate: `${yesterday}T10:00:00.000+0000`, timeZone: 'UTC' },
            { id: 'tomorrow', projectId: 'p1', title: 'tomorrow', dueDate: `${tomorrow}T10:00:00.000+0000`, timeZone: 'UTC' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const result = await client.listTasks({ projectId: 'p1', dueFilter: 'today' });
    expect(result.tasks.map((task) => task.id)).toEqual(['today']);
  });

  it('dueFilter this_week excludes overdue and includes today plus next six days', async () => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const addDays = (days: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + days);
      return fmt(d);
    };
    const yesterday = addDays(-1);
    const today = addDays(0);
    const plus6 = addDays(6);
    const plus7 = addDays(7);

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            { id: 'yesterday', projectId: 'p1', title: 'yesterday', dueDate: `${yesterday}T10:00:00.000+0000`, timeZone: 'UTC' },
            { id: 'today', projectId: 'p1', title: 'today', dueDate: `${today}T10:00:00.000+0000`, timeZone: 'UTC' },
            { id: 'plus6', projectId: 'p1', title: 'plus6', dueDate: `${plus6}T10:00:00.000+0000`, timeZone: 'UTC' },
            { id: 'plus7', projectId: 'p1', title: 'plus7', dueDate: `${plus7}T10:00:00.000+0000`, timeZone: 'UTC' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const result = await client.listTasks({ projectId: 'p1', dueFilter: 'this_week' });
    expect(result.tasks.map((task) => task.id)).toEqual(['today', 'plus6']);
  });
});
