import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTickTickTools } from '../../src/mcp/tools/register-tools';
import { createTestEnv } from '../helpers/test-env';

type ToolHandler = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

function getToolHandlers(server: McpServer): Record<string, ToolHandler> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.fromEntries(Object.entries((server as any)._registeredTools).map(([name, tool]) => [name, (tool as any).handler])) as Record<
    string,
    ToolHandler
  >;
}

function getErrorPayload(result: Record<string, unknown>): Record<string, unknown> {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

function assertToolOk(result: Record<string, unknown>, step: string): void {
  if (result.isError === true) {
    throw new Error(`${step} failed: ${JSON.stringify(getErrorPayload(result))}`);
  }
  expect((result.structuredContent as Record<string, unknown>).ok).toBe(true);
}

function taskTokenPayload() {
  return {
    accessToken: 'token-1',
    refreshToken: 'refresh-1',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    scope: 'tasks:read tasks:write',
    updatedAt: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MCP tools end-to-end (mocked TickTick upstream)', () => {
  it('returns TASK_NOT_FOUND from get_task after delete', async () => {
    const { env } = createTestEnv();
    const props = { userId: 'u-e2e' };
    await env.OAUTH_KV.put(`ticktick_tokens:${props.userId}`, JSON.stringify(taskTokenPayload()));

    const state: {
      task: { id: string; projectId: string; title: string; status: number; deleted: boolean; priority?: number; content?: string };
    } = {
      task: {
        id: 't1',
        projectId: 'p1',
        title: 'initial',
        status: 0,
        deleted: false,
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const path = url.pathname;

      if (path === '/open/v1/task' && method === 'POST') {
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
        state.task = {
          id: 't1',
          projectId: String(body.projectId),
          title: String(body.title),
          content: typeof body.content === 'string' ? body.content : undefined,
          priority: typeof body.priority === 'number' ? body.priority : undefined,
          status: 0,
          deleted: false,
        };
        return new Response(JSON.stringify(state.task), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (path === '/open/v1/task/t1' && method === 'POST') {
        const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
        state.task = {
          ...state.task,
          title: typeof body.title === 'string' ? body.title : state.task.title,
          priority: typeof body.priority === 'number' ? body.priority : state.task.priority,
          content: typeof body.content === 'string' ? body.content : state.task.content,
        };
        return new Response(JSON.stringify(state.task), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (path === '/open/v1/project/p1/task/t1/complete' && method === 'POST') {
        state.task = { ...state.task, status: 2 };
        return new Response(null, { status: 204 });
      }

      if (path === '/open/v1/project/p1/task/t1' && method === 'DELETE') {
        state.task = { ...state.task, deleted: true, status: 0 };
        return new Response(null, { status: 204 });
      }

      // Simulate stale upstream behavior: task endpoint still resolves after delete.
      if (path === '/open/v1/project/p1/task/t1' && method === 'GET') {
        const taskResponse = {
          id: 't1',
          projectId: 'p1',
          title: state.task.title,
          status: state.task.status,
          priority: state.task.priority,
          content: state.task.content,
        };
        return new Response(JSON.stringify(taskResponse), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (path === '/open/v1/project/p1/data' && method === 'GET') {
        const tasks = state.task.deleted ? [] : [{ ...state.task }];
        return new Response(JSON.stringify({ tasks }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      throw new Error(`Unhandled mocked request: ${method} ${path}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerTickTickTools(server, env, props);
    const tools = getToolHandlers(server);

    const create = await tools.ticktick_create_task({
      idempotencyKey: 'e2e-mocked-create',
      projectId: 'p1',
      title: 'E2E task',
      content: 'body',
      priority: 1,
    });
    assertToolOk(create, 'create');

    const getBeforeDelete = await tools.ticktick_get_task({ projectId: 'p1', taskId: 't1' });
    assertToolOk(getBeforeDelete, 'get_before_delete');

    const update = await tools.ticktick_update_task({
      idempotencyKey: 'e2e-mocked-update',
      projectId: 'p1',
      taskId: 't1',
      title: 'E2E task updated',
      priority: 3,
    });
    assertToolOk(update, 'update');

    const complete = await tools.ticktick_complete_task({
      idempotencyKey: 'e2e-mocked-complete',
      projectId: 'p1',
      taskId: 't1',
    });
    assertToolOk(complete, 'complete');

    const remove = await tools.ticktick_delete_task({
      idempotencyKey: 'e2e-mocked-delete',
      projectId: 'p1',
      taskId: 't1',
    });
    assertToolOk(remove, 'delete');

    const getAfterDelete = await tools.ticktick_get_task({ projectId: 'p1', taskId: 't1' });
    expect(getAfterDelete.isError).toBe(true);
    expect(getErrorPayload(getAfterDelete).code).toBe('TASK_NOT_FOUND');
  });

  it('applies corrected dueFilter semantics for today and this_week', async () => {
    const { env } = createTestEnv();
    const props = { userId: 'u-e2e-due' };
    await env.OAUTH_KV.put(`ticktick_tokens:${props.userId}`, JSON.stringify(taskTokenPayload()));

    const now = new Date();
    const ymd = (date: Date) => date.toISOString().slice(0, 10);
    const plusDays = (days: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + days);
      return ymd(d);
    };

    const dates = {
      yesterday: plusDays(-1),
      today: plusDays(0),
      plus1: plusDays(1),
      plus6: plusDays(6),
      plus7: plusDays(7),
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const path = url.pathname;
      if (path === '/open/v1/project/p1/data' && method === 'GET') {
        return new Response(
          JSON.stringify({
            tasks: [
              { id: 'yesterday', projectId: 'p1', title: 'yesterday', dueDate: `${dates.yesterday}T10:00:00.000+0000`, timeZone: 'UTC' },
              { id: 'today', projectId: 'p1', title: 'today', dueDate: `${dates.today}T10:00:00.000+0000`, timeZone: 'UTC' },
              { id: 'plus1', projectId: 'p1', title: 'plus1', dueDate: `${dates.plus1}T10:00:00.000+0000`, timeZone: 'UTC' },
              { id: 'plus6', projectId: 'p1', title: 'plus6', dueDate: `${dates.plus6}T10:00:00.000+0000`, timeZone: 'UTC' },
              { id: 'plus7', projectId: 'p1', title: 'plus7', dueDate: `${dates.plus7}T10:00:00.000+0000`, timeZone: 'UTC' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unhandled mocked request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerTickTickTools(server, env, props);
    const tools = getToolHandlers(server);

    const todayResult = await tools.ticktick_list_tasks({ projectId: 'p1', dueFilter: 'today' });
    const todayTasks = ((todayResult.structuredContent as Record<string, unknown>).tasks as Array<{ id: string }>).map((task) => task.id);
    expect(todayTasks).toEqual(['today']);

    const thisWeekResult = await tools.ticktick_list_tasks({ projectId: 'p1', dueFilter: 'this_week' });
    const thisWeekTasks = ((thisWeekResult.structuredContent as Record<string, unknown>).tasks as Array<{ id: string }>).map(
      (task) => task.id,
    );
    expect(thisWeekTasks).toEqual(['today', 'plus1', 'plus6']);
  });
});
