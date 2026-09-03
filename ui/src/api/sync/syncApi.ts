import { callTool } from "@/api/client.js";
import type { SyncStatusDto } from "./types.js";

export const syncApi = {
  start(signal?: AbortSignal): Promise<{ runId: number }> {
    return callTool<{ runId: number }>("leetcode_start_full_sync", {}, signal);
  },
  status(runId: number, signal?: AbortSignal): Promise<SyncStatusDto | null> {
    return callTool<SyncStatusDto | null>("leetcode_get_sync_status", { runId }, signal);
  },
};
