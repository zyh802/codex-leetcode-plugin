import { create } from "zustand";
import { syncApi } from "@/api/sync/syncApi.js";
import type { SyncStatusDto } from "@/api/sync/types.js";
import { messageOf } from "@/api/errors.js";
import { delay } from "@/utils/time.js";
import { eventBus } from "@/services/eventBus.js";

interface SyncState {
  busy: boolean;
  runId: number | null;
  status: SyncStatusDto | null;
  message: string;
  tone: "working" | "success" | "error";
}

const initialState: SyncState = { busy: false, runId: null, status: null, message: "", tone: "working" };
export const useSyncStore = create<SyncState>(() => initialState);

class SyncService {
  private generation = 0;
  private controller: AbortController | undefined;

  async synchronize(): Promise<void> {
    if (useSyncStore.getState().busy) return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    useSyncStore.setState({ busy: true, message: "正在启动目录同步…", tone: "working" });
    try {
      const started = await syncApi.start(controller.signal);
      useSyncStore.setState({ runId: started.runId });
      for (;;) {
        const status = await syncApi.status(started.runId, controller.signal);
        if (status === null) throw new Error("找不到同步任务状态。");
        if (generation !== this.generation) return;
        useSyncStore.setState({
          status,
          message: `同步目录 ${status.catalogCategoriesSynced}/${status.catalogCategoriesTotal} · ${status.catalogUnique} 道题`,
          tone: status.failedCategories > 0 ? "error" : "working",
        });
        if (status.state === "READY") {
          useSyncStore.setState({
            busy: false,
            message: `目录同步完成，共 ${status.catalogUnique} 道题。`,
            tone: "success",
          });
          eventBus.emit("sync:completed");
          return;
        }
        if (["PARTIAL", "PAUSED", "AUTH_REQUIRED"].includes(status.state)) {
          throw new Error(`目录同步停在 ${status.state}；处理登录或网络问题后可以再次同步。`);
        }
        await delay(700, controller.signal);
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return;
      useSyncStore.setState({ busy: false, message: messageOf(error), tone: "error" });
    }
  }

  async refreshAuthority(): Promise<void> {
    const runId = useSyncStore.getState().runId;
    if (runId === null) return;
    try {
      const status = await syncApi.status(runId);
      if (status === null) return;
      useSyncStore.setState({
        status,
        busy: !["READY", "PARTIAL", "PAUSED", "AUTH_REQUIRED"].includes(status.state),
        message: status.state === "READY"
          ? `目录同步完成，共 ${status.catalogUnique} 道题。`
          : `同步目录 ${status.catalogCategoriesSynced}/${status.catalogCategoriesTotal} · ${status.catalogUnique} 道题`,
        tone: status.state === "READY" ? "success" : status.failedCategories > 0 ? "error" : "working",
      });
      if (status.state === "READY") eventBus.emit("sync:completed");
    } catch {
      // Visibility recovery is best-effort; the active workflow keeps its last-good state.
    }
  }

  shutdown(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    useSyncStore.setState({ busy: false });
  }
}

export const syncService = new SyncService();
