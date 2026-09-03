import type { ApiErrorDto } from "@contracts/errors.js";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static fromDto(error: ApiErrorDto): ApiError {
    return new ApiError(error.code, error.message, error.retryable, error.details);
  }
}

export function messageOf(error: unknown): string {
  if (
    error instanceof ApiError && typeof error.details === "object" && error.details !== null &&
    "retryAfterMs" in error.details && typeof error.details.retryAfterMs === "number"
  ) {
    return `${error.message} 预计 ${Math.ceil(error.details.retryAfterMs / 1_000)} 秒后可重试。`;
  }
  return error instanceof Error ? error.message : "发生了未知错误。";
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && ["AUTH_EXPIRED", "AUTH_MISSING", "UNAUTHORIZED"].includes(error.code);
}
