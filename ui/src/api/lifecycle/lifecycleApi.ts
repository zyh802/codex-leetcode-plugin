import type { CatalogClientLeaseDto, CatalogCloseResultDto } from "@contracts/lifecycle.js";
import { apiRequest } from "@/api/client.js";

export const lifecycleApi = {
  register(pageId: string): Promise<CatalogClientLeaseDto> {
    return apiRequest("/api/clients/register", { body: { pageId } });
  },
  heartbeat(pageId: string): Promise<CatalogClientLeaseDto> {
    return apiRequest("/api/clients/heartbeat", { body: { pageId } });
  },
  release(pageId: string, keepalive = false): Promise<{ released: boolean; activeClients: number }> {
    return apiRequest("/api/clients/release", { body: { pageId }, keepalive, timeoutMs: 3_000 });
  },
  close(): Promise<CatalogCloseResultDto> {
    return apiRequest("/api/catalog/close", { body: {} });
  },
};
