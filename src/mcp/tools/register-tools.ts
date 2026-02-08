import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Props } from '../../auth/props';
import { AuditEventsRepository } from '../../db/repositories';
import { guardIdempotency } from '../../security/idempotency';
import { TickTickClient } from '../../ticktick/client';
import { Env } from '../../types/env';
import { AppError } from '../../utils/errors';
import {
  completeTaskSchema,
  createTaskSchema,
  deleteTaskSchema,
  getTaskSchema,
  idempotencyKeySchema,
  listTasksSchema,
  normalizeDateInput,
  projectIdSchema,
  updateTaskSchema,
} from './schemas';
import {
  authStatusOutputSchema,
  getProjectOutputSchema,
  getTaskOutputSchema,
  listProjectsOutputSchema,
  listTasksOutputSchema,
  mutateTaskOutputSchema,
  taskRefOutputSchema,
} from './output-schemas';
import { toolError, toolSuccess } from './response';

async function withAudit<T>(
  auditRepo: AuditEventsRepository,
  userId: string,
  eventType: string,
  operation: () => Promise<T>,
): Promise<T> {
  const writeAudit = async (params: { status: string; detail?: string }): Promise<void> => {
    try {
      await auditRepo.insert({
        userId,
        eventType,
        status: params.status,
        detail: params.detail,
      });
    } catch (auditError) {
      console.warn('Audit insert failed', {
        userId,
        eventType,
        status: params.status,
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
  };

  try {
    const result = await operation();
    await writeAudit({ status: 'success' });
    return result;
  } catch (error) {
    await writeAudit({
      status: 'error',
      detail: error instanceof Error ? error.message : 'unknown error',
    });
    throw error;
  }
}

async function enforceRateLimit(env: Env, userId: string): Promise<void> {
  const outcome = await env.MCP_RATE_LIMITER.limit({ key: `user:${userId}` });
  if (!outcome.success) {
    throw new AppError('MCP_RATE_LIMITED', 'MCP request rate limit exceeded', 429, {
      userId,
    });
  }
}

export function registerTickTickTools(server: McpServer, env: Env, props: Props): void {
  const auditRepo = new AuditEventsRepository(env.DB);
  const client = new TickTickClient(env, props);

  server.registerTool(
    'ticktick_auth_status',
    {
      title: 'Check TickTick Auth Status',
      description: `Check the TickTick OAuth connection status for the current user.

Returns: { ok, userId, connected, expiresAt }
- connected is always true (user is authenticated via OAuth).

Use when: "Am I connected to TickTick?" or before making TickTick calls to verify auth status.

Errors:
  - INTERNAL_ERROR: Unexpected failure checking connection status`,
      inputSchema: {},
      outputSchema: authStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        await enforceRateLimit(env, props.userId);
        return toolSuccess(
          {
            code: 'OK',
            userId: props.userId,
            connected: true,
            expiresAt: props.tickTickExpiresAt,
            authUrl: null,
          },
          `TickTick is connected for user ${props.userId}`,
        );
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_list_projects',
    {
      title: 'List TickTick Projects',
      description: `List all TickTick projects (lists/folders) for the current user.

Returns: { ok, projects: [{ id, name, color?, sortOrder?, closed? }], count }

Use when: "Show my TickTick lists" or to discover project IDs before creating/listing tasks.

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick`,
      inputSchema: {},
      outputSchema: listProjectsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_list_projects', async () => {
          const projects = await client.listProjects();
          return toolSuccess({ projects, count: projects.length }, `Found ${projects.length} projects`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_get_project',
    {
      title: 'Get TickTick Project',
      description: `Get a specific TickTick project by its ID.

Args:
  - projectId: The TickTick project ID (use ticktick_list_projects to find IDs)

Returns: { ok, project: { id, name, color?, sortOrder?, closed? } }

Use when: "Get details about my Work project" — requires a projectId from ticktick_list_projects.

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid projectId`,
      inputSchema: {
        projectId: z.string().min(1).describe('TickTick project ID'),
      },
      outputSchema: getProjectOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_get_project', async () => {
          const parsed = projectIdSchema.parse(input);
          const project = await client.getProject(parsed.projectId);
          return toolSuccess({ project }, `Project: ${project.name}`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_list_tasks',
    {
      title: 'List TickTick Tasks',
      description: `List TickTick tasks, optionally filtered by project, status, or due date. Supports pagination via limit/offset.

Args:
  - projectId: Optional project ID to filter by (recommended for faster results)
  - status: Optional task status filter (0=active, 2=completed)
  - dueFilter: Optional due date filter: today, tomorrow, overdue, this_week
  - limit: Max tasks to return, 1-200 (default: 50)
  - offset: Number of tasks to skip for pagination (default: 0)

Returns: { ok, tasks, count, total, hasMore }

Use when: "What are my tasks due today?" -> dueFilter="today"
Use when: "Show all tasks in my Work project" -> projectId="<id>"
Use when: "List completed tasks" -> status=2
Without projectId, fetches tasks across all projects (up to 25 projects).

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid filter parameters`,
      inputSchema: {
        projectId: z.string().min(1).describe('TickTick project ID to filter by').optional(),
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
      },
      outputSchema: listTasksOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_list_tasks', async () => {
          const parsed = listTasksSchema.parse(input);
          const { tasks, total } = await client.listTasks(parsed);
          const offset = parsed.offset ?? 0;
          const limit = parsed.limit ?? 50;
          const hasMore = offset + tasks.length < total;
          return toolSuccess(
            { tasks, count: tasks.length, total, hasMore },
            `Found ${total} tasks (returning ${tasks.length} from offset ${offset})`,
          );
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_get_task',
    {
      title: 'Get TickTick Task',
      description: `Get a specific TickTick task by project ID and task ID.

Args:
  - projectId: The project the task belongs to
  - taskId: The task ID

Returns: { ok, task: { id, projectId, title, content?, dueDate?, startDate?, status, priority } }

Use when: "Show me the details of task X" — requires both projectId and taskId from ticktick_list_tasks.

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid input parameters`,
      inputSchema: {
        projectId: z.string().min(1).describe('TickTick project ID'),
        taskId: z.string().min(1).describe('TickTick task ID'),
      },
      outputSchema: getTaskOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_get_task', async () => {
          const parsed = getTaskSchema.parse(input);
          const task = await client.getTask(parsed.projectId, parsed.taskId);
          return toolSuccess({ task }, `Task: ${task.title}`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_create_task',
    {
      title: 'Create TickTick Task',
      description: `Create a new task in a TickTick project.

Args:
  - idempotencyKey: Required unique key for safely deduplicating retries
  - projectId: The project to create the task in (use ticktick_list_projects to find IDs)
  - title: Task title (required)
  - content: Optional markdown body/notes
  - startDate: Optional ISO 8601 date (e.g. "2025-03-15" or "2025-03-15T09:00:00Z")
  - dueDate: Optional ISO 8601 due date
  - priority: 0 (none), 1 (low), 3 (medium), 5 (high)

Returns: { ok, task }

Use when: "Add a task to buy groceries due tomorrow" -> title="Buy groceries", dueDate="2026-02-09"
Use when: "Create a high-priority task in my Work project" -> priority=5, projectId="<id>"

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid input parameters`,
      inputSchema: {
        idempotencyKey: idempotencyKeySchema,
        projectId: z.string().min(1).describe('TickTick project ID'),
        title: z.string().min(1).describe('Task title'),
        content: z.string().describe('Task body/notes in markdown').optional(),
        startDate: z.string().describe('Start date in ISO 8601 format').optional(),
        dueDate: z.string().describe('Due date in ISO 8601 format').optional(),
        priority: z
          .union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)])
          .describe('Priority: 0=none, 1=low, 3=medium, 5=high')
          .optional(),
      },
      outputSchema: mutateTaskOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_create_task', async () => {
          const parsed = createTaskSchema.parse(input);
          await guardIdempotency(env, props.userId, 'ticktick_create_task', parsed.idempotencyKey);
          const { idempotencyKey: _idempotencyKey, ...taskInput } = parsed;
          const task = await client.createTask({
            ...taskInput,
            startDate: normalizeDateInput(taskInput.startDate),
            dueDate: normalizeDateInput(taskInput.dueDate),
          });
          return toolSuccess({ task }, `Created task ${task.id}`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_update_task',
    {
      title: 'Update TickTick Task',
      description: `Update an existing TickTick task's fields. Only provided fields are changed.

Args:
  - idempotencyKey: Required unique key for safely deduplicating retries
  - projectId: The project the task belongs to
  - taskId: The task to update
  - title: New task title
  - content: New markdown body/notes
  - startDate: New start date in ISO 8601 format
  - dueDate: New due date in ISO 8601 format
  - priority: 0 (none), 1 (low), 3 (medium), 5 (high)

Returns: { ok, task }

Use when: "Change the due date of task X to Friday" -> dueDate="2026-02-13"
Use when: "Rename task X to 'Updated title'" -> title="Updated title"

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid input parameters`,
      inputSchema: {
        idempotencyKey: idempotencyKeySchema,
        projectId: z.string().min(1).describe('TickTick project ID'),
        taskId: z.string().min(1).describe('TickTick task ID'),
        title: z.string().min(1).describe('Task title').optional(),
        content: z.string().describe('Task body/notes in markdown').optional(),
        startDate: z.string().describe('Start date in ISO 8601 format').optional(),
        dueDate: z.string().describe('Due date in ISO 8601 format').optional(),
        priority: z
          .union([z.literal(0), z.literal(1), z.literal(3), z.literal(5)])
          .describe('Priority: 0=none, 1=low, 3=medium, 5=high')
          .optional(),
      },
      outputSchema: mutateTaskOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_update_task', async () => {
          const parsed = updateTaskSchema.parse(input);
          await guardIdempotency(env, props.userId, 'ticktick_update_task', parsed.idempotencyKey);
          const { idempotencyKey: _idempotencyKey, ...taskInput } = parsed;
          const task = await client.updateTask({
            ...taskInput,
            startDate: normalizeDateInput(taskInput.startDate),
            dueDate: normalizeDateInput(taskInput.dueDate),
          });
          return toolSuccess({ task }, `Updated task ${task.id}`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_complete_task',
    {
      title: 'Complete TickTick Task',
      description: `Mark a TickTick task as complete.

Args:
  - idempotencyKey: Required unique key for safely deduplicating retries
  - projectId: The project the task belongs to
  - taskId: The task to complete

Returns: { ok, projectId, taskId }

Use when: "Mark the grocery task as done" or "Complete task X".

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid input parameters`,
      inputSchema: {
        idempotencyKey: idempotencyKeySchema,
        projectId: z.string().min(1).describe('TickTick project ID'),
        taskId: z.string().min(1).describe('TickTick task ID'),
      },
      outputSchema: taskRefOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_complete_task', async () => {
          const parsed = completeTaskSchema.parse(input);
          await guardIdempotency(env, props.userId, 'ticktick_complete_task', parsed.idempotencyKey);
          await client.completeTask(parsed.projectId, parsed.taskId);
          return toolSuccess({ projectId: parsed.projectId, taskId: parsed.taskId }, `Completed task ${parsed.taskId}`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'ticktick_delete_task',
    {
      title: 'Delete TickTick Task',
      description: `Permanently delete a TickTick task. This action cannot be undone.

Args:
  - idempotencyKey: Required unique key for safely deduplicating retries
  - projectId: The project the task belongs to
  - taskId: The task to delete

Returns: { ok, projectId, taskId }

Use when: "Delete task X" — prefer ticktick_complete_task if the user just wants to mark it done.

Errors:
  - TICKTICK_AUTH_REQUIRED: User needs to re-authorize TickTick
  - VALIDATION_ERROR: Invalid input parameters`,
      inputSchema: {
        idempotencyKey: idempotencyKeySchema,
        projectId: z.string().min(1).describe('TickTick project ID'),
        taskId: z.string().min(1).describe('TickTick task ID'),
      },
      outputSchema: taskRefOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        await enforceRateLimit(env, props.userId);
        return await withAudit(auditRepo, props.userId, 'ticktick_delete_task', async () => {
          const parsed = deleteTaskSchema.parse(input);
          await guardIdempotency(env, props.userId, 'ticktick_delete_task', parsed.idempotencyKey);
          await client.deleteTask(parsed.projectId, parsed.taskId);
          return toolSuccess({ projectId: parsed.projectId, taskId: parsed.taskId }, `Deleted task ${parsed.taskId}`);
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );
}
