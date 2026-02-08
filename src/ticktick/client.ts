import { Props } from '../auth/props';
import { refreshTickTickToken } from '../auth/ticktick-upstream';
import { Env } from '../types/env';
import { TickTickProject, TickTickTask } from '../types/models';
import { TickTickApiError, TickTickAuthRequiredError, TickTickRateLimitError } from '../utils/errors';

export type TaskDueFilter = 'today' | 'tomorrow' | 'overdue' | 'this_week';

export interface ListTasksInput {
  projectId?: string;
  status?: number;
  dueFilter?: TaskDueFilter;
  limit?: number;
  offset?: number;
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  content?: string;
  startDate?: string;
  dueDate?: string;
  priority?: 0 | 1 | 3 | 5;
}

export interface UpdateTaskInput {
  projectId: string;
  taskId: string;
  title?: string;
  content?: string;
  startDate?: string;
  dueDate?: string;
  priority?: 0 | 1 | 3 | 5;
}

interface TickTickProjectDataResponse {
  project?: TickTickProject;
  tasks?: TickTickTask[];
}

const MAX_PROJECTS_FETCH = 25;
const MAX_BACKOFF_RETRIES = 3;
const BACKOFF_BASE_MS = 150;
const REQUEST_TIMEOUT_MS = 8_000;
const TOKEN_KV_TTL_SECONDS = 60 * 60 * 24 * 30;

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

function matchesDueFilter(task: TickTickTask, filter: TaskDueFilter): boolean {
  if (!task.dueDate) {
    return false;
  }

  const now = new Date();
  const due = new Date(task.dueDate);

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(startOfDay);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);
  const weekLater = new Date(startOfDay);
  weekLater.setUTCDate(weekLater.getUTCDate() + 7);

  switch (filter) {
    case 'today':
      return due >= startOfDay && due < tomorrow;
    case 'tomorrow':
      return due >= tomorrow && due < dayAfterTomorrow;
    case 'overdue':
      return due < now;
    case 'this_week':
      return due >= startOfDay && due < weekLater;
    default:
      return false;
  }
}

export class TickTickClient {
  private accessToken: string = '';
  private storedRefreshToken: string | null = null;
  private tokenExpiresAt: string | null = null;
  private tokenScope: string = '';
  private hydratedFromKv = false;

  constructor(
    private readonly env: Env,
    private readonly props: Props,
    private readonly fetchImpl: typeof fetch = fetch,
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

      return (await response.json()) as T;
    }

    throw new TickTickApiError('TickTick API request retries exhausted', 502);
  }

  async listProjects(): Promise<TickTickProject[]> {
    return this.callApi<TickTickProject[]>({ path: '/project' });
  }

  async getProject(projectId: string): Promise<TickTickProject> {
    return this.callApi<TickTickProject>({ path: `/project/${projectId}` });
  }

  async listTasks(input: ListTasksInput): Promise<{ tasks: TickTickTask[]; total: number }> {
    const collectFromProject = async (projectId: string): Promise<TickTickTask[]> => {
      const data = await this.callApi<TickTickProjectDataResponse>({ path: `/project/${projectId}/data` });
      return data.tasks ?? [];
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

    const total = tasks.length;
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 50;
    const paginated = tasks.slice(offset, offset + limit);

    return { tasks: paginated, total };
  }

  async getTask(projectId: string, taskId: string): Promise<TickTickTask> {
    return this.callApi<TickTickTask>({ path: `/project/${projectId}/task/${taskId}` });
  }

  async createTask(input: CreateTaskInput): Promise<TickTickTask> {
    return this.callApi<TickTickTask>({
      path: '/task',
      method: 'POST',
      body: {
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        startDate: input.startDate,
        dueDate: input.dueDate,
        priority: input.priority,
      },
    });
  }

  async updateTask(input: UpdateTaskInput): Promise<TickTickTask> {
    return this.callApi<TickTickTask>({
      path: `/task/${input.taskId}`,
      method: 'POST',
      body: {
        projectId: input.projectId,
        title: input.title,
        content: input.content,
        startDate: input.startDate,
        dueDate: input.dueDate,
        priority: input.priority,
      },
    });
  }

  async completeTask(projectId: string, taskId: string): Promise<void> {
    await this.callApi<void>({
      path: `/project/${projectId}/task/${taskId}/complete`,
      method: 'POST',
    });
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await this.callApi<void>({
      path: `/project/${projectId}/task/${taskId}`,
      method: 'DELETE',
    });
  }
}
