import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ProblemService } from "../src/problem/problem-service.js";
import { LeetCodeDatabase } from "../src/storage/database.js";

describe("ProblemService", () => {
  it("fetches details on every open and never persists the response", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-problem-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      database.upsertCatalog([{
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
      }]);
      const getQuestionDetail = vi.fn().mockResolvedValue(questionDetail());
      const service = new ProblemService(database, { getQuestionDetail } as never, () => undefined);

      const first = await service.getProblem(1);
      const second = await service.getProblem(1);

      expect(getQuestionDetail).toHaveBeenCalledTimes(2);
      expect(first.contents.find((item) => item.locale === "zh-CN")?.html).not.toContain("script");
      expect(second.templates[0]).toMatchObject({ langSlug: "typescript" });
      expect(database.getCatalogStats().total).toBe(1);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fetches the current template when a solution is created", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-template-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      database.upsertCatalog([{
        questionId: "1", frontendId: "1", slug: "two-sum", title: "两数之和",
        difficulty: "Easy", paidOnly: false, totalAccepted: 1, totalSubmitted: 2,
        status: null, category: "algorithms",
      }]);
      const getQuestionDetail = vi.fn().mockResolvedValue(questionDetail());
      const service = new ProblemService(database, { getQuestionDetail } as never, () => undefined);

      await expect(service.getSolutionTemplate(1, "typescript")).resolves.toMatchObject({
        problemId: 1,
        title: "两数之和",
        starterCode: "function twoSum() {}",
      });
      expect(getQuestionDetail).toHaveBeenCalledTimes(1);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function questionDetail() {
  return {
    questionId: "1",
    frontendId: "1",
    slug: "two-sum",
    title: "Two Sum",
    translatedTitle: "两数之和",
    difficulty: "Easy" as const,
    paidOnly: false,
    content: "<p>Find two numbers.</p>",
    translatedContent: "<p>找出两个数。</p><script>alert(1)</script>",
    sampleTestCase: "[2,7]\n9",
    enableRunCode: true,
    templates: [{ langSlug: "typescript", langName: "TypeScript", starterCode: "function twoSum() {}" }],
    tags: [{ slug: "array", name: "Array", translatedName: "数组" }],
    metadata: { name: "twoSum" },
  };
}
