import { describe, expect, it, vi } from "vitest";
import {
  LeetCodeCnAdapter,
  parseCatalogResponse,
  parseQuestionResponse,
  parseTranslatedTitleCatalogResponse,
} from "../src/adapter/leetcode-cn.js";

describe("LeetCode CN adapter parsing", () => {
  it("maps a catalog entry into the domain model", () => {
    const result = parseCatalogResponse(
      {
        num_total: 1,
        stat_status_pairs: [
          {
            stat: {
              question_id: 1,
              frontend_question_id: "1",
              question__title: "Two Sum",
              question__title_slug: "two-sum",
              total_acs: 100,
              total_submitted: 200,
            },
            difficulty: { level: 1 },
            paid_only: false,
            status: "ac",
            is_favor: true,
          },
        ],
      },
      "algorithms",
    );

    expect(result).toEqual([
      {
        questionId: "1",
        frontendId: "1",
        slug: "two-sum",
        title: "Two Sum",
        translatedTitle: null,
        difficulty: "Easy",
        paidOnly: false,
        totalAccepted: 100,
        totalSubmitted: 200,
        status: "ac",
        favorite: true,
        category: "algorithms",
      },
    ]);
  });

  it("loads all translated-title pages once and adds Chinese titles to each catalog", async () => {
    const catalogResponse = {
      num_total: 1,
      stat_status_pairs: [{
        stat: {
          question_id: 1,
          frontend_question_id: "1",
          question__title: "Two Sum",
          question__title_slug: "two-sum",
        },
        difficulty: { level: 1 },
        paid_only: false,
      }],
    };
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      titleSlug: index === 0 ? "two-sum" : `problem-${index}`,
      translatedTitle: index === 0 ? "两数之和" : `题目 ${index}`,
    }));
    const getJson = vi.fn().mockResolvedValue(catalogResponse);
    const postJson = vi.fn()
      .mockResolvedValueOnce(translatedTitleResponse(101, firstPage))
      .mockResolvedValueOnce(translatedTitleResponse(101, [{ titleSlug: "last-problem", translatedTitle: "最后一题" }]));
    const adapter = new LeetCodeCnAdapter({ getJson, postJson } as never);

    await expect(adapter.getCatalog("algorithms")).resolves.toMatchObject([
      { title: "Two Sum", translatedTitle: "两数之和" },
    ]);
    await expect(adapter.getCatalog("database")).resolves.toMatchObject([
      { title: "Two Sum", translatedTitle: "两数之和" },
    ]);

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson.mock.calls.map((call) => call[1].variables.skip)).toEqual([0, 100]);
  });

  it("parses nullable translated titles from the lightweight catalog", () => {
    expect(parseTranslatedTitleCatalogResponse(translatedTitleResponse(2, [
      { titleSlug: "two-sum", translatedTitle: "两数之和" },
      { titleSlug: "english-only", translatedTitle: null },
    ]))).toEqual({
      totalLength: 2,
      questions: [
        { titleSlug: "two-sum", translatedTitle: "两数之和" },
        { titleSlug: "english-only", translatedTitle: null },
      ],
    });
  });

  it("parses question templates, metadata, and translated tags", () => {
    const result = parseQuestionResponse(
      {
        data: {
          question: {
            questionId: "1",
            questionFrontendId: "1",
            title: "Two Sum",
            titleSlug: "two-sum",
            translatedTitle: "两数之和",
            difficulty: "Easy",
            isPaidOnly: false,
            content: "<p>Find two numbers.</p>",
            translatedContent: "<p>找出两个数。</p>",
            codeDefinition: JSON.stringify([
              { value: "typescript", text: "TypeScript", defaultCode: "function twoSum() {}" },
            ]),
            sampleTestCase: "[2,7,11,15]\n9",
            metaData: JSON.stringify({ name: "twoSum" }),
            enableRunCode: true,
            topicTags: [{ name: "Array", slug: "array", translatedName: "数组" }],
          },
        },
      },
      "two-sum",
    );

    expect(result.translatedTitle).toBe("两数之和");
    expect(result.templates[0]).toMatchObject({ langSlug: "typescript", langName: "TypeScript" });
    expect(result.metadata).toEqual({ name: "twoSum" });
    expect(result.tags).toEqual([{ name: "Array", slug: "array", translatedName: "数组" }]);
  });

  it("rejects an unexpected upstream schema", () => {
    expect(() => parseCatalogResponse({ stat_status_pairs: [] }, "algorithms")).toThrow(
      "LeetCode catalog schema changed",
    );
  });
});

function translatedTitleResponse(
  totalLength: number,
  questions: Array<{ titleSlug: string; translatedTitle: string | null }>,
) {
  return { data: { problemsetQuestionListV2: { totalLength, questions } } };
}
