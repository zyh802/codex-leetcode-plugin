import { describe, expect, it } from "vitest";
import { parseCatalogResponse, parseQuestionResponse } from "../src/adapter/leetcode-cn.js";

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
        difficulty: "Easy",
        paidOnly: false,
        totalAccepted: 100,
        totalSubmitted: 200,
        status: "ac",
        category: "algorithms",
      },
    ]);
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
