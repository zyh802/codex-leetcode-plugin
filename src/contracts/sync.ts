export interface SyncStatusDto {
  runId: number;
  state: string;
  catalogUnique: number;
  catalogCategoriesTotal: number;
  catalogCategoriesSynced: number;
  failedCategories: number;
  pendingCategories: number;
  startedAt: string;
  finishedAt: string | null;
}
