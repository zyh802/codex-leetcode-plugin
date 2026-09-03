import type { AppRoute } from "@/types/app.js";

export interface RouteParamsMap {
  workbench: { focus?: "catalog" | "editor" };
  settings: { focus?: "auth" | "workspace" };
}

export type RouteState = { [K in AppRoute]: { name: K; params?: RouteParamsMap[K] } }[AppRoute];
