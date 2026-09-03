import { create } from "zustand";
import { lifecycleApi } from "@/api/lifecycle/lifecycleApi.js";
import { messageOf } from "@/api/errors.js";

interface CatalogLifecycleState {
  activeClients: number;
  closed: boolean;
  error: string | null;
}

export const useCatalogLifecycleStore = create<CatalogLifecycleState>(() => ({ activeClients: 0, closed: false, error: null }));

class CatalogLifecycleService {
  readonly pageId = crypto.randomUUID();
  private heartbeatTimer: number | undefined;
  private registered = false;

  async startup(): Promise<void> {
    if (this.registered) return;
    const lease = await lifecycleApi.register(this.pageId);
    this.registered = true;
    useCatalogLifecycleStore.setState({ activeClients: lease.activeClients, closed: false, error: null });
    this.heartbeatTimer = window.setInterval(() => void this.heartbeat(), lease.heartbeatIntervalMs);
  }

  async release(keepalive = false): Promise<void> {
    if (!this.registered) return;
    this.registered = false;
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    await lifecycleApi.release(this.pageId, keepalive).catch(() => undefined);
  }

  async closeCatalog(): Promise<boolean> {
    try {
      await this.release();
      await lifecycleApi.close();
      useCatalogLifecycleStore.setState({ closed: true, activeClients: 0, error: null });
      return true;
    } catch (error) {
      useCatalogLifecycleStore.setState({ error: messageOf(error) });
      return false;
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.registered) return;
    try {
      const lease = await lifecycleApi.heartbeat(this.pageId);
      useCatalogLifecycleStore.setState({ activeClients: lease.activeClients, error: null });
    } catch (error) {
      useCatalogLifecycleStore.setState({ error: messageOf(error) });
    }
  }
}

export const catalogLifecycleService = new CatalogLifecycleService();
