import { z } from 'zod';

const tickTickProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  sortOrder: z.number().optional(),
  closed: z.boolean().optional(),
  groupId: z.string().optional(),
  viewMode: z.string().optional(),
  permission: z.string().optional(),
  kind: z.string().optional(),
});

const tickTickTaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  content: z.string().optional(),
  desc: z.string().optional(),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  status: z.number().optional(),
  priority: z.number().optional(),
  sortOrder: z.number().optional(),
  timeZone: z.string().optional(),
  isAllDay: z.boolean().optional(),
  completedTime: z.string().optional(),
  createdTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const authStatusOutputSchema = {
  ok: z.boolean(),
  userId: z.string(),
  connected: z.boolean(),
  expiresAt: z.string().nullable().optional(),
  authUrl: z.string().nullable().optional(),
};

export const listProjectsOutputSchema = {
  ok: z.boolean(),
  projects: z.array(tickTickProjectSchema),
  count: z.number(),
};

export const getProjectOutputSchema = {
  ok: z.boolean(),
  project: tickTickProjectSchema,
};

export const listTasksOutputSchema = {
  ok: z.boolean(),
  tasks: z.array(tickTickTaskSchema),
  count: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
};

export const getTaskOutputSchema = {
  ok: z.boolean(),
  task: tickTickTaskSchema,
};

export const mutateTaskOutputSchema = {
  ok: z.boolean(),
  task: tickTickTaskSchema,
};

export const taskRefOutputSchema = {
  ok: z.boolean(),
  projectId: z.string(),
  taskId: z.string(),
};
