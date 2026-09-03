import type { ApiEnvelope } from "@contracts/errors.js";
import { DEFAULT_API_TIMEOUT_MS } from "@/config/constants.js";
import { ApiError } from "./errors.js";

export interface ApiRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal | undefined;
  timeoutMs?: number;
  keepalive?: boolean | undefined;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(new DOMException("请求超时。", "TimeoutError")),
    options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );
  const cancel = (): void => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const request: RequestInit = {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      signal: controller.signal,
      ...(options.keepalive === undefined ? {} : { keepalive: options.keepalive }),
      ...(options.body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }),
    };
    const response = await fetch(path, request);
    let envelope: ApiEnvelope<T>;
    try {
      envelope = await response.json() as ApiEnvelope<T>;
    } catch {
      throw new ApiError("INVALID_RESPONSE", `${path} 返回了无效数据。`, false);
    }
    if (!response.ok || !envelope.ok) {
      if (!envelope.ok) throw ApiError.fromDto(envelope.error);
      throw new ApiError("HTTP_ERROR", `${path} 请求失败。`, response.status >= 500);
    }
    return envelope.data;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}

export function callTool<T>(name: string, args: object, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/tools/${encodeURIComponent(name)}`, { body: args, signal });
}
