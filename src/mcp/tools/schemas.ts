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

const recurringRuleSchema = (fieldName: 'repeat' | 'repeatFlag') =>
  z
    .string()
    .trim()
    .min(1)
    .max(512)
    .refine((value) => value.startsWith('RRULE:'), {
      message: `${fieldName} must start with RRULE:`,
    })
    .describe(`Recurring rule in TickTick RRULE format (must start with "RRULE:")`);

const isoDateSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).valueOf()), {
    message: 'Invalid date format; expected ISO/RFC3339 date string',
  })
  .describe('Date in ISO 8601 format (e.g. "2025-03-15" or "2025-03-15T09:00:00Z")');

const tickTickPrioritySchema = z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)]);
const checklistItemStatusSchema = z.union([z.literal(0), z.literal(1)]);

const checklistItemShape = {
  title: z.string().trim().min(1).describe('Checklist item title'),
  status: checklistItemStatusSchema.describe('Checklist item status (0=active, 1=completed)').optional(),
  completedTime: isoDateSchema.describe('Checklist item completed time in ISO 8601 format').optional(),
  sortOrder: z.number().describe('Checklist item sort order').optional(),
  isAllDay: z.boolean().describe('Whether checklist item is all-day').optional(),
  startDate: isoDateSchema.describe('Checklist item start date in ISO 8601 format').optional(),
  dueDate: isoDateSchema.describe('Checklist item due date in ISO 8601 format').optional(),
  timeZone: z.string().min(1).max(128).describe('IANA timezone, e.g. "America/New_York"').optional(),
};

const createChecklistItemSchema = z.object(checklistItemShape);
const updateChecklistItemSchema = createChecklistItemSchema.extend({
  id: z.string().min(1).describe('Checklist item ID').optional(),
});

const repeatInputSchema = z.object({
  repeat: recurringRuleSchema('repeat').optional(),
  repeatFlag: recurringRuleSchema('repeatFlag').optional(),
});

function withRepeatCompatibility<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.superRefine((value, ctx) => {
    if (value.repeat && value.repeatFlag && value.repeat !== value.repeatFlag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'repeat and repeatFlag must match when both are provided',
        path: ['repeatFlag'],
      });
    }
  });
}

export const createProjectSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  name: z.string().trim().min(1).max(512).describe('Project name'),
  color: z.string().trim().min(1).max(64).describe('Project color').optional(),
  viewMode: projectViewModeSchema,
  sortOrder: z.number().describe('Project sort order').optional(),
  kind: z.enum(['TASK', 'NOTE']).describe('Project kind').optional(),
});

export const updateProjectSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    projectId: z.string().min(1).describe('TickTick project ID'),
    name: z.string().trim().min(1).max(512).describe('Project name').optional(),
    color: z.string().trim().min(1).max(64).describe('Project color').optional(),
    viewMode: projectViewModeSchema,
    sortOrder: z.number().describe('Project sort order').optional(),
    kind: z.enum(['TASK', 'NOTE']).describe('Project kind').optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.color !== undefined ||
      value.viewMode !== undefined ||
      value.sortOrder !== undefined ||
      value.kind !== undefined,
    {
      message: 'At least one updatable field must be provided',
    },
  );

export const deleteProjectSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  projectId: z.string().min(1).describe('TickTick project ID'),
});

export const getProjectDataSchema = z.object({
  projectId: z.string().min(1).describe('TickTick project ID'),
});

export const listTasksSchema = z
  .object({
    projectId: z.string().min(1).describe('TickTick project ID').optional(),
    status: z.literal(0).describe('Task status filter (0=active)').optional(),
    dueFilter: z
      .enum(['today', 'tomorrow', 'overdue', 'this_week'])
      .describe('Filter tasks by due date: today, tomorrow, overdue, this_week')
      .optional(),
    dueDateFrom: isoDateSchema.describe('Lower bound due date in ISO 8601 format').optional(),
    dueDateTo: isoDateSchema.describe('Upper bound due date in ISO 8601 format').optional(),
    priority: tickTickPrioritySchema.describe('Filter by task priority: 0=none, 1=low, 3=medium, 5=high').optional(),
    sortBy: z
      .enum(['createdTime', 'modifiedTime', 'dueDate', 'priority', 'title', 'sortOrder'])
      .describe('Sort field')
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).describe('Sort order').optional(),
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
  })
  .superRefine((value, ctx) => {
    if (value.dueDateFrom && value.dueDateTo && new Date(value.dueDateFrom).valueOf() > new Date(value.dueDateTo).valueOf()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dueDateFrom must be less than or equal to dueDateTo',
        path: ['dueDateTo'],
      });
    }
  });

export const getTaskSchema = z.object({
  projectId: z.string().min(1).describe('TickTick project ID'),
  taskId: z.string().min(1).describe('TickTick task ID'),
});

