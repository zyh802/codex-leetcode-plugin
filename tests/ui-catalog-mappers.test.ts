import { describe, expect, it } from "vitest";
import { mapCatalogStats, mapProblemList } from "../ui/src/api/catalog/mappers.js";

describe("UI catalog contract mappers", () => {
  it("maps valid DTOs without exposing database rows", () => {
    expect(mapProblemList([{
      id: 1,
      frontendId: "1",
      slug: "two-sum",
      title: "Two Sum",
      difficulty: "Easy",
      paidOnly: 0,
      status: null,
      favorite: 1,
      categories: ["algorithms", "unknown"],
    }])).toEqual([{
      id: 1,
      frontendId: "1",
      slug: "two-sum",
      title: "Two Sum",
      difficulty: "Easy",
      paidOnly: false,
      status: null,
      favorite: false,
      categories: ["algorithms"],
    }]);
    expect(mapCatalogStats({ total: 1, lastUpdatedAt: null, categories: [{ category: "algorithms", count: 1 }] })).toMatchObject({ total: 1 });
  });

  it("rejects missing fields and unknown difficulty enums", () => {
    expect(() => mapProblemList([{ id: 1, difficulty: "Legendary" }])).toThrow(/必要字段|未知难度/u);
    expect(() => mapCatalogStats({ categories: [] })).toThrow(/必要字段/u);
  });
});
