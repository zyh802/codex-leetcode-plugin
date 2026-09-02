import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LeetCodeDatabase } from "../src/storage/database.js";
import { SyncEngine } from "../src/sync/sync-engine.js";

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
});

async function waitForReady(database: LeetCodeDatabase, runId: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = database.getSyncStatus(runId);
    if (status?.state === "READY") return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("catalog synchronization did not finish");
}
