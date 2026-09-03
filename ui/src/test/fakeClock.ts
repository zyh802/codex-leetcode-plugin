import { vi } from "vitest";

export function installFakeClock(now = new Date("2026-09-03T00:00:00Z")): void {
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

export function restoreClock(): void {
  vi.useRealTimers();
}
