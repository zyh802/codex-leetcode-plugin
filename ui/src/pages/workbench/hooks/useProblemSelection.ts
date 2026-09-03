import { catalogService } from "@/services/catalog/CatalogService.js";
import { problemService } from "@/services/problem/ProblemService.js";
import { workspaceService } from "@/services/workspace/WorkspaceService.js";

export function useProblemSelection(): (problemId: number) => void {
  return (problemId: number): void => {
    catalogService.select(problemId);
    workspaceService.setTab("problem");
    void problemService.load(problemId);
  };
}
