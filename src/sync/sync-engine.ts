import { AppError, asAppError } from "../core/errors.js";
import { log } from "../core/logger.js";
import type { LeetCodeCnAdapter } from "../adapter/leetcode-cn.js";
import type { LeetCodeDatabase } from "../storage/database.js";
import type { SessionCredentials } from "../adapter/http-client.js";

export class SyncEngine {
  private activeRunId: number | null = null;
  private pauseRequested = false;

  constructor(
    private readonly database: LeetCodeDatabase,
    private readonly adapter: LeetCodeCnAdapter,
    private readonly credentialsProvider: () => SessionCredentials | undefined,
  ) {}

  startFullSync(): number {
    if (this.activeRunId !== null) return this.activeRunId;
    const runId = this.database.createSyncRun();
    this.launch(runId);
    return runId;
  }

  pause(runId: number): void {
    if (this.activeRunId !== runId) {
      throw new AppError("INVALID_INPUT", `Sync run ${runId} is not active.`);
    }
    this.pauseRequested = true;
  }

  resume(runId: number): void {
    if (this.activeRunId !== null) {
      throw new AppError("INVALID_INPUT", `Sync run ${this.activeRunId} is already active.`);
    }
    const status = this.database.getSyncStatus(runId);
    if (!status) throw new AppError("INVALID_INPUT", `Sync run ${runId} does not exist.`);
    if (!["FETCHING_CATALOGS", "PAUSED", "PARTIAL", "AUTH_REQUIRED"].includes(status.state)) {
      throw new AppError("INVALID_INPUT", `Sync run ${runId} cannot resume from ${status.state}.`);
    }
    this.launch(runId);
  }

  private launch(runId: number): void {
    this.activeRunId = runId;
    this.pauseRequested = false;
    void this.run(runId)
      .catch((error: unknown) => {
        const appError = asAppError(error);
        const state = appError.code === "AUTH_EXPIRED" ? "AUTH_REQUIRED" : "PARTIAL";
        this.database.setSyncState(runId, state);
        log("error", "sync failed", { runId, errorCode: appError.code, detail: appError.message });
      })
      .finally(() => {
        this.activeRunId = null;
      });
  }

  private async run(runId: number): Promise<void> {
    this.database.setSyncState(runId, "FETCHING_CATALOGS");
    const categories = this.database.listPendingSyncCategories(runId);
    for (const category of categories) {
      if (this.pauseRequested) {
        this.database.setSyncState(runId, "PAUSED");
        return;
      }
      this.database.setSyncCategoryState(runId, category, "running");
      try {
        const catalog = await this.adapter.getCatalog(category, this.credentialsProvider());
        this.database.upsertCatalog(catalog);
        this.database.setSyncCategoryState(runId, category, "synced");
        log("info", "catalog synchronized", { runId, category, count: catalog.length });
      } catch (error) {
        const appError = asAppError(error);
        this.database.setSyncCategoryState(runId, category, "retryable", appError.code);
        log("warn", "catalog synchronization failed", {
          runId,
          category,
          errorCode: appError.code,
        });
        throw appError;
      }
    }

    const status = this.database.getSyncStatus(runId);
    if (status !== null && status.pendingCategories > 0) {
      this.database.setSyncState(runId, "PARTIAL");
    } else {
      this.database.setSyncState(runId, "READY", true);
    }
  }
}
