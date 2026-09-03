export interface ApiErrorDto {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T; warnings?: string[] }
  | { ok: false; error: ApiErrorDto };
