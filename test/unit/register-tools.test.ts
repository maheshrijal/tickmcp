import { describe, expect, it, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTickTickTools } from '../../src/mcp/tools/register-tools';
import { Props } from '../../src/auth/props';
import { Env } from '../../src/types/env';

const TOOL_NAMES = [
  'ticktick_auth_status',
  'ticktick_list_projects',
  'ticktick_get_project',
  'ticktick_list_tasks',
  'ticktick_get_task',
  'ticktick_create_task',
  'ticktick_update_task',
  'ticktick_complete_task',
  'ticktick_delete_task',
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

interface RegisteredTool {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

function getRegisteredTools(server: McpServer): Record<string, RegisteredTool> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools;
}

const stubEnv = {
  DB: {} as any,
  OAUTH_KV: {} as any,
  COOKIE_ENCRYPTION_KEY: 'test',
  TICKTICK_CLIENT_ID: 'client-id',
  TICKTICK_CLIENT_SECRET: 'client-secret',
  TICKTICK_BASE_URL: 'https://api.ticktick.com/open/v1',
  OAUTH_PROVIDER: {} as any,
  MCP_RATE_LIMITER: {} as any,
} as Env;

const stubProps: Props = {
  userId: 'test-user',
};

describe('register-tools metadata', () => {
  let tools: Record<string, RegisteredTool>;

  beforeAll(() => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerTickTickTools(server, stubEnv, stubProps);
    tools = getRegisteredTools(server);
  });

  it('registers exactly 9 tools', () => {
    const names = Object.keys(tools);
    expect(names).toHaveLength(9);
    for (const name of TOOL_NAMES) {
      expect(names).toContain(name);
    }
  });

  it('every tool has a title', () => {
    for (const name of TOOL_NAMES) {
      expect(tools[name].title, `${name} missing title`).toBeTruthy();
    }
  });

  it('every tool has a multi-line description', () => {
    for (const name of TOOL_NAMES) {
      const desc = tools[name].description;
      expect(desc, `${name} missing description`).toBeTruthy();
      expect(desc!.length, `${name} description too short`).toBeGreaterThan(50);
    }
  });

  it('every tool has annotations with all four hint fields', () => {
    for (const name of TOOL_NAMES) {
      const ann = tools[name].annotations;
      expect(ann, `${name} missing annotations`).toBeDefined();
      expect(typeof ann!.readOnlyHint, `${name} missing readOnlyHint`).toBe('boolean');
      expect(typeof ann!.destructiveHint, `${name} missing destructiveHint`).toBe('boolean');
      expect(typeof ann!.idempotentHint, `${name} missing idempotentHint`).toBe('boolean');
      expect(typeof ann!.openWorldHint, `${name} missing openWorldHint`).toBe('boolean');
    }
  });

  it('every tool has an outputSchema', () => {
    for (const name of TOOL_NAMES) {
      expect(tools[name].outputSchema, `${name} missing outputSchema`).toBeDefined();
    }
  });

  const expectedAnnotations: Record<ToolName, { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean }> = {
    ticktick_auth_status: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ticktick_list_projects: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ticktick_get_project: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ticktick_list_tasks: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ticktick_get_task: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ticktick_create_task: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    ticktick_update_task: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ticktick_complete_task: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    ticktick_delete_task: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  };

  for (const name of TOOL_NAMES) {
    it(`${name} has correct annotation values`, () => {
      expect(tools[name].annotations).toEqual(expectedAnnotations[name]);
    });
  }

  it('read-only tools are not marked destructive', () => {
    const readOnlyTools = TOOL_NAMES.filter((n) => expectedAnnotations[n].readOnlyHint);
    for (const name of readOnlyTools) {
      expect(tools[name].annotations!.destructiveHint, `${name} should not be destructive`).toBe(false);
    }
  });

  it('only ticktick_delete_task is marked destructive', () => {
    for (const name of TOOL_NAMES) {
      if (name === 'ticktick_delete_task') {
        expect(tools[name].annotations!.destructiveHint).toBe(true);
      } else {
        expect(tools[name].annotations!.destructiveHint, `${name} should not be destructive`).toBe(false);
      }
    }
  });
});
