export type ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_EXPIRED"
  | "BROWSER_LOGIN_UNAVAILABLE"
  | "AUTH_FLOW_NOT_FOUND"
  | "PERMISSION_LOCKED"
  | "RATE_LIMITED"
  | "NETWORK_TIMEOUT"
  | "UPSTREAM_5XX"
  | "UPSTREAM_SCHEMA_CHANGED"
  | "SYNC_INCOMPLETE"
  | "PROBLEM_NOT_FOUND_LOCAL"
  | "SOLUTION_IDENTITY_CONFLICT"
  | "LANGUAGE_UNSUPPORTED"
  | "FILE_NOT_FOUND"
  | "JUDGE_TIMEOUT"
  | "JUDGE_POLL_CANCELLED"
  | "SUBMIT_OUTCOME_UNKNOWN"
  | "SUBMIT_CONFIRMATION_REQUIRED"
  | "FILE_CHANGED_AFTER_CONFIRM"
  | "FILE_CHANGED_DURING_EDIT"
  | "CONTEST_GUARD_ACTIVE"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : "Unknown internal error",
    false,
  );
}
