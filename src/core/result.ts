import { asAppError } from "./errors.js";

export type ToolResult<T> =
  | { ok: true; data: T; warnings?: string[] }
  | {
      ok: false;
      error: { code: string; message: string; retryable: boolean; details?: unknown };
    };

export async function toToolResult<T>(operation: () => Promise<T> | T): Promise<ToolResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    const appError = asAppError(error);
    return {
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        retryable: appError.retryable,
        ...(appError.details === undefined ? {} : { details: appError.details }),
      },
    };
  }
}
