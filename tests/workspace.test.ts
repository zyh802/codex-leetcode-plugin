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

  it("reads and saves editor content without overwriting external changes", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-editor-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const manager = new WorkspaceManager(database);
      const root = path.join(directory, "solutions");
      const created = manager.createSolution(solutionTemplate(), root);
      const opened = manager.readSolutionForEditing(created.filePath, root);

      const saved = manager.saveSolutionFromEditor(
        opened.filePath,
        root,
        "function twoSum() { return []; }",
        opened.codeHash,
      );
      expect(readFileSync(saved.filePath, "utf8")).toBe("function twoSum() { return []; }");

      writeFileSync(saved.filePath, "// changed outside the browser editor", "utf8");
      expect(() => manager.saveSolutionFromEditor(
        saved.filePath,
        root,
        "// stale browser draft",
        saved.codeHash,
      )).toThrow("代码文件已在编辑器外被修改");
      expect(readFileSync(saved.filePath, "utf8")).toBe("// changed outside the browser editor");
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function seedProblem(database: LeetCodeDatabase): void {
  database.upsertCatalog([{
    questionId: "1",
    frontendId: "1",
    slug: "two-sum",
    title: "Two Sum",
    translatedTitle: "两数之和",
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
