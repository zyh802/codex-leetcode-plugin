import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LeetCodeDatabase } from "../src/storage/database.js";
import { SyncEngine } from "../src/sync/sync-engine.js";
import { AppError } from "../src/core/errors.js";

describe("SyncEngine", () => {
  it("synchronizes only the four catalogs and reaches READY", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-sync-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      const adapter = {
        getCatalog: vi.fn(async (category: "algorithms" | "database" | "shell" | "concurrency") => [{
          questionId: category,
          frontendId: category,
          slug: `${category}-problem`,
          title: `${category} problem`,
          difficulty: "Easy" as const,
          paidOnly: false,
          totalAccepted: 1,
          totalSubmitted: 2,
          status: null,
          category,
        }]),
        getQuestionDetail: vi.fn(),
      };
      const engine = new SyncEngine(database, adapter as never, () => undefined);

      const runId = engine.startFullSync();
      const status = await waitForReady(database, runId);

      expect(adapter.getCatalog).toHaveBeenCalledTimes(4);
      expect(adapter.getQuestionDetail).not.toHaveBeenCalled();
      expect(status).toMatchObject({
        state: "READY",
        catalogUnique: 4,
        catalogCategoriesTotal: 4,
        catalogCategoriesSynced: 4,
        failedCategories: 0,
        pendingCategories: 0,
      });
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves progress across rate-limit failure and resumes only unfinished categories", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-sync-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      let failedOnce = false;
      const adapter = {
        getCatalog: vi.fn(async (category: "algorithms" | "database" | "shell" | "concurrency") => {
          if (category === "database" && !failedOnce) {
            failedOnce = true;
            throw new AppError("RATE_LIMITED", "slow down", true, { retryAfterMs: 1 });
          }
          return [{
            questionId: category,
            frontendId: category,
            slug: `${category}-problem`,
            title: `${category} problem`,
            difficulty: "Easy" as const,
            paidOnly: false,
            totalAccepted: 1,
            totalSubmitted: 2,
            status: null,
            category,
          }];
        }),
      };
      const engine = new SyncEngine(database, adapter as never, () => undefined);
      const runId = engine.startFullSync();
      await waitForState(database, runId, "PARTIAL");
      await new Promise((resolve) => setTimeout(resolve, 0));

      engine.resume(runId);
      const status = await waitForReady(database, runId);
      expect(status.state).toBe("READY");
      expect(adapter.getCatalog.mock.calls.map(([category]) => category)).toEqual([
        "algorithms", "database", "database", "shell", "concurrency",
      ]);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("invalidates an expired session and can resume after login recovery", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-sync-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      const credentials = { session: "old-session", csrf: "old-csrf" };
      let signedIn = false;
      const adapter = {
        getCatalog: vi.fn(async (category: "algorithms" | "database" | "shell" | "concurrency") => {
          if (!signedIn) throw new AppError("AUTH_EXPIRED", "expired");
          return [{
            questionId: category,
            frontendId: category,
            slug: `${category}-problem`,
            title: `${category} problem`,
            difficulty: "Easy" as const,
            paidOnly: false,
            totalAccepted: null,
            totalSubmitted: null,
            status: null,
            category,
          }];
        }),
      };
      const invalidate = vi.fn();
      const engine = new SyncEngine(database, adapter as never, () => credentials, invalidate);
      const runId = engine.startFullSync();
      await waitForState(database, runId, "AUTH_REQUIRED");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(invalidate).toHaveBeenCalledWith(credentials);

      signedIn = true;
      engine.resume(runId);
      await waitForReady(database, runId);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

async function waitForReady(database: LeetCodeDatabase, runId: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = database.getSyncStatus(runId);
    if (status?.state === "READY") return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("catalog synchronization did not finish");
}

async function waitForState(database: LeetCodeDatabase, runId: number, state: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = database.getSyncStatus(runId);
    if (status?.state === state) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`catalog synchronization did not reach ${state}`);
}
