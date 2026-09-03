import { catalogService } from "@/services/catalog/CatalogService.js";
import { judgeService } from "@/services/judge/JudgeService.js";
import { useWorkspaceStore } from "@/services/workspace/WorkspaceService.js";

export function resetStores(): void {
  catalogService.resetForTests();
  judgeService.resetForSolution();
  useWorkspaceStore.setState({
    settings: { workspaceRoot: null, solutionRoot: null, customized: false },
    solution: null,
    draft: "",
    dirty: false,
    tab: "problem",
    createBusy: false,
    createMessage: "",
    saveBusy: false,
    saveMessage: "",
  });
}
