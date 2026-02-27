import { Props } from '../auth/props';
import { refreshTickTickToken } from '../auth/ticktick-upstream';
import { Env } from '../types/env';
import { TickTickChecklistItem, TickTickProject, TickTickProjectColumn, TickTickTask, TickTickTaskKind } from '../types/models';
import { TaskNotFoundError, TickTickApiError, TickTickAuthRequiredError, TickTickRateLimitError, ValidationAppError } from '../utils/errors';

export type TaskDueFilter = 'today' | 'tomorrow' | 'overdue' | 'this_week';
export type TaskSortBy = 'createdTime' | 'modifiedTime' | 'dueDate' | 'priority' | 'title' | 'sortOrder';
export type SortDirection = 'asc' | 'desc';

type TickTickPriority = 0 | 1 | 3 | 5;

export interface ListTasksInput {
  projectId?: string;
  status?: 0;
  dueFilter?: TaskDueFilter;
  dueDateFrom?: string;
  dueDateTo?: string;
  priority?: TickTickPriority;
  sortBy?: TaskSortBy;
  sortOrder?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  content?: string;
  desc?: string;
  isAllDay?: boolean;
  timeZone?: string;
  reminders?: string[];
  sortOrder?: number;
  kind?: TickTickTaskKind;
  items?: TickTickChecklistItem[];
  repeat?: string;
  repeatFlag?: string;
  startDate?: string;
  dueDate?: string;
  priority?: TickTickPriority;
}

export interface UpdateTaskInput {
  projectId: string;
  taskId: string;
  title?: string;
  content?: string;
  desc?: string;
  isAllDay?: boolean;
  timeZone?: string;
  reminders?: string[];
  sortOrder?: number;
  kind?: TickTickTaskKind;
  items?: TickTickChecklistItem[];
  repeat?: string;
  repeatFlag?: string;
  startDate?: string;
  dueDate?: string;
  priority?: TickTickPriority;
}

export type TaskItemPatchOperation =
  | {
      op: 'add';
      item: TickTickChecklistItem;
      index?: number;
    }
  | {
      op: 'update';
      id: string;
      item: Partial<Omit<TickTickChecklistItem, 'id'>>;
    }
  | {
      op: 'remove';
      id: string;
    }
  | {
      op: 'toggle';
      id: string;
    };

export interface PatchTaskItemsInput {
  projectId: string;
  taskId: string;
  operations: TaskItemPatchOperation[];
}

export interface CreateProjectInput {
  name: string;
  color?: string;
  viewMode?: string;
  sortOrder?: number;
  kind?: 'TASK' | 'NOTE';
}

export interface UpdateProjectInput {
  projectId: string;
  name?: string;
  color?: string;
  viewMode?: string;
  sortOrder?: number;
  kind?: 'TASK' | 'NOTE';
}

export interface TickTickProjectDataEnvelope {
  project: TickTickProject;
  tasks: TickTickTask[];
  columns: TickTickProjectColumn[];
}

interface TickTickProjectDataResponse {
  project?: TickTickProject;
  tasks?: TickTickTask[];
  columns?: TickTickProjectColumn[];
}

const MAX_PROJECTS_FETCH = 25;
const MAX_BACKOFF_RETRIES = 3;
const BACKOFF_BASE_MS = 150;
const REQUEST_TIMEOUT_MS = 8_000;
const TOKEN_KV_TTL_SECONDS = 60 * 60 * 24 * 30;
const ACTIVE_TASK_IDS_CACHE_TTL_MS = 5_000;
const DELETED_TASK_TOMBSTONE_TTL_SECONDS = 60 * 60 * 24 * 30;

