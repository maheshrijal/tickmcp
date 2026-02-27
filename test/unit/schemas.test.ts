import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  createTaskSchema,
  listTasksSchema,
  normalizeDateInput,
  patchTaskItemsSchema,
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

  it('validates list task status supports only active status=0', () => {
    expect(listTasksSchema.parse({ status: 0 })).toMatchObject({ status: 0 });
    expect(() => listTasksSchema.parse({ status: 2 })).toThrow();
  });

  it('normalizes valid dates to TickTick UTC offset format', () => {
    expect(normalizeDateInput('2026-02-08T10:30:00Z')).toBe('2026-02-08T10:30:00.000+0000');
  });

  it('normalizes non-UTC offsets to TickTick UTC offset format', () => {
    expect(normalizeDateInput('2026-02-08T10:30:00-05:00')).toBe('2026-02-08T15:30:00.000+0000');
  });

  it('accepts recurrence via repeat and repeatFlag aliases', () => {
    expect(
      createTaskSchema.parse({
        idempotencyKey: 'idem-repeat-1',
        projectId: 'project-1',
        title: 'test',
        repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
      }),
    ).toMatchObject({ repeat: 'RRULE:FREQ=DAILY;INTERVAL=1' });

    expect(
      createTaskSchema.parse({
        idempotencyKey: 'idem-repeat-1b',
        projectId: 'project-1',
        title: 'test',
        repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      }),
    ).toMatchObject({ repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' });

    expect(() =>
      createTaskSchema.parse({
        idempotencyKey: 'idem-repeat-2',
        projectId: 'project-1',
        title: 'test',
        repeat: 'FREQ=DAILY;INTERVAL=1',
      }),
    ).toThrow();
  });

  it('rejects conflicting repeat and repeatFlag values', () => {
    expect(() =>
      updateTaskSchema.parse({
        idempotencyKey: 'idem-repeat-conflict',
        projectId: 'project-1',
        taskId: 'task-1',
        repeat: 'RRULE:FREQ=DAILY;INTERVAL=1',
        repeatFlag: 'RRULE:FREQ=WEEKLY;INTERVAL=1',
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

  it('validates extended task fields (reminders/timezone/kind/isAllDay/sortOrder)', () => {
    expect(
      createTaskSchema.parse({
        idempotencyKey: 'idem-task-fields-1',
        projectId: 'project-1',
        title: 'test',
        reminders: ['TRIGGER:P0DT0H30M0S'],
        timeZone: 'America/New_York',
        kind: 'CHECKLIST',
        isAllDay: false,
        sortOrder: 42,
      }),
    ).toMatchObject({
      reminders: ['TRIGGER:P0DT0H30M0S'],
      timeZone: 'America/New_York',
      kind: 'CHECKLIST',
      isAllDay: false,
      sortOrder: 42,
    });
  });

  it('validates patch task items operation schema', () => {
    expect(
      patchTaskItemsSchema.parse({
        idempotencyKey: 'idem-patch-1',
        projectId: 'project-1',
        taskId: 'task-1',
        operations: [
          { op: 'add', item: { title: 'new item' } },
          { op: 'toggle', id: 'item-1' },
          { op: 'remove', id: 'item-2' },
          { op: 'update', id: 'item-3', item: { status: 1 } },
        ],
      }),
    ).toMatchObject({
      operations: [
        { op: 'add' },
        { op: 'toggle', id: 'item-1' },
        { op: 'remove', id: 'item-2' },
        { op: 'update', id: 'item-3' },
      ],
    });

    expect(() =>
      patchTaskItemsSchema.parse({
        idempotencyKey: 'idem-patch-2',
        projectId: 'project-1',
        taskId: 'task-1',
        operations: [{ op: 'update', id: 'item-3', item: {} }],
      }),
    ).toThrow();
  });

  it('validates project create and update schemas', () => {
    expect(
      createProjectSchema.parse({
        idempotencyKey: 'idem-project-1',
        name: 'Work',
        color: '#4f46e5',
        sortOrder: 10,
        kind: 'TASK',
      }),
    ).toMatchObject({ name: 'Work', sortOrder: 10, kind: 'TASK' });

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
        kind: 'NOTE',
      }),
    ).toMatchObject({ viewMode: 'kanban', kind: 'NOTE' });
  });
});
