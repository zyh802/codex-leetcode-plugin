import type {
  CompletionStatus,
  ProblemCategory,
  ProblemDifficulty,
  ProblemSearchFilters,
} from "../domain/types.js";

export type { CompletionStatus, ProblemCategory, ProblemDifficulty, ProblemSearchFilters };

export interface CatalogStatsDto {
  total: number;
  lastUpdatedAt: string | null;
  categories: Array<{ category: ProblemCategory; count: number }>;
}

export interface ProblemListItemDto {
  id: number;
  frontendId: string;
  slug: string;
  title: string;
  difficulty: ProblemDifficulty;
  paidOnly: boolean;
  status: string | null;
  favorite: boolean;
  categories: ProblemCategory[];
}

export interface CatalogSearchRequestDto {
  query: string;
  filters: ProblemSearchFilters;
  limit: number;
  offset: number;
}
