import { describe, expect, it, vi } from 'vitest';
import { TickTickClient } from '../../src/ticktick/client';
import { Props } from '../../src/auth/props';
import { Env } from '../../src/types/env';
import { TaskNotFoundError, TickTickAuthRequiredError, TickTickRateLimitError, ValidationAppError } from '../../src/utils/errors';

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

  it('does not fail deleteTask when tombstone KV write fails after upstream delete', async () => {
    const tokenPayload = JSON.stringify({
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'tasks:read tasks:write',
      updatedAt: new Date().toISOString(),
    });
    const kv = {
      get: async (key: string) => (key === 'ticktick_tokens:u1' ? tokenPayload : null),
      put: async (key: string) => {
        if (key.startsWith('ticktick_deleted_task:')) {
          throw new Error('KV unavailable');
        }
      },
      delete: async () => {},
    } as unknown as KVNamespace;

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new TickTickClient(makeEnv({ OAUTH_KV: kv }), makeProps(), fetchMock as unknown as typeof fetch);

    await expect(client.deleteTask('p1', 't1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not fail getTask when tombstone KV read fails', async () => {
    const tokenPayload = JSON.stringify({
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'tasks:read tasks:write',
      updatedAt: new Date().toISOString(),
    });
    const kv = {
      get: async (key: string) => {
        if (key.startsWith('ticktick_deleted_task:')) {
          throw new Error('KV timeout');
        }
        return key === 'ticktick_tokens:u1' ? tokenPayload : null;
      },
      put: async () => {},
      delete: async () => {},
    } as unknown as KVNamespace;

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
            tasks: [{ id: 't1', projectId: 'p1', title: 'task', status: 0 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const client = new TickTickClient(makeEnv({ OAUTH_KV: kv }), makeProps(), fetchMock as unknown as typeof fetch);
    await expect(client.getTask('p1', 't1')).resolves.toMatchObject({ id: 't1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('rejects listTasks status=2 with ValidationAppError', async () => {
    const client = new TickTickClient(makeEnv(), makeProps(), vi.fn() as unknown as typeof fetch);
    await expect(client.listTasks({ projectId: 'p1', status: 2 as unknown as 0 })).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('listTasks status=0 returns only active tasks', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            { id: 'active', projectId: 'p1', title: 'active', status: 0 },
            { id: 'completed', projectId: 'p1', title: 'completed', status: 2 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const result = await client.listTasks({ projectId: 'p1', status: 0 });
    expect(result.tasks.map((task) => task.id)).toEqual(['active']);
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

  it('sends repeatFlag and extended task fields in createTask/updateTask payloads', async () => {
    const seenBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const path = url.pathname;

      if (path === '/open/v1/task' && method === 'POST') {
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
        seenBodies.push(body);
        return new Response(JSON.stringify({ id: 't1', projectId: 'p1', title: 'new' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (path === '/open/v1/task/t1' && method === 'POST') {
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
        seenBodies.push(body);
        return new Response(JSON.stringify({ id: 't1', projectId: 'p1', title: 'updated' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unhandled mocked request: ${method} ${path}`);
    });

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await client.createTask({
      projectId: 'p1',
      title: 'new',
      repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
      desc: 'plain description',
      isAllDay: true,
      timeZone: 'America/New_York',
      reminders: ['TRIGGER:P0DT0H30M0S'],
      sortOrder: 99,
      kind: 'CHECKLIST',
      items: [{ title: 'item-a', status: 0 }],
    });
    await client.updateTask({
      projectId: 'p1',
      taskId: 't1',
      repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      desc: 'updated description',
      items: [{ id: 'i1', title: 'item-a', status: 1 }],
    });

    expect(seenBodies).toHaveLength(2);
    expect(seenBodies[0].repeatFlag).toBe('RRULE:FREQ=DAILY;INTERVAL=1');
    expect(seenBodies[0].repeat).toBeUndefined();
    expect(seenBodies[0].desc).toBe('plain description');
    expect(seenBodies[0].isAllDay).toBe(true);
    expect(seenBodies[0].timeZone).toBe('America/New_York');
    expect(seenBodies[0].reminders).toEqual(['TRIGGER:P0DT0H30M0S']);
    expect(seenBodies[0].sortOrder).toBe(99);
    expect(seenBodies[0].kind).toBe('CHECKLIST');
    expect(seenBodies[0].items).toEqual([{ title: 'item-a', status: 0 }]);
    expect(seenBodies[1].repeatFlag).toBe('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
    expect(seenBodies[1].repeat).toBeUndefined();
    expect(seenBodies[1].desc).toBe('updated description');
    expect(seenBodies[1].items).toEqual([{ id: 'i1', title: 'item-a', status: 1 }]);
  });

  it('normalizes inbound repeatFlag to both repeat and repeatFlag in task outputs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 't-repeat',
          projectId: 'p1',
          title: 'recurring',
          status: 2,
          repeatFlag: 'RRULE:FREQ=DAILY;INTERVAL=1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const task = await client.getTask('p1', 't-repeat');
    expect(task.repeatFlag).toBe('RRULE:FREQ=DAILY;INTERVAL=1');
    expect(task.repeat).toBe('RRULE:FREQ=DAILY;INTERVAL=1');
  });

  it('rejects conflicting repeat and repeatFlag in client runtime validation', async () => {
    const client = new TickTickClient(makeEnv(), makeProps(), vi.fn() as unknown as typeof fetch);
    await expect(
      client.createTask({
        projectId: 'p1',
        title: 'conflict',
        repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
        repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1',
      }),
    ).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('creates and updates projects via project endpoints', async () => {
    const seenBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const path = url.pathname;
      const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
      seenBodies.push(body);

      if (path === '/open/v1/project' && method === 'POST') {
        return new Response(JSON.stringify({ id: 'p1', name: body.name, color: body.color }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (path === '/open/v1/project/p1' && method === 'POST') {
        return new Response(JSON.stringify({ id: 'p1', name: body.name ?? 'Work', viewMode: body.viewMode }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unhandled mocked request: ${method} ${path}`);
    });

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const created = await client.createProject({ name: 'Work', color: '#2563eb', sortOrder: 1, kind: 'TASK' });
    const updated = await client.updateProject({ projectId: 'p1', viewMode: 'kanban', kind: 'NOTE', sortOrder: 2 });

    expect(created).toMatchObject({ id: 'p1', name: 'Work', color: '#2563eb' });
    expect(updated).toMatchObject({ id: 'p1', viewMode: 'kanban' });
    expect(seenBodies[0]).toMatchObject({ name: 'Work', color: '#2563eb', sortOrder: 1, kind: 'TASK' });
    expect(seenBodies[1]).toMatchObject({ viewMode: 'kanban', kind: 'NOTE', sortOrder: 2 });
  });

  it('maps createProject unknown_exception to ValidationAppError with project-count context', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorId: 'amie8bv0@erver-14',
            errorCode: 'unknown_exception',
            errorMessage: 'Unknown exception',
            data: null,
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorId: 'amie8bv0@erver-14',
            errorCode: 'unknown_exception',
            errorMessage: 'Unknown exception',
            data: null,
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errorId: 'amie8bv0@erver-14',
            errorCode: 'unknown_exception',
            errorMessage: 'Unknown exception',
            data: null,
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'p1', name: 'one' }, { id: 'p2', name: 'two' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await expect(client.createProject({ name: 'new project' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.objectContaining({
        projectCount: 2,
      }),
    });
  });

  it('gets project data envelope with project/tasks/columns', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          project: { id: 'p1', name: 'Work' },
          tasks: [{ id: 't1', projectId: 'p1', title: 'Task 1', repeatFlag: 'RRULE:FREQ=DAILY;INTERVAL=1' }],
          columns: [{ id: 'c1', projectId: 'p1', name: 'Todo', sortOrder: 10 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const data = await client.getProjectData('p1');
    expect(data.project).toMatchObject({ id: 'p1', name: 'Work' });
    expect(data.tasks[0]).toMatchObject({
      id: 't1',
      repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
      repeatFlag: 'RRULE:FREQ=DAILY;INTERVAL=1',
    });
    expect(data.columns).toHaveLength(1);
  });

  it('deletes project via project endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    await expect(client.deleteProject('p1')).resolves.toBeUndefined();
  });

  it('patches task items with deterministic operations and unknown-id guard', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const path = new URL(typeof input === 'string' ? input : input.toString()).pathname;

      if (path === '/open/v1/project/p1/task/t1' && method === 'GET') {
        return new Response(
          JSON.stringify({
            id: 't1',
            projectId: 'p1',
            title: 'Task 1',
            status: 0,
            items: [
              { id: 'i1', title: 'one', status: 0, sortOrder: 1 },
              { id: 'i2', title: 'two', status: 1, sortOrder: 2 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (path === '/open/v1/project/p1/data' && method === 'GET') {
        return new Response(
          JSON.stringify({
            tasks: [{ id: 't1', projectId: 'p1', title: 'Task 1', status: 0 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (path === '/open/v1/task/t1' && method === 'POST') {
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: 't1',
            projectId: 'p1',
            title: 'Task 1',
            status: 0,
            items: body.items,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      throw new Error(`Unhandled mocked request: ${method} ${path}`);
    });

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const patched = await client.patchTaskItems({
      projectId: 'p1',
      taskId: 't1',
      operations: [
        { op: 'toggle', id: 'i1' },
        { op: 'update', id: 'i2', item: { title: 'two-updated' } },
        { op: 'add', item: { title: 'three', status: 0 }, index: 1 },
        { op: 'remove', id: 'i1' },
      ],
    });
    expect(patched.items).toEqual([
      { title: 'three', status: 0 },
      { id: 'i2', title: 'two-updated', status: 1, sortOrder: 2 },
    ]);

    await expect(
      client.patchTaskItems({
        projectId: 'p1',
        taskId: 't1',
        operations: [{ op: 'remove', id: 'missing' }],
      }),
    ).rejects.toBeInstanceOf(ValidationAppError);
  });

  it('supports listTasks sort and date-range filtering', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            { id: 'a', projectId: 'p1', title: 'a', dueDate: '2026-03-10T10:00:00.000+0000', priority: 1 },
            { id: 'b', projectId: 'p1', title: 'b', dueDate: '2026-03-12T10:00:00.000+0000', priority: 5 },
            { id: 'c', projectId: 'p1', title: 'c', dueDate: '2026-03-08T10:00:00.000+0000', priority: 5 },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const client = new TickTickClient(makeEnv(), makeProps(), fetchMock as unknown as typeof fetch);
    const result = await client.listTasks({
      projectId: 'p1',
      priority: 5,
      dueDateFrom: '2026-03-09',
      dueDateTo: '2026-03-12',
      sortBy: 'dueDate',
      sortOrder: 'desc',
    });
    expect(result.tasks.map((task) => task.id)).toEqual(['b']);
  });
});
