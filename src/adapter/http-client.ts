import { AppError } from "../core/errors.js";

export interface HttpClientOptions {
  baseUrl: string;
  requestIntervalMs: number;
  timeoutMs?: number;
}

export interface SessionCredentials {
  session: string;
  csrf: string;
}

export interface RequestContext {
  credentials?: SessionCredentials;
  referer?: string;
}

export class HttpClient {
  private nextRequestAt = 0;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async getJson(path: string, context: RequestContext = {}): Promise<unknown> {
    return this.requestJson(path, { method: "GET" }, context);
  }

  async postJson(path: string, body: unknown, context: RequestContext = {}): Promise<unknown> {
    return this.requestJson(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }, context);
  }

  private async requestJson(path: string, init: RequestInit, context: RequestContext): Promise<unknown> {
    await this.waitForRateLimit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const authHeaders = context.credentials === undefined
        ? {}
        : {
            cookie: `LEETCODE_SESSION=${context.credentials.session}; csrftoken=${context.credentials.csrf}`,
            "x-csrftoken": context.credentials.csrf,
            "x-requested-with": "XMLHttpRequest",
          };
      const response = await fetch(new URL(path, this.options.baseUrl), {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "codex-leecode-plugin/0.1.0",
          referer: context.referer ?? `${this.options.baseUrl}/problemset/`,
          ...authHeaders,
          ...init.headers,
        },
      });
      if (response.status === 429) {
        throw new AppError("RATE_LIMITED", "LeetCode rate limit reached.", true, {
          retryAfter: response.headers.get("retry-after"),
        });
      }
      if (response.status === 401 || response.status === 403) {
        throw new AppError("AUTH_EXPIRED", "LeetCode authentication is missing or expired.");
      }
      if (response.status >= 500) {
        throw new AppError("UPSTREAM_5XX", `LeetCode returned HTTP ${response.status}.`, true);
      }
      if (!response.ok) {
        throw new AppError("UPSTREAM_SCHEMA_CHANGED", `Unexpected LeetCode HTTP ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
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

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const delay = Math.max(0, this.nextRequestAt - now);
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + this.options.requestIntervalMs;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