interface PersistedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope?: string;
  updatedAt: string;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function jitteredBackoffMs(attempt: number): number {
  const base = BACKOFF_BASE_MS * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the calendar date (YYYY-MM-DD) from a TickTick date string.
 * TickTick dates include timezone offsets (e.g. "2026-02-08T10:00:00.000+0530"),
 * so we extract the date portion directly rather than converting through UTC.
 */
function extractCalendarDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function getTodayInTimeZone(tz?: string): string {
  try {
    if (tz) {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      return parts;
    }
  } catch {
    // fall through to UTC
  }
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function matchesDueFilter(task: TickTickTask, filter: TaskDueFilter): boolean {
  if (!task.dueDate) {
    return false;
  }

  const dueDate = extractCalendarDate(task.dueDate);
  const today = getTodayInTimeZone(task.timeZone);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  const weekLater = addDays(today, 7);

  switch (filter) {
    case 'today':
      return dueDate === today;
    case 'tomorrow':
      return dueDate >= tomorrow && dueDate < dayAfterTomorrow;
    case 'overdue':
      return dueDate < today;
    case 'this_week':
      return dueDate >= today && dueDate < weekLater;
    default:
      return false;
  }
}

function toCalendarDateFromIsoInput(value: string, fieldName: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new ValidationAppError(`Invalid ISO date string for ${fieldName}`, { [fieldName]: value });
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeTaskRecurrence(task: TickTickTask): TickTickTask {
  const repeatFlag = task.repeatFlag ?? task.repeat;
  if (!repeatFlag) {
    return task;
  }
  return {
    ...task,
    repeatFlag,
    repeat: repeatFlag,
  };
}

function resolveRepeatFlagInput(repeat?: string, repeatFlag?: string): string | undefined {
  const trimmedRepeat = repeat?.trim();
  const trimmedRepeatFlag = repeatFlag?.trim();

  if (trimmedRepeat && !trimmedRepeat.startsWith('RRULE:')) {
    throw new ValidationAppError('repeat must start with RRULE:', { repeat });
  }
  if (trimmedRepeatFlag && !trimmedRepeatFlag.startsWith('RRULE:')) {
    throw new ValidationAppError('repeatFlag must start with RRULE:', { repeatFlag });
  }
  if (trimmedRepeat && trimmedRepeatFlag && trimmedRepeat !== trimmedRepeatFlag) {
    throw new ValidationAppError('repeat and repeatFlag must match when both are provided', {
      repeat: trimmedRepeat,
      repeatFlag: trimmedRepeatFlag,
    });
  }

  return trimmedRepeatFlag ?? trimmedRepeat;
}

function compareStrings(left: string | undefined, right: string | undefined): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return left.localeCompare(right);
}

function compareNumbers(left: number | undefined, right: number | undefined): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return left - right;
}

export class TickTickClient {
  private accessToken: string = '';
  private storedRefreshToken: string | null = null;
  private tokenExpiresAt: string | null = null;
  private tokenScope: string = '';
  private hydratedFromKv = false;
  private readonly activeTaskIdsCache = new Map<string, { ids: Set<string>; expiresAt: number }>();

  constructor(
    private readonly env: Env,
    private readonly props: Props,
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {}

  private get baseUrl(): string {
    return this.env.TICKTICK_BASE_URL ?? 'https://api.ticktick.com/open/v1';
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private get tokensKvKey(): string {
    return `ticktick_tokens:${this.props.userId}`;
  }

  private deletedTaskKvKey(projectId: string, taskId: string): string {
    return `ticktick_deleted_task:${this.props.userId}:${projectId}:${taskId}`;
  }

  private async markTaskDeleted(projectId: string, taskId: string): Promise<void> {
    try {
      await this.env.OAUTH_KV.put(this.deletedTaskKvKey(projectId, taskId), '1', {
        expirationTtl: DELETED_TASK_TOMBSTONE_TTL_SECONDS,
      });
    } catch (error) {
      console.warn('Failed to persist deleted-task tombstone', {
        userId: this.props.userId,
        projectId,
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async isTaskTombstoned(projectId: string, taskId: string): Promise<boolean> {
    try {
      const marker = await this.env.OAUTH_KV.get(this.deletedTaskKvKey(projectId, taskId));
      return marker === '1';
    } catch (error) {
      console.warn('Failed to read deleted-task tombstone', {
        userId: this.props.userId,
        projectId,
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async hydrateTokensFromKv(): Promise<void> {
    if (this.hydratedFromKv) {
      return;
    }
    this.hydratedFromKv = true;

    const raw = await this.env.OAUTH_KV.get(this.tokensKvKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedTokens;
      if (parsed.accessToken) {
        this.accessToken = parsed.accessToken;
      }
      this.storedRefreshToken = parsed.refreshToken ?? this.storedRefreshToken;
      this.tokenExpiresAt = parsed.expiresAt ?? this.tokenExpiresAt;
      if (parsed.scope) {
        this.tokenScope = parsed.scope;
      }
    } catch {
      // Ignore malformed persisted token payloads.
    }
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) {
      return false;
    }
    return new Date(this.tokenExpiresAt).getTime() <= Date.now();
  }

  private getExpiresAt(expiresIn?: number): string | null {
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) {
      return null;
    }
    return new Date(Date.now() + Math.max(0, expiresIn - 30) * 1000).toISOString();
  }

  private isInvalidGrantError(error: TickTickApiError): boolean {
    const body = error.details?.body;
    if (body && typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if (record.error === 'invalid_grant') {
        return true;
      }
    }

    const responseBody = error.details?.responseBody;
    return typeof responseBody === 'string' && responseBody.includes('invalid_grant');
  }

  private async persistTokensToKv(): Promise<void> {
    const payload: PersistedTokens = {
      accessToken: this.accessToken,
      refreshToken: this.storedRefreshToken,
      expiresAt: this.tokenExpiresAt,
      scope: this.tokenScope,
      updatedAt: new Date().toISOString(),
    };
    await this.env.OAUTH_KV.put(this.tokensKvKey, JSON.stringify(payload), {
      expirationTtl: TOKEN_KV_TTL_SECONDS,
    });
  }

  private async doRefreshToken(): Promise<void> {
    if (!this.storedRefreshToken) {
      throw new TickTickAuthRequiredError();
    }

    try {
      const refreshed = await refreshTickTickToken(this.storedRefreshToken, this.env, this.fetchImpl);
      this.accessToken = refreshed.access_token;
      this.storedRefreshToken = refreshed.refresh_token ?? this.storedRefreshToken;
      this.tokenExpiresAt = this.getExpiresAt(refreshed.expires_in);
      if (refreshed.scope) {
        this.tokenScope = refreshed.scope;
      }
      await this.persistTokensToKv();
    } catch (error) {
      if (error instanceof TickTickApiError && this.isInvalidGrantError(error)) {
        throw new TickTickAuthRequiredError();
      }
      throw error;
    }
  }

  private async refreshToken(): Promise<void> {
    const lockKey = `ticktick_refresh_lock:${this.props.userId}`;
    const previousToken = this.accessToken;

    const existing = await this.env.OAUTH_KV.get(lockKey);
    if (existing) {
      await sleep(300);
      this.hydratedFromKv = false;
      await this.hydrateTokensFromKv();
      if (this.accessToken !== previousToken) {
        return;
      }
    }

    await this.env.OAUTH_KV.put(lockKey, '1', { expirationTtl: 30 });
    try {
      this.hydratedFromKv = false;
      await this.hydrateTokensFromKv();
      if (this.accessToken !== previousToken) {
        return;
      }
      await this.doRefreshToken();
    } finally {
      await this.env.OAUTH_KV.delete(lockKey);
    }
  }

  private async callApi<T>(params: {
    path: string;
    method?: 'GET' | 'POST' | 'DELETE';
    body?: unknown;
  }): Promise<T> {
    const method = params.method ?? 'GET';
    await this.hydrateTokensFromKv();

    if (!this.accessToken) {
      throw new TickTickAuthRequiredError();
    }

    // Proactively refresh if token is expired
    if (this.isTokenExpired()) {
      await this.refreshToken();
    }

    let attempts = 0;
    let refreshedAfterUnauthorized = false;
    while (attempts < MAX_BACKOFF_RETRIES) {
      attempts += 1;
      let response: Response;
      try {
        response = await this.fetchWithTimeout(this.buildUrl(params.path), {
          method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: params.body ? JSON.stringify(params.body) : undefined,
        });
      } catch (error) {
        if (attempts < MAX_BACKOFF_RETRIES) {
          await sleep(jitteredBackoffMs(attempts));
          continue;
        }
        throw new TickTickApiError('TickTick API request failed due to timeout or network error', 502, {
          path: params.path,
          cause: error instanceof Error ? error.message : String(error),
        });
      }

      if (response.status === 401) {
        // Try refresh once on 401 to avoid refresh loops.
        if (refreshedAfterUnauthorized) {
          throw new TickTickAuthRequiredError();
        }
        await this.refreshToken();
        refreshedAfterUnauthorized = true;
        continue;
      }

      if (!response.ok) {
        const responseBody = await response.text();

        if (shouldRetryStatus(response.status) && attempts < MAX_BACKOFF_RETRIES) {
          const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
          await sleep(retryAfterMs ?? jitteredBackoffMs(attempts));
          continue;
        }

        if (response.status === 429) {
          throw new TickTickRateLimitError();
        }

        throw new TickTickApiError(`TickTick API request failed (${response.status})`, response.status, {
          path: params.path,
          responseBody,
        });
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = (await response.text()).trim();
      if (!text) {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    }

    throw new TickTickApiError('TickTick API request retries exhausted', 502);
  }

  private invalidateActiveTaskCache(projectId: string): void {
    this.activeTaskIdsCache.delete(projectId);
  }

  private normalizeTask(task: TickTickTask): TickTickTask {
    return normalizeTaskRecurrence(task);
  }

  private normalizeTasks(tasks: TickTickTask[]): TickTickTask[] {
    return tasks.map((task) => this.normalizeTask(task));
  }

  private async getActiveTaskIds(projectId: string, forceRefresh = false): Promise<{ ids: Set<string>; fromCache: boolean }> {
    const cached = this.activeTaskIdsCache.get(projectId);
    const now = Date.now();
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return { ids: cached.ids, fromCache: true };
    }

    const projectData = await this.callApi<TickTickProjectDataResponse>({ path: `/project/${projectId}/data` });
    const ids = new Set(
      (projectData.tasks ?? [])
        .filter((candidate) => typeof candidate.status !== 'number' || candidate.status === 0)
        .map((candidate) => candidate.id),
    );
    this.activeTaskIdsCache.set(projectId, { ids, expiresAt: now + ACTIVE_TASK_IDS_CACHE_TTL_MS });
    return { ids, fromCache: false };
  }

  async listProjects(): Promise<TickTickProject[]> {
    return this.callApi<TickTickProject[]>({ path: '/project' });
  }

  async getProject(projectId: string): Promise<TickTickProject> {
    return this.callApi<TickTickProject>({ path: `/project/${projectId}` });
  }

  async createProject(input: CreateProjectInput): Promise<TickTickProject> {
    try {
      return await this.callApi<TickTickProject>({
        path: '/project',
        method: 'POST',
        body: {
          name: input.name,
          color: input.color,
          viewMode: input.viewMode,
          sortOrder: input.sortOrder,
          kind: input.kind,
        },
      });
    } catch (error) {
      if (!(error instanceof TickTickApiError)) {
        throw error;
      }

      const responseBody = error.details?.responseBody;
      const isUnknownException =
        typeof responseBody === 'string' &&
        responseBody.includes('"errorCode":"unknown_exception"') &&
        error.details?.path === '/project';

      if (!isUnknownException) {
        throw error;
      }

      let projectCount: number | undefined;
      try {
        projectCount = (await this.listProjects()).length;
      } catch {
        // keep original unknown_exception if count lookup fails
      }

      throw new ValidationAppError(
        projectCount === undefined
          ? 'TickTick rejected project creation with unknown_exception. This may be due to account project limits or upstream issues.'
          : `TickTick rejected project creation with unknown_exception. Current project count is ${projectCount}; this may indicate account project limits.`,
        {
          projectCount,
          upstreamError: responseBody,
        },
      );
    }
  }

  async updateProject(input: UpdateProjectInput): Promise<TickTickProject> {
    return this.callApi<TickTickProject>({
      path: `/project/${input.projectId}`,
      method: 'POST',
      body: {
        name: input.name,
        color: input.color,
        viewMode: input.viewMode,
        sortOrder: input.sortOrder,
        kind: input.kind,
      },
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.callApi<void>({
      path: `/project/${projectId}`,
      method: 'DELETE',
    });
  }

  async getProjectData(projectId: string): Promise<TickTickProjectDataEnvelope> {
    const data = await this.callApi<TickTickProjectDataResponse>({ path: `/project/${projectId}/data` });
    const project = data.project;
    if (!project) {
      throw new TickTickApiError('TickTick API returned project data without project payload', 502, { projectId });
    }

    return {
      project,
      tasks: this.normalizeTasks(data.tasks ?? []),
      columns: data.columns ?? [],
    };
  }

  async listTasks(input: ListTasksInput): Promise<{ tasks: TickTickTask[]; total: number }> {
    if (input.status !== undefined && input.status !== 0) {
      throw new ValidationAppError('status=2 is not supported for ticktick_list_tasks; only status=0 is supported', {
        status: input.status,
      });
    }

    const collectFromProject = async (projectId: string): Promise<TickTickTask[]> => {
      const data = await this.callApi<TickTickProjectDataResponse>({ path: `/project/${projectId}/data` });
      return this.normalizeTasks(data.tasks ?? []);
    };

    let tasks: TickTickTask[] = [];
    if (input.projectId) {
      tasks = await collectFromProject(input.projectId);
    } else {
      const projects = await this.listProjects();
      const capped = projects.slice(0, MAX_PROJECTS_FETCH);
      for (const project of capped) {
        const projectTasks = await collectFromProject(project.id);
        tasks.push(...projectTasks);
      }
    }

    if (typeof input.status === 'number') {
      tasks = tasks.filter((task) => task.status === input.status);
    }

    if (input.dueFilter) {
      tasks = tasks.filter((task) => matchesDueFilter(task, input.dueFilter!));
    }

    if (input.priority !== undefined) {
      tasks = tasks.filter((task) => task.priority === input.priority);
    }

    const dueDateFrom = input.dueDateFrom ? toCalendarDateFromIsoInput(input.dueDateFrom, 'dueDateFrom') : undefined;
    const dueDateTo = input.dueDateTo ? toCalendarDateFromIsoInput(input.dueDateTo, 'dueDateTo') : undefined;
    if (dueDateFrom && dueDateTo && dueDateFrom > dueDateTo) {
      throw new ValidationAppError('dueDateFrom must be less than or equal to dueDateTo', { dueDateFrom, dueDateTo });
    }
    if (dueDateFrom || dueDateTo) {
      tasks = tasks.filter((task) => {
        if (!task.dueDate) {
          return false;
        }
        const taskDate = extractCalendarDate(task.dueDate);
        if (dueDateFrom && taskDate < dueDateFrom) {
          return false;
        }
        if (dueDateTo && taskDate > dueDateTo) {
          return false;
        }
        return true;
      });
    }

    if (input.sortBy) {
      const direction = input.sortOrder === 'desc' ? -1 : 1;
      tasks = [...tasks].sort((left, right) => {
        let result = 0;
        switch (input.sortBy) {
          case 'title':
            result = compareStrings(left.title, right.title);
            break;
          case 'priority':
            result = compareNumbers(left.priority, right.priority);
            break;
          case 'sortOrder':
            result = compareNumbers(left.sortOrder, right.sortOrder);
            break;
          case 'dueDate':
            result = compareStrings(left.dueDate ? extractCalendarDate(left.dueDate) : undefined, right.dueDate ? extractCalendarDate(right.dueDate) : undefined);
            break;
          case 'createdTime':
            result = compareStrings(left.createdTime, right.createdTime);
            break;
          case 'modifiedTime':
            result = compareStrings(left.modifiedTime, right.modifiedTime);
            break;
          default:
            result = 0;
        }
        return result * direction;
      });
    }

    const total = tasks.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 50;
    const paginated = tasks.slice(offset, offset + limit);

    return { tasks: paginated, total };
  }

  async getTask(projectId: string, taskId: string): Promise<TickTickTask> {
    if (await this.isTaskTombstoned(projectId, taskId)) {
      throw new TaskNotFoundError();
    }

    const task = await this.callApi<TickTickTask>({ path: `/project/${projectId}/task/${taskId}` });

    // TickTick can sometimes resolve deleted task IDs here. Enforce MCP contract:
    // active tasks must still exist in the project's active task set.
    if (typeof task.status !== 'number' || task.status === 0) {
      let { ids, fromCache } = await this.getActiveTaskIds(projectId);
      if (fromCache) {
        // Always revalidate cached membership before accepting active-task reads.
        // This avoids returning tasks deleted outside this client during cache TTL.
        ({ ids } = await this.getActiveTaskIds(projectId, true));
      }
      if (!ids.has(taskId)) {
        throw new TaskNotFoundError();
      }
    }

    return this.normalizeTask(task);
  }

  async createTask(input: CreateTaskInput): Promise<TickTickTask> {
    const repeatFlag = resolveRepeatFlagInput(input.repeat, input.repeatFlag);
    const task = await this.callApi<TickTickTask>({
      path: '/task',
      method: 'POST',
      body: {
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        desc: input.desc,
        isAllDay: input.isAllDay,
        timeZone: input.timeZone,
        reminders: input.reminders,
        sortOrder: input.sortOrder,
        kind: input.kind,
        items: input.items,
        repeatFlag,
        startDate: input.startDate,
        dueDate: input.dueDate,
        priority: input.priority,
      },
    });
    this.invalidateActiveTaskCache(input.projectId);
    return this.normalizeTask(task);
  }

  async updateTask(input: UpdateTaskInput): Promise<TickTickTask> {
    const repeatFlag = resolveRepeatFlagInput(input.repeat, input.repeatFlag);
    const task = await this.callApi<TickTickTask>({
      path: `/task/${input.taskId}`,
      method: 'POST',
      body: {
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        desc: input.desc,
        isAllDay: input.isAllDay,
        timeZone: input.timeZone,
        reminders: input.reminders,
        sortOrder: input.sortOrder,
        kind: input.kind,
        items: input.items,
        repeatFlag,
        startDate: input.startDate,
        dueDate: input.dueDate,
        priority: input.priority,
      },
    });
    this.invalidateActiveTaskCache(input.projectId);
    return this.normalizeTask(task);
  }

  async patchTaskItems(input: PatchTaskItemsInput): Promise<TickTickTask> {
    const task = await this.getTask(input.projectId, input.taskId);
    const items = [...(task.items ?? [])];

    for (const operation of input.operations) {
      if (operation.op === 'add') {
        const nextItem = { ...operation.item };
        if (!nextItem.title || nextItem.title.trim().length === 0) {
          throw new ValidationAppError('add item operation requires a non-empty title');
        }
        if (operation.index === undefined) {
          items.push(nextItem);
          continue;
        }
        if (!Number.isInteger(operation.index) || operation.index < 0 || operation.index > items.length) {
          throw new ValidationAppError('add item index is out of range', { index: operation.index });
        }
        items.splice(operation.index, 0, nextItem);
        continue;
      }

      const targetIndex = items.findIndex((item) => item.id === operation.id);
      if (targetIndex < 0) {
        throw new ValidationAppError(`Unknown checklist item id "${operation.id}"`, { id: operation.id });
      }

      if (operation.op === 'remove') {
        items.splice(targetIndex, 1);
        continue;
      }

      if (operation.op === 'toggle') {
        const current = items[targetIndex].status === 1 ? 1 : 0;
        items[targetIndex] = { ...items[targetIndex], status: current === 1 ? 0 : 1 };
        continue;
      }

      items[targetIndex] = {
        ...items[targetIndex],
        ...operation.item,
      };
    }

    return this.updateTask({
      projectId: input.projectId,
      taskId: input.taskId,
      items,
    });
  }

  async completeTask(projectId: string, taskId: string): Promise<void> {
    await this.callApi<void>({
      path: `/project/${projectId}/task/${taskId}/complete`,
      method: 'POST',
    });
    this.invalidateActiveTaskCache(projectId);
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await this.callApi<void>({
      path: `/project/${projectId}/task/${taskId}`,
      method: 'DELETE',
    });
    this.invalidateActiveTaskCache(projectId);
    await this.markTaskDeleted(projectId, taskId);
  }
}
