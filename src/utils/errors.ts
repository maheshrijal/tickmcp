import { ZodError } from 'zod';

export type ErrorCode =
  | 'TICKTICK_AUTH_REQUIRED'
  | 'MCP_RATE_LIMITED'
  | 'TICKTICK_RATE_LIMITED'
  | 'TICKTICK_API_ERROR'
  | 'TASK_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class TickTickAuthRequiredError extends AppError {
  constructor() {
    super('TICKTICK_AUTH_REQUIRED', 'TickTick authorization required — please re-authorize via your MCP client', 401);
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class TickTickApiError extends AppError {
  constructor(message: string, status = 502, details?: Record<string, unknown>) {
    super('TICKTICK_API_ERROR', message, status, details);
  }
}

export class TaskNotFoundError extends AppError {
  constructor(message = 'Task not found') {
    super('TASK_NOT_FOUND', message, 404);
  }
}

export class TickTickRateLimitError extends AppError {
  constructor(message = 'TickTick API rate limit exceeded') {
    super('TICKTICK_RATE_LIMITED', message, 429);
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ValidationAppError('Invalid tool input', {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
  }

  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', error.message, 500);
  }

  return new AppError('INTERNAL_ERROR', 'Unexpected internal error', 500);
}
