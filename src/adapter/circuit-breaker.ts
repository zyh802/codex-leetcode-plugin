import { AppError } from "../core/errors.js";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

export class AdapterCircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probeInFlight = false;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.cooldownMs ? "half-open" : "open";
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === "open" || (state === "half-open" && this.probeInFlight)) {
      const retryAfterMs = state === "open"
        ? Math.max(0, this.cooldownMs - (this.now() - (this.openedAt ?? this.now())))
        : this.cooldownMs;
      throw new AppError(
        "UPSTREAM_SCHEMA_CHANGED",
        "LeetCode adapter is temporarily paused after repeated schema failures; local catalog access remains available.",
        true,
        { circuitState: state, retryAfterMs },
      );
    }
    if (state === "half-open") this.probeInFlight = true;
    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      if (error instanceof AppError && error.code === "UPSTREAM_SCHEMA_CHANGED") this.recordSchemaFailure();
      else this.recordSuccess();
      throw error;
    } finally {
      if (state === "half-open") this.probeInFlight = false;
    }
  }

  private recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  private recordSchemaFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = this.now();
  }
}
