import { describe, expect, it } from 'vitest';
import { createTaskSchema, listTasksSchema, normalizeDateInput } from '../../src/mcp/tools/schemas';

describe('tool schemas', () => {
  it('validates create task with supported priority values only', () => {
    expect(
      createTaskSchema.parse({
        idempotencyKey: 'idem-1',
        projectId: 'project-1',
        title: 'test',
        priority: 5,
      }),
    ).toMatchObject({ priority: 5 });

    expect(() =>
      createTaskSchema.parse({
        idempotencyKey: 'idem-2',
        projectId: 'project-1',
        title: 'test',
        priority: 2,
      }),
    ).toThrow();
  });

  it('validates list task due filter values', () => {
    expect(listTasksSchema.parse({ dueFilter: 'today' })).toMatchObject({ dueFilter: 'today' });
    expect(() => listTasksSchema.parse({ dueFilter: 'next_month' })).toThrow();
  });

  it('normalizes valid dates to TickTick UTC offset format', () => {
    expect(normalizeDateInput('2026-02-08T10:30:00Z')).toBe('2026-02-08T10:30:00.000+0000');
  });
});
