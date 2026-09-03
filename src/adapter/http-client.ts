import { AppError } from "../core/errors.js";

export interface HttpClientOptions {
  baseUrl: string;
  requestIntervalMs: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface SessionCredentials {
  session: string;
  csrf: string;
}

export interface RequestContext {
  credentials?: SessionCredentials;
  referer?: string;
  retry?: "safe" | "none";
  signal?: AbortSignal;
}

export class HttpClient {
  private nextRequestAt = 0;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly options: HttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? abortableDelay;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  async getJson(path: string, context: RequestContext = {}): Promise<unknown> {
    return this.requestJson(path, { method: "GET" }, { retry: "safe", ...context });
  }

  async postJson(path: string, body: unknown, context: RequestContext = {}): Promise<unknown> {
    return this.requestJson(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }, { retry: "none", ...context });
  }

  private async requestJson(path: string, init: RequestInit, context: RequestContext): Promise<unknown> {
    const retrySafe = context.retry === "safe";
    let lastError: AppError | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await this.requestJsonOnce(path, init, context);
      } catch (error) {
        const appError = error instanceof AppError
          ? error
          : new AppError("NETWORK_TIMEOUT", error instanceof Error ? error.message : "Network request failed.", true);
        lastError = retrySafe ? appError : withUnknownOutcome(appError, init.method ?? "GET");
        if (!retrySafe || !appError.retryable || attempt >= this.maxRetries) throw lastError;
        const retryAfterMs = readRetryAfterMs(appError.details);
        if (retryAfterMs !== null && retryAfterMs > this.retryMaxDelayMs) throw lastError;
        await this.sleep(retryAfterMs ?? this.backoffDelay(attempt), context.signal);
      }
    }
    throw lastError ?? new AppError("NETWORK_TIMEOUT", "LeetCode network request failed.", true);
  }

  private async requestJsonOnce(path: string, init: RequestInit, context: RequestContext): Promise<unknown> {
    await this.waitForRateLimit(context.signal);
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort("timeout"), this.timeoutMs);
    const signal = context.signal === undefined
      ? timeoutController.signal
      : AbortSignal.any([timeoutController.signal, context.signal]);
    try {
      const authHeaders = context.credentials === undefined
        ? {}
        : {
            cookie: `LEETCODE_SESSION=${context.credentials.session}; csrftoken=${context.credentials.csrf}`,
            "x-csrftoken": context.credentials.csrf,
            "x-requested-with": "XMLHttpRequest",
          };
      const response = await this.fetchImpl(new URL(path, this.options.baseUrl), {
        ...init,
        signal,
        headers: {
          accept: "application/json",
          "user-agent": "codex-leecode-plugin/0.1.0",
          referer: context.referer ?? `${this.options.baseUrl}/problemset/`,
          ...authHeaders,
          ...init.headers,
        },
      });
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        throw new AppError("RATE_LIMITED", "LeetCode rate limit reached.", true, {
          retryAfter,
          retryAfterMs: parseRetryAfter(retryAfter, this.now()),
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new AppError("AUTH_EXPIRED", "LeetCode authentication is missing or expired.");
      }
      if (response.status >= 500) {
        throw new AppError("UPSTREAM_5XX", `LeetCode returned HTTP ${response.status}.`, true, {
          status: response.status,
        });
      }
      if (!response.ok) {
        throw new AppError("UPSTREAM_SCHEMA_CHANGED", `Unexpected LeetCode HTTP ${response.status}.`, false, {
          status: response.status,
        });
      }
      try {
        return await response.json();
      } catch {
        throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode returned invalid JSON.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (context.signal?.aborted) {
        throw new AppError("JUDGE_POLL_CANCELLED", "The local judge polling request was cancelled.");
      }
      if (timeoutController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new AppError("NETWORK_TIMEOUT", "LeetCode request timed out.", true);
      }
      throw new AppError(
        "NETWORK_TIMEOUT",
        error instanceof Error ? error.message : "LeetCode network request failed.",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private backoffDelay(attempt: number): number {
    const exponential = Math.min(this.retryBaseDelayMs * (2 ** attempt), this.retryMaxDelayMs);
    const jitter = 0.8 + this.random() * 0.4;
    return Math.max(0, Math.round(exponential * jitter));
  }

  private async waitForRateLimit(signal?: AbortSignal): Promise<void> {
    const now = this.now();
    const delay = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + this.options.requestIntervalMs;
    if (delay > 0) await this.sleep(delay, signal);
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

function readRetryAfterMs(details: unknown): number | null {
  if (typeof details !== "object" || details === null || !("retryAfterMs" in details)) return null;
  const value = details.retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function withUnknownOutcome(error: AppError, method: string): AppError {
  if (method.toUpperCase() !== "POST" || !error.retryable) return error;
  return new AppError(error.code, error.message, error.retryable, {
    ...(typeof error.details === "object" && error.details !== null ? error.details : {}),
    outcome: "unknown",
  });
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AppError("JUDGE_POLL_CANCELLED", "Polling was cancelled."));
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = (): void => {
      clearTimeout(timer);
      reject(new AppError("JUDGE_POLL_CANCELLED", "Polling was cancelled."));
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
