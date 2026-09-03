export interface CatalogClientRequestDto {
  pageId: string;
}

export interface CatalogClientLeaseDto {
  pageId: string;
  activeClients: number;
  heartbeatIntervalMs: number;
  expiresAfterMs: number;
}

export interface CatalogCloseResultDto {
  closed: boolean;
  alreadyClosed: boolean;
  blockedByCriticalActivity: boolean;
}
