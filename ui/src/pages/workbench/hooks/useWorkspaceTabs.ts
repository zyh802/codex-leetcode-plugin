import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
export function useWorkspaceTabs(): ReturnType<typeof useWorkspaceStore> {
  const state = useWorkspaceStore();
  return { ...state, setTab: workspaceService.setTab.bind(workspaceService) } as ReturnType<typeof useWorkspaceStore>;
}
