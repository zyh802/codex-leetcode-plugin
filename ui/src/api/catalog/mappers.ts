import type { CatalogStatsDto, ProblemDifficulty, ProblemListItemDto } from "./types.js";

const difficulties = new Set<ProblemDifficulty>(["Easy", "Medium", "Hard"]);

export function mapProblemList(value: unknown): ProblemListItemDto[] {
  if (!Array.isArray(value)) throw new Error("题库响应不是数组。");
  return value.map((item, index) => mapProblem(item, index));
}

export function mapCatalogStats(value: unknown): CatalogStatsDto {
  const record = asRecord(value, "题库统计");
  if (typeof record.total !== "number" || !Number.isFinite(record.total) || !Array.isArray(record.categories)) {
    throw new Error("题库统计缺少必要字段。");
  }
  return {
    total: record.total,
    lastUpdatedAt: typeof record.lastUpdatedAt === "string" ? record.lastUpdatedAt : null,
    categories: record.categories.flatMap((entry) => {
      const candidate = asRecord(entry, "题库分类");
      if (typeof candidate.category !== "string" || typeof candidate.count !== "number") return [];
      if (!["algorithms", "database", "shell", "concurrency"].includes(candidate.category)) return [];
      return [{ category: candidate.category as CatalogStatsDto["categories"][number]["category"], count: candidate.count }];
    }),
  };
}

function mapProblem(value: unknown, index: number): ProblemListItemDto {
  const item = asRecord(value, `题目 ${index + 1}`);
  if (
    typeof item.id !== "number" || typeof item.frontendId !== "string" || typeof item.slug !== "string" ||
    typeof item.title !== "string" || typeof item.difficulty !== "string" ||
    !difficulties.has(item.difficulty as ProblemDifficulty)
  ) {
    throw new Error(`题目 ${index + 1} 缺少必要字段或包含未知难度。`);
  }
  return {
    id: item.id,
    frontendId: item.frontendId,
    slug: item.slug,
    title: item.title,
    difficulty: item.difficulty as ProblemDifficulty,
    paidOnly: item.paidOnly === true,
    status: typeof item.status === "string" ? item.status : null,
    favorite: item.favorite === true,
    categories: Array.isArray(item.categories)
      ? item.categories.filter((entry): entry is ProblemListItemDto["categories"][number] =>
          typeof entry === "string" && ["algorithms", "database", "shell", "concurrency"].includes(entry))
      : [],
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label}响应格式错误。`);
  return value as Record<string, unknown>;
}
