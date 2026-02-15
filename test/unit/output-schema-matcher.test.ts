import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  authStatusOutputSchema,
  getTaskOutputSchema,
  listProjectsOutputSchema,
  listTasksOutputSchema,
  taskRefOutputSchema,
} from '../../src/mcp/tools/output-schemas';

describe('output schema matchers', () => {
  it('validates auth status output shape with schemaMatching', () => {
    const schema = z.object(authStatusOutputSchema);
    expect({ ok: true, userId: 'u1', connected: true, expiresAt: null }).toEqual(expect.schemaMatching(schema));
  });

  it('validates project/task outputs with schemaMatching', () => {
    const projectsSchema = z.object(listProjectsOutputSchema);
    const tasksSchema = z.object(listTasksOutputSchema);
    const taskSchema = z.object(getTaskOutputSchema);
    const taskRefSchema = z.object(taskRefOutputSchema);

    expect({
      ok: true,
      projects: [{ id: 'p1', name: 'Inbox', closed: false }],
      count: 1,
    }).toEqual(expect.schemaMatching(projectsSchema));

    expect({
      ok: true,
      tasks: [{ id: 't1', projectId: 'p1', title: 'task', status: 0 }],
      count: 1,
      total: 1,
      hasMore: false,
    }).toEqual(expect.schemaMatching(tasksSchema));

    expect({
      ok: true,
      task: { id: 't1', projectId: 'p1', title: 'task', status: 2 },
    }).toEqual(expect.schemaMatching(taskSchema));

    expect({
      ok: true,
      projectId: 'p1',
      taskId: 't1',
    }).toEqual(expect.schemaMatching(taskRefSchema));
  });

  it('rejects invalid output shapes', () => {
    const schema = z.object(taskRefOutputSchema);
    expect(() => {
      expect({ ok: true, projectId: 'p1' }).toEqual(expect.schemaMatching(schema));
    }).toThrow();
  });
});
