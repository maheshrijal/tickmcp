import { z } from 'zod';
import { ValidationAppError } from '../../utils/errors';

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, 'idempotencyKey must contain only letters, numbers, :, _, -')
  .describe('Client-provided idempotency key for deduplicating mutating requests');

export const projectIdSchema = z.object({
  projectId: z.string().min(1).describe('TickTick project ID'),
});

const projectViewModeSchema = z
  .string()
  .min(1)
  .max(64)
  .describe('Project view mode (for example: list, kanban, timeline)')
  .optional();

const taskRepeatSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => value.startsWith('RRULE:'), {
    message: 'repeat must start with RRULE:',
  })
  .describe('Recurring rule in TickTick RRULE format (e.g. "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO")');

const createChecklistItemSchema = z.object({
  title: z.string().trim().min(1).describe('Checklist item title'),
  status: z.union([z.literal(0), z.literal(1)]).describe('Checklist item status (0=active, 1=completed)').optional(),
});

const updateChecklistItemSchema = createChecklistItemSchema.extend({
  id: z.string().min(1).describe('Checklist item ID').optional(),
});

export const createProjectSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  name: z.string().trim().min(1).max(512).describe('Project name'),
  color: z.string().trim().min(1).max(64).describe('Project color').optional(),
  viewMode: projectViewModeSchema,
});

export const updateProjectSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    projectId: z.string().min(1).describe('TickTick project ID'),
    name: z.string().trim().min(1).max(512).describe('Project name').optional(),
    color: z.string().trim().min(1).max(64).describe('Project color').optional(),
    viewMode: projectViewModeSchema,
  })
  .refine((value) => value.name !== undefined || value.color !== undefined || value.viewMode !== undefined, {
    message: 'At least one updatable field must be provided',
  });

const isoDateSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).valueOf()), {
    message: 'Invalid date format; expected ISO/RFC3339 date string',
  })
  .describe('Date in ISO 8601 format (e.g. "2025-03-15" or "2025-03-15T09:00:00Z")');

export const listTasksSchema = z.object({
  projectId: z.string().min(1).describe('TickTick project ID').optional(),
  status: z.number().int().describe('Task status filter (0=active, 2=completed)').optional(),
  dueFilter: z
    .enum(['today', 'tomorrow', 'overdue', 'this_week'])
    .describe('Filter tasks by due date: today, tomorrow, overdue, this_week')
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Maximum number of tasks to return (1-200, default: 50)')
    .optional(),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of tasks to skip for pagination (default: 0)')
    .optional(),
});

export const getTaskSchema = z.object({
  projectId: z.string().min(1).describe('TickTick project ID'),
  taskId: z.string().min(1).describe('TickTick task ID'),
});

export const createTaskSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  projectId: z.string().min(1).describe('TickTick project ID'),
  title: z.string().min(1).describe('Task title'),
  content: z.string().describe('Task body/notes in markdown').optional(),
  items: z.array(createChecklistItemSchema).max(500).describe('Checklist/subtask items').optional(),
  repeat: taskRepeatSchema.optional(),
  startDate: isoDateSchema.describe('Start date in ISO 8601 format').optional(),
  dueDate: isoDateSchema.describe('Due date in ISO 8601 format').optional(),
  priority: z
    .union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)])
    .describe('Priority: 0=none, 1=low, 3=medium, 5=high')
    .optional(),
});

export const updateTaskSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  projectId: z.string().min(1).describe('TickTick project ID'),
  taskId: z.string().min(1).describe('TickTick task ID'),
  title: z.string().min(1).describe('Task title').optional(),
  content: z.string().describe('Task body/notes in markdown').optional(),
  items: z.array(updateChecklistItemSchema).max(500).describe('Checklist/subtask items').optional(),
  repeat: taskRepeatSchema.optional(),
  startDate: isoDateSchema.describe('Start date in ISO 8601 format').optional(),
  dueDate: isoDateSchema.describe('Due date in ISO 8601 format').optional(),
  priority: z
    .union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)])
    .describe('Priority: 0=none, 1=low, 3=medium, 5=high')
    .optional(),
});

export const completeTaskSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  projectId: z.string().min(1).describe('TickTick project ID'),
  taskId: z.string().min(1).describe('TickTick task ID'),
});

export const deleteTaskSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  projectId: z.string().min(1).describe('TickTick project ID'),
  taskId: z.string().min(1).describe('TickTick task ID'),
});

export function normalizeDateInput(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ValidationAppError('Invalid ISO date string', { value });
  }

  // TickTick expects timezone offset in "+0000" form rather than "Z".
  return date.toISOString().replace('Z', '+0000');
}