const taskMutationShape = {
  title: z.string().min(1).describe('Task title').optional(),
  content: z.string().describe('Task body/notes in markdown').optional(),
  desc: z.string().describe('Task plain-text description').optional(),
  isAllDay: z.boolean().describe('Whether task is all-day').optional(),
  timeZone: z.string().trim().min(1).max(128).describe('IANA timezone, e.g. "America/New_York"').optional(),
  reminders: z.array(z.string().trim().min(1)).max(20).describe('Task reminders list').optional(),
  sortOrder: z.number().describe('Task sort order').optional(),
  kind: z.enum(['TEXT', 'NOTE', 'CHECKLIST']).describe('Task kind').optional(),
  startDate: isoDateSchema.describe('Start date in ISO 8601 format').optional(),
  dueDate: isoDateSchema.describe('Due date in ISO 8601 format').optional(),
  priority: tickTickPrioritySchema.describe('Priority: 0=none, 1=low, 3=medium, 5=high').optional(),
};

export const createTaskSchema = withRepeatCompatibility(
  z.object({
    idempotencyKey: idempotencyKeySchema,
    projectId: z.string().min(1).describe('TickTick project ID'),
    title: z.string().min(1).describe('Task title'),
    content: taskMutationShape.content,
    desc: taskMutationShape.desc,
    isAllDay: taskMutationShape.isAllDay,
    timeZone: taskMutationShape.timeZone,
    reminders: taskMutationShape.reminders,
    sortOrder: taskMutationShape.sortOrder,
    kind: taskMutationShape.kind,
    items: z.array(createChecklistItemSchema).max(500).describe('Checklist/subtask items').optional(),
    ...repeatInputSchema.shape,
    startDate: taskMutationShape.startDate,
    dueDate: taskMutationShape.dueDate,
    priority: taskMutationShape.priority,
  }),
);

const updateTaskSchemaBase = withRepeatCompatibility(
  z.object({
    idempotencyKey: idempotencyKeySchema,
    projectId: z.string().min(1).describe('TickTick project ID'),
    taskId: z.string().min(1).describe('TickTick task ID'),
    title: taskMutationShape.title,
    content: taskMutationShape.content,
    desc: taskMutationShape.desc,
    isAllDay: taskMutationShape.isAllDay,
    timeZone: taskMutationShape.timeZone,
    reminders: taskMutationShape.reminders,
    sortOrder: taskMutationShape.sortOrder,
    kind: taskMutationShape.kind,
    items: z.array(updateChecklistItemSchema).max(500).describe('Checklist/subtask items').optional(),
    ...repeatInputSchema.shape,
    startDate: taskMutationShape.startDate,
    dueDate: taskMutationShape.dueDate,
    priority: taskMutationShape.priority,
  }),
);

export const updateTaskSchema = updateTaskSchemaBase.refine(
  (value) =>
    value.title !== undefined ||
    value.content !== undefined ||
    value.desc !== undefined ||
    value.isAllDay !== undefined ||
    value.timeZone !== undefined ||
    value.reminders !== undefined ||
    value.sortOrder !== undefined ||
    value.kind !== undefined ||
    value.items !== undefined ||
    value.repeat !== undefined ||
    value.repeatFlag !== undefined ||
    value.startDate !== undefined ||
    value.dueDate !== undefined ||
    value.priority !== undefined,
  {
    message: 'At least one task field must be provided',
  },
);

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

const patchChecklistItemFieldsSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    status: checklistItemStatusSchema.optional(),
    completedTime: isoDateSchema.optional(),
    sortOrder: z.number().optional(),
    isAllDay: z.boolean().optional(),
    startDate: isoDateSchema.optional(),
    dueDate: isoDateSchema.optional(),
    timeZone: z.string().trim().min(1).max(128).optional(),
  })
  .refine((value) => Object.values(value).some((candidate) => candidate !== undefined), {
    message: 'update item operation requires at least one field',
  });

export const patchTaskItemsSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  projectId: z.string().min(1).describe('TickTick project ID'),
  taskId: z.string().min(1).describe('TickTick task ID'),
  operations: z
    .array(
      z.union([
        z.object({
          op: z.literal('add'),
          item: createChecklistItemSchema,
          index: z.number().int().min(0).describe('Insert position (0-based)').optional(),
        }),
        z.object({
          op: z.literal('update'),
          id: z.string().min(1).describe('Checklist item ID'),
          item: patchChecklistItemFieldsSchema,
        }),
        z.object({
          op: z.literal('remove'),
          id: z.string().min(1).describe('Checklist item ID'),
        }),
        z.object({
          op: z.literal('toggle'),
          id: z.string().min(1).describe('Checklist item ID'),
        }),
      ]),
    )
    .min(1)
    .max(500)
    .describe('Checklist item patch operations'),
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
