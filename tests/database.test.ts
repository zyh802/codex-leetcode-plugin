import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { LeetCodeDatabase } from "../src/storage/database.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LeetCodeDatabase", () => {
  it("stores and searches the complete catalog without problem details", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-test-"));
    temporaryDirectories.push(directory);
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      database.upsertCatalog([
      {
        questionId: "1",
        frontendId: "1",
        slug: "two-sum",
        title: "两数之和",
        difficulty: "Easy",
        paidOnly: false,
        totalAccepted: 100,
        totalSubmitted: 200,
        status: null,
        category: "algorithms",
      },
      ]);
      expect(database.getCatalogStats()).toMatchObject({
        total: 1,
        categories: [{ category: "algorithms", count: 1 }],
      });
      expect(database.searchProblems("两数", 10)).toHaveLength(1);
      expect(database.searchProblems("two-sum", 10)).toHaveLength(1);
      expect(database.searchProblems("", 10, 1)).toHaveLength(0);
      expect(database.getCatalogProblem(1)).toMatchObject({
        questionId: "1",
        frontendId: "1",
        slug: "two-sum",
        title: "两数之和",
        paidOnly: false,
      });
      const inspection = new Database(path.join(directory, "test.db"), { readonly: true });
      try {
        const tableNames = inspection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .pluck()
          .all() as string[];
        expect(tableNames).not.toContain("problem_contents");
        expect(tableNames).not.toContain("code_templates");
        expect(tableNames).not.toContain("problem_samples");
        expect(tableNames).not.toContain("problem_tags");
      } finally {
        inspection.close();
      }
    } finally {
      database.close();
    }
  });

  it("orders standard numeric questions before special problem series", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-test-"));
    temporaryDirectories.push(directory);
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      database.upsertCatalog([
        catalogProblem("LCP 01", "guess-numbers"),
        catalogProblem("10", "regular-expression-matching"),
        catalogProblem("2", "add-two-numbers"),
        catalogProblem("1", "two-sum"),
      ]);

      const ordered = database.searchProblems("", 10) as Array<{ frontendId: string }>;
      expect(ordered.map((problem) => problem.frontendId)).toEqual([
        "1",
        "2",
        "10",
        "LCP 01",
      ]);
    } finally {
      database.close();
    }
  });
});

function catalogProblem(frontendId: string, slug: string) {
  return {
    questionId: `question-${frontendId}`,
    frontendId,
    slug,
    title: slug,
    difficulty: "Easy" as const,
    paidOnly: false,
    totalAccepted: null,
    totalSubmitted: null,
    status: null,
    category: "algorithms" as const,
  };
}
