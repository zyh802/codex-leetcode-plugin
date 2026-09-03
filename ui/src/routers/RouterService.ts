import { create } from "zustand";
import type { AppRoute } from "@/types/app.js";
import type { RouteParamsMap, RouteState } from "./types.js";

interface RouterStore {
  route: RouteState;
  previousRoute: RouteState | null;
}

export const useRouterStore = create<RouterStore>(() => ({ route: { name: "workbench" }, previousRoute: null }));

class RouterService {
  private started = false;
  private readonly popstate = (): void => this.applyLocation();

  startup(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener("popstate", this.popstate);
    this.applyLocation();
  }

  navigate<K extends AppRoute>(name: K, params?: RouteParamsMap[K]): void {
    const state: RouteState = params === undefined ? { name } : { name, params } as RouteState;
    const current = useRouterStore.getState().route;
    if (current.name === name) {
      useRouterStore.setState({ route: state });
      return;
    }
    window.history.pushState({ route: name }, "", name === "settings" ? "#/settings" : "#/workbench");
    useRouterStore.setState({ route: state, previousRoute: current });
  }

  back(): void {
    const previous = useRouterStore.getState().previousRoute;
    if (previous === null) {
      this.navigate("workbench");
      return;
    }
    window.history.back();
  }

  shutdown(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener("popstate", this.popstate);
  }

  private applyLocation(): void {
    const name: AppRoute = window.location.hash.startsWith("#/settings") ? "settings" : "workbench";
    const current = useRouterStore.getState().route;
    useRouterStore.setState({ route: { name }, previousRoute: current.name === name ? null : current });
  }
}

export const routerService = new RouterService();
