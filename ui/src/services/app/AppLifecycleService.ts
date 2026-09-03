import { create } from "zustand";
import { catalogApi } from "@/api/catalog/catalogApi.js";
import { messageOf } from "@/api/errors.js";
import { authService, useAuthStore } from "@/services/auth/AuthService.js";
import { catalogService } from "@/services/catalog/CatalogService.js";
import { judgeService } from "@/services/judge/JudgeService.js";
import { problemService } from "@/services/problem/ProblemService.js";
import { syncService } from "@/services/sync/SyncService.js";
import { useWorkspaceStore, workspaceService } from "@/services/workspace/WorkspaceService.js";
import { catalogLifecycleService } from "@/services/lifecycle/CatalogLifecycleService.js";
import { eventBus } from "@/services/eventBus.js";
import { routerService } from "@/routers/RouterService.js";
import { toastService } from "@/services/feedback/ToastService.js";

interface AppLifecycleState {
  ready: boolean;
  loading: boolean;
  error: string | null;
}

export const useAppLifecycleStore = create<AppLifecycleState>(() => ({ ready: false, loading: true, error: null }));

class AppLifecycleService {
  private started = false;
  private readonly visibility = (): void => {
    if (document.visibilityState === "visible") void this.refreshAuthority();
  };
  private readonly online = (): void => { void this.refreshAuthority(); };
  private readonly pagehide = (): void => { void catalogLifecycleService.release(true); };
  private readonly pageshow = (): void => { void catalogLifecycleService.startup(); };
  private readonly beforeunload = (event: BeforeUnloadEvent): void => {
    if (!workspaceService.isDirty()) return;
    event.preventDefault();
  };
  private readonly authRequired = (message: string): void => {
    routerService.navigate("settings", { focus: "auth" });
    toastService.show(message, "error");
  };
  private readonly authChanged = (signedIn: boolean): void => {
    if (!signedIn) catalogService.clearAccountFilters();
    void catalogService.search({ signedIn });
  };
  private readonly syncCompleted = (): void => {
    void catalogService.refreshStats();
    void catalogService.search({ signedIn: useAuthStore.getState().status.signedIn });
  };
  private readonly navigate = (route: "workbench" | "settings"): void => routerService.navigate(route);
  private readonly toast = (message: string, tone: "success" | "error" | "neutral"): void => toastService.show(message, tone);

  async startup(): Promise<void> {
    if (this.started) return;
    this.started = true;
    useAppLifecycleStore.setState({ loading: true, ready: false, error: null });
    routerService.startup();
    this.addListeners();
    try {
      await catalogLifecycleService.startup();
      const requestedQuery = new URLSearchParams(window.location.search).get("query") ?? "";
      const bootstrap = await catalogApi.bootstrap(requestedQuery);
      catalogService.initialize(bootstrap.stats, bootstrap.query, bootstrap.problems);
      workspaceService.initialize(bootstrap.workspace);
      await authService.initialize();
      useAppLifecycleStore.setState({ loading: false, ready: true, error: null });
    } catch (error) {
      useAppLifecycleStore.setState({ loading: false, ready: false, error: messageOf(error) });
    }
  }

  async shutdown(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.removeListeners();
    routerService.shutdown();
    catalogService.shutdown();
    problemService.shutdown();
    workspaceService.shutdown();
    judgeService.shutdown();
    authService.shutdown();
    syncService.shutdown();
    await catalogLifecycleService.release(true);
  }

  private async refreshAuthority(): Promise<void> {
    await Promise.allSettled([authService.refresh(false), syncService.refreshAuthority()]);
    const filePath = useWorkspaceStore.getState().solution?.filePath;
    if (filePath) await judgeService.restore(filePath);
  }

  private addListeners(): void {
    document.addEventListener("visibilitychange", this.visibility);
    window.addEventListener("online", this.online);
    window.addEventListener("pagehide", this.pagehide);
    window.addEventListener("pageshow", this.pageshow);
    window.addEventListener("beforeunload", this.beforeunload);
    eventBus.on("auth:required", this.authRequired);
    eventBus.on("auth:changed", this.authChanged);
    eventBus.on("sync:completed", this.syncCompleted);
    eventBus.on("navigate", this.navigate);
    eventBus.on("toast", this.toast);
  }

  private removeListeners(): void {
    document.removeEventListener("visibilitychange", this.visibility);
    window.removeEventListener("online", this.online);
    window.removeEventListener("pagehide", this.pagehide);
    window.removeEventListener("pageshow", this.pageshow);
    window.removeEventListener("beforeunload", this.beforeunload);
    eventBus.off("auth:required", this.authRequired);
    eventBus.off("auth:changed", this.authChanged);
    eventBus.off("sync:completed", this.syncCompleted);
    eventBus.off("navigate", this.navigate);
    eventBus.off("toast", this.toast);
  }
}

export const appLifecycleService = new AppLifecycleService();
