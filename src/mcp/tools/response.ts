import { AppError, toAppError } from '../../utils/errors';

export interface ToolSuccessResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: false;
}

export interface ToolErrorResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

export type ToolResult = ToolSuccessResult | ToolErrorResult;

export function toolSuccess(data: Record<string, unknown>, message?: string): ToolSuccessResult {
  return {
    content: [{ type: 'text', text: message ?? JSON.stringify(data, null, 2) }],
    structuredContent: {
      ok: true,
      ...data,
    },
  };
}

export function toolError(error: unknown): ToolErrorResult {
  const appError: AppError = toAppError(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: false,
            code: appError.code,
            message: appError.message,
            details: appError.details,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
