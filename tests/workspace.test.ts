import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LeetCodeDatabase } from "../src/storage/database.js";
import { WorkspaceManager, extractCodeRegion } from "../src/workspace/workspace-manager.js";

describe("WorkspaceManager", () => {
  it("creates a solution once and never overwrites user code", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-workspace-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const manager = new WorkspaceManager(database);
      const first = manager.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      expect(first.created).toBe(true);
      writeFileSync(first.filePath, "const userCode = true;", "utf8");

      const second = manager.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      expect(second.created).toBe(false);
      expect(readFileSync(second.filePath, "utf8")).toBe("const userCode = true;");
      expect(manager.resolveSolution(second.filePath)).toMatchObject({
        problemId: 1,
        questionId: "1",
        slug: "two-sum",
        langSlug: "typescript",
        code: "const userCode = true;",
      });
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("extracts only the VS Code compatible code region", () => {
    expect(extractCodeRegion(`// @lc code=start\nfunction answer() {}\n// @lc code=end`))
      .toBe("function answer() {}");
    expect(() => extractCodeRegion("// @lc code=start\nmissing end"))
      .toThrow("incomplete or out of order");
  });
});

function seedProblem(database: LeetCodeDatabase): void {
  database.upsertCatalog([{
    questionId: "1",
    frontendId: "1",
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    paidOnly: false,
    totalAccepted: 100,
    totalSubmitted: 200,
    status: null,
    category: "algorithms",
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
