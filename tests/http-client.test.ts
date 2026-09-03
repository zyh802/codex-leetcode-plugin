import { describe, expect, it, vi } from "vitest";
import { AdapterCircuitBreaker } from "../src/adapter/circuit-breaker.js";
import { HttpClient, parseRetryAfter } from "../src/adapter/http-client.js";
import { AppError } from "../src/core/errors.js";

describe("HttpClient retries", () => {
  it("honors Retry-After before retrying an idempotent request", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn(async () => undefined);
    const client = new HttpClient({
      baseUrl: "https://leetcode.cn",
      requestIntervalMs: 0,
      maxRetries: 1,
      fetchImpl,
      sleep,
    });

    await expect(client.getJson("/api/problems/algorithms/")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000, undefined);
  });

  it("uses exponential backoff with jitter for transient failures", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn(async () => undefined);
    const client = new HttpClient({
      baseUrl: "https://leetcode.cn",
      requestIntervalMs: 0,
      maxRetries: 1,
      retryBaseDelayMs: 500,
      random: () => 0.5,
      fetchImpl,
      sleep,
    });

    await client.getJson("/graphql/");
    expect(sleep).toHaveBeenCalledWith(500, undefined);
  });

  it("never retries an unsafe POST and marks its outcome unknown", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("socket closed"));
    const client = new HttpClient({
      baseUrl: "https://leetcode.cn",
      requestIntervalMs: 0,
      maxRetries: 3,
      fetchImpl,
    });

    const error = await client.postJson("/problems/two-sum/submit/", {}).catch((value: unknown) => value);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details).toMatchObject({ outcome: "unknown" });
  });

  it("parses both Retry-After formats", () => {
    expect(parseRetryAfter("3", 0)).toBe(3_000);
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:00:10 GMT", 4_000)).toBe(6_000);
  });
});

describe("AdapterCircuitBreaker", () => {
  it("opens after consecutive schema failures and recovers through one half-open probe", async () => {
    let now = 100;
    const breaker = new AdapterCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000, now: () => now });
    const failing = vi.fn(async () => {
      throw new AppError("UPSTREAM_SCHEMA_CHANGED", "changed");
    });

    await expect(breaker.execute(failing)).rejects.toThrow("changed");
    await expect(breaker.execute(failing)).rejects.toThrow("changed");
    expect(breaker.getState()).toBe("open");
    await expect(breaker.execute(failing)).rejects.toThrow("temporarily paused");
    expect(failing).toHaveBeenCalledTimes(2);

    now = 1_100;
    await expect(breaker.execute(async () => "restored")).resolves.toBe("restored");
    expect(breaker.getState()).toBe("closed");
  });
});
