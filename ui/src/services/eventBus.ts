import EventEmitter from "eventemitter3";
import type { AppRoute } from "@/types/app.js";

interface AppEvents {
  "auth:changed": (signedIn: boolean) => void;
  "auth:required": (message: string) => void;
  "sync:completed": () => void;
  "navigate": (route: AppRoute) => void;
  "toast": (message: string, tone: "success" | "error" | "neutral") => void;
}

export const eventBus = new EventEmitter<AppEvents>();
