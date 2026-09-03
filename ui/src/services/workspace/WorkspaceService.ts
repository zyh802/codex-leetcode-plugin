import { create } from "zustand";
import { workspaceApi } from "@/api/workspace/workspaceApi.js";
import type { EditableSolutionDto, WorkspaceSettingsDto } from "@/api/workspace/types.js";
import { messageOf } from "@/api/errors.js";
import type { WorkspaceTab } from "@/types/app.js";
import { eventBus } from "@/services/eventBus.js";

interface WorkspaceState {
  settings: WorkspaceSettingsDto;
  solution: EditableSolutionDto | null;
  draft: string;
  dirty: boolean;
  tab: WorkspaceTab;
  createBusy: boolean;
  createMessage: string;
  saveBusy: boolean;
  saveMessage: string;
}

const initialState: WorkspaceState = {
  settings: { workspaceRoot: null, solutionRoot: null, customized: false },
  solution: null,
  draft: "",
  dirty: false,
  tab: "problem",
  createBusy: false,
  createMessage: "",
  saveBusy: false,
  saveMessage: "",
};
export const useWorkspaceStore = create<WorkspaceState>(() => initialState);

class WorkspaceService {
  private controller: AbortController | undefined;

  initialize(settings: WorkspaceSettingsDto): void {
    useWorkspaceStore.setState({ settings });
  }

  setTab(tab: WorkspaceTab): void {
    const target = tab === "code" && useWorkspaceStore.getState().solution === null ? "problem" : tab;
    useWorkspaceStore.setState({ tab: target });
  }

  updateDraft(draft: string): void {
    const solution = useWorkspaceStore.getState().solution;
    useWorkspaceStore.setState({ draft, dirty: solution !== null && draft !== solution.content });
  }

  async create(problemId: number, langSlug: string): Promise<boolean> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    useWorkspaceStore.setState({ createBusy: true, createMessage: "正在获取最新模板并创建代码…" });
    try {
      const created = await workspaceApi.create(problemId, langSlug, controller.signal);
      useWorkspaceStore.setState({
        solution: created.editor,
        draft: created.editor.content,
        dirty: false,
        tab: "code",
        createBusy: false,
        createMessage: created.created
          ? `代码已创建：${created.filePath}`
          : `已有代码，未覆盖：${created.filePath}`,
        saveMessage: "已加载现有文件",
      });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      useWorkspaceStore.setState({ createBusy: false, createMessage: messageOf(error) });
      return false;
    }
  }

  async save(): Promise<boolean> {
    const state = useWorkspaceStore.getState();
    if (state.solution === null) return false;
    if (!state.dirty) return true;
    const target = state.solution;
    const submittedContent = state.draft;
    useWorkspaceStore.setState({ saveBusy: true, saveMessage: "正在保存…" });
    try {
      const saved = await workspaceApi.save(target.filePath, submittedContent, target.codeHash);
      const current = useWorkspaceStore.getState();
      if (current.solution?.filePath !== target.filePath) return false;
      useWorkspaceStore.setState({
        solution: saved,
        draft: current.draft === submittedContent ? saved.content : current.draft,
        dirty: current.draft !== submittedContent,
        saveBusy: false,
        saveMessage: "已保存",
      });
      return true;
    } catch (error) {
      useWorkspaceStore.setState({ saveBusy: false, saveMessage: messageOf(error) });
      return false;
    }
  }

  async setSolutionRoot(directory: string | null): Promise<boolean> {
    useWorkspaceStore.setState({ saveBusy: true, saveMessage: "正在应用…" });
    try {
      const previous = useWorkspaceStore.getState().settings.solutionRoot;
      const settings = await workspaceApi.setSolutionRoot(directory);
      useWorkspaceStore.setState({
        settings,
        saveBusy: false,
        saveMessage: settings.customized ? "已应用公共目录" : "已恢复当前工作区",
        ...(previous === settings.solutionRoot
          ? {}
          : { solution: null, draft: "", dirty: false, tab: "problem" as const }),
      });
      return true;
    } catch (error) {
      useWorkspaceStore.setState({ saveBusy: false, saveMessage: messageOf(error) });
      return false;
    }
  }

  isDirty(): boolean {
    return useWorkspaceStore.getState().dirty;
  }

  requireSolutionRoot(): boolean {
    if (useWorkspaceStore.getState().settings.solutionRoot !== null) return true;
    eventBus.emit("navigate", "settings");
    eventBus.emit("toast", "请先设置公共解答目录。", "error");
    return false;
  }

  shutdown(): void {
    this.controller?.abort();
    this.controller = undefined;
  }
}

export const workspaceService = new WorkspaceService();
