import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseJudgeResult } from "../src/adapter/leetcode-cn.js";
import { RemoteJudgeService } from "../src/judge/remote-judge-service.js";
import { LeetCodeDatabase } from "../src/storage/database.js";
import { WorkspaceManager } from "../src/workspace/workspace-manager.js";

describe("judge result normalization", () => {
  it("requires all acceptance invariants", () => {
    expect(parseJudgeResult({
      state: "SUCCESS",
      status_msg: "Accepted",
      run_success: true,
      total_correct: 12,
      total_testcases: 12,
      status_runtime: "1 ms",
      status_memory: "10 MB",
    })).toMatchObject({ terminal: true, accepted: true, passedTestcases: 12, totalTestcases: 12 });

    expect(parseJudgeResult({
      state: "SUCCESS",
      status_msg: "Accepted",
      run_success: false,
      total_correct: 12,
      total_testcases: 12,
    }).accepted).toBe(false);
  });
});

describe("RemoteJudgeService confirmation", () => {
  it("invalidates confirmation when code changes", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-judge-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const workspaces = new WorkspaceManager(database);
      const workspace = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const adapter = { submitRemote: vi.fn() };
      const sessions = { getRequiredCredentials: () => ({ session: "secret", csrf: "secret" }) };
      const judge = new RemoteJudgeService(database, adapter as never, sessions as never, workspaces);
      const confirmation = judge.prepareSubmission(workspace.filePath);
      writeFileSync(workspace.filePath, "changed code", "utf8");

      await expect(judge.submit(workspace.filePath, confirmation.confirmationToken))
        .rejects.toThrow("changed after confirmation");
      expect(adapter.submitRemote).not.toHaveBeenCalled();
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function seedProblem(database: LeetCodeDatabase): void {
  database.upsertCatalog([{
    questionId: "1", frontendId: "1", slug: "two-sum", title: "Two Sum",
    difficulty: "Easy", paidOnly: false, totalAccepted: 1, totalSubmitted: 2,
    status: null, category: "algorithms",
  }]);
}

function solutionTemplate() {
  return {
    problemId: 1,
    questionId: "1",
    frontendId: "1",
    slug: "two-sum",
    title: "Two Sum",
    langSlug: "typescript",
    langName: "TypeScript",
    starterCode: "function twoSum() {}",
  };
}
