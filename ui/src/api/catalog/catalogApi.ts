import type { CatalogBootstrapDto } from "@contracts/catalog-http.js";
import { apiRequest, callTool } from "@/api/client.js";
import { mapCatalogStats, mapProblemList } from "./mappers.js";
import type { CatalogSearchRequestDto, CatalogStatsDto, ProblemListItemDto } from "./types.js";

export const catalogApi = {
  async bootstrap(query: string, signal?: AbortSignal): Promise<CatalogBootstrapDto> {
    const value = await apiRequest<CatalogBootstrapDto>(`/api/bootstrap?query=${encodeURIComponent(query)}`, { signal });
    return { ...value, stats: mapCatalogStats(value.stats), problems: mapProblemList(value.problems) };
  },
  async search(request: CatalogSearchRequestDto, signal?: AbortSignal): Promise<ProblemListItemDto[]> {
    return mapProblemList(await callTool<unknown>("leetcode_search_problems", request, signal));
  },
  async stats(signal?: AbortSignal): Promise<CatalogStatsDto> {
    return mapCatalogStats(await callTool<unknown>("leetcode_get_catalog_stats", {}, signal));
  },
};
