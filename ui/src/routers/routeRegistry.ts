import type { AppRoute } from "@/types/app.js";

export const routeRegistry: Readonly<Record<AppRoute, { title: string; keepAlive: boolean }>> = Object.freeze({
  workbench: { title: "力扣题库", keepAlive: true },
  settings: { title: "设置", keepAlive: false },
});
