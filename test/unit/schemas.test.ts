import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  createTaskSchema,
  listTasksSchema,
  normalizeDateInput,
  updateProjectSchema,
  updateTaskSchema,
} from '../../src/mcp/tools/schemas';

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

  it('normalizes non-UTC offsets to TickTick UTC offset format', () => {
    expect(normalizeDateInput('2026-02-08T10:30:00-05:00')).toBe('2026-02-08T15:30:00.000+0000');
  });

  it('validates repeat requires RRULE prefix', () => {
    expect(
      createTaskSchema.parse({
        idempotencyKey: 'idem-repeat-1',
        projectId: 'project-1',
        title: 'test',
        repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
      }),
    ).toMatchObject({ repeat: 'RRULE:FREQ=DAILY;INTERVAL=1' });

    expect(() =>
      createTaskSchema.parse({
        idempotencyKey: 'idem-repeat-2',
        projectId: 'project-1',
        title: 'test',
        repeat: 'FREQ=DAILY;INTERVAL=1',
      }),
    ).toThrow();
  });

  it('validates checklist item status values for create and update', () => {
    expect(
      createTaskSchema.parse({
        idempotencyKey: 'idem-items-1',
        projectId: 'project-1',
        title: 'test',
        items: [{ title: 'a', status: 0 }, { title: 'b', status: 1 }],
      }),
    ).toMatchObject({ items: [{ title: 'a', status: 0 }, { title: 'b', status: 1 }] });

    expect(() =>
      createTaskSchema.parse({
        idempotencyKey: 'idem-items-2',
        projectId: 'project-1',
        title: 'test',
        items: [{ title: 'a', status: 2 }],
      }),
    ).toThrow();

    expect(
      updateTaskSchema.parse({
        idempotencyKey: 'idem-items-3',
        projectId: 'project-1',
        taskId: 'task-1',
        items: [{ id: 'item-1', title: 'a', status: 1 }],
      }),
    ).toMatchObject({ items: [{ id: 'item-1', title: 'a', status: 1 }] });
  });

  it('validates project create and update schemas', () => {
    expect(
      createProjectSchema.parse({
        idempotencyKey: 'idem-project-1',
        name: 'Work',
        color: '#4f46e5',
      }),
    ).toMatchObject({ name: 'Work' });

    expect(() =>
      updateProjectSchema.parse({
        idempotencyKey: 'idem-project-2',
        projectId: 'project-1',
      }),
    ).toThrow();

    expect(
      updateProjectSchema.parse({
        idempotencyKey: 'idem-project-3',
        projectId: 'project-1',
        viewMode: 'kanban',
      }),
    ).toMatchObject({ viewMode: 'kanban' });
  });
});
