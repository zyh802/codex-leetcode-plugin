import { create } from "zustand";
import { authApi } from "@/api/auth/authApi.js";
import type { AuthStatusDto, BrowserLoginStatusDto, CredentialPersistenceDto } from "@/api/auth/types.js";
import { isAuthError, messageOf } from "@/api/errors.js";
import { delay } from "@/utils/time.js";
import { eventBus } from "@/services/eventBus.js";

interface AuthState {
  status: AuthStatusDto;
  flow: BrowserLoginStatusDto | null;
  persistence: CredentialPersistenceDto;
  busy: boolean;
  message: string;
}

const signedOut: AuthStatusDto = { signedIn: false, username: null, premium: false, persistence: null };
const initialState: AuthState = {
  status: signedOut,
  flow: null,
  persistence: "system",
  busy: false,
  message: "使用独立的力扣官方窗口登录；插件不会读取密码或验证码。",
};
export const useAuthStore = create<AuthState>(() => initialState);

class AuthService {
  private generation = 0;
  private controller: AbortController | undefined;

  setPersistence(persistence: CredentialPersistenceDto): void {
    useAuthStore.setState({ persistence });
  }

  async initialize(): Promise<void> {
    await this.refresh(false);
    if (!useAuthStore.getState().status.signedIn) await this.restoreBrowserLogin();
  }

  async refresh(showErrors = true): Promise<void> {
    try {
      const status = await authApi.status();
      useAuthStore.setState({ status, message: authMessage(status) });
      eventBus.emit("auth:changed", status.signedIn);
    } catch (error) {
      useAuthStore.setState({
        status: signedOut,
        message: showErrors
          ? isAuthError(error) ? "登录已失效，旧凭据已清除，请重新登录。" : messageOf(error)
          : initialState.message,
      });
      eventBus.emit("auth:changed", false);
    }
  }

  async startBrowserLogin(): Promise<void> {
    this.cancelPolling();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    useAuthStore.setState({ busy: true, message: "正在启动安全登录窗口…" });
    try {
      const flow = await authApi.startBrowserLogin(useAuthStore.getState().persistence, controller.signal);
      if (generation !== this.generation) return;
      useAuthStore.setState({ flow, message: flow.message });
      if (flow.flowId !== null && isActive(flow)) await this.poll(flow.flowId, generation, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted && generation === this.generation) {
        useAuthStore.setState({ flow: null, busy: false, message: messageOf(error) });
      }
    }
  }

  async cancelBrowserLogin(): Promise<void> {
    const flowId = useAuthStore.getState().flow?.flowId;
    this.cancelPolling();
    if (!flowId) return;
    try {
      const flow = await authApi.cancelBrowserLogin(flowId);
      useAuthStore.setState({ flow, busy: false, message: flow.message });
    } catch (error) {
      useAuthStore.setState({ busy: false, message: messageOf(error) });
    }
  }

  async importCookie(cookie: string): Promise<boolean> {
    if (!cookie.trim()) {
      useAuthStore.setState({ message: "请粘贴完整的力扣 Cookie。" });
      return false;
    }
    useAuthStore.setState({ busy: true, message: "正在验证并安全保存会话…" });
    try {
      const status = await authApi.importCookie(cookie.trim(), useAuthStore.getState().persistence);
      useAuthStore.setState({ status, flow: null, busy: false, message: authMessage(status) });
      eventBus.emit("auth:changed", true);
      return true;
    } catch (error) {
      useAuthStore.setState({ status: signedOut, busy: false, message: messageOf(error) });
      eventBus.emit("auth:changed", false);
      return false;
    }
  }

  async logout(): Promise<boolean> {
    try {
      await authApi.forget();
      this.cancelPolling();
      useAuthStore.setState({ ...initialState, persistence: useAuthStore.getState().persistence });
      eventBus.emit("auth:changed", false);
      return true;
    } catch (error) {
      useAuthStore.setState({ message: messageOf(error) });
      return false;
    }
  }

  requireLogin(): boolean {
    if (useAuthStore.getState().status.signedIn) return true;
    eventBus.emit("auth:required", "请先使用浏览器登录力扣。" );
    return false;
  }

  handleError(error: unknown): void {
    if (!isAuthError(error)) return;
    useAuthStore.setState({ status: signedOut, message: "登录已失效，请重新登录。" });
    eventBus.emit("auth:required", "登录已失效，请重新登录。" );
  }

  shutdown(): void {
    this.cancelPolling();
  }

  private async restoreBrowserLogin(): Promise<void> {
    try {
      const flow = await authApi.browserLoginStatus();
      useAuthStore.setState({ flow, busy: isActive(flow), message: flow.state === "IDLE" ? initialState.message : flow.message });
      if (flow.flowId !== null && isActive(flow)) {
        const generation = ++this.generation;
        const controller = new AbortController();
        this.controller = controller;
        void this.poll(flow.flowId, generation, controller.signal);
      }
    } catch {
      // A stale login flow must not block the catalog.
    }
  }

  private async poll(flowId: string, generation: number, signal: AbortSignal): Promise<void> {
    for (;;) {
      await delay(750, signal).catch(() => undefined);
      if (signal.aborted || generation !== this.generation) return;
      try {
        const flow = await authApi.browserLoginStatus(flowId, signal);
        if (signal.aborted || generation !== this.generation) return;
        useAuthStore.setState({ flow, busy: isActive(flow), message: flow.message });
        if (isActive(flow)) continue;
        if (flow.state === "SUCCEEDED") await this.refresh(false);
        return;
      } catch (error) {
        if (signal.aborted || generation !== this.generation) return;
        useAuthStore.setState({ flow: null, busy: false, message: messageOf(error) });
        return;
      }
    }
  }

  private cancelPolling(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    useAuthStore.setState({ busy: false });
  }
}

function isActive(flow: BrowserLoginStatusDto): boolean {
  return ["STARTING_BROWSER", "WAITING_FOR_USER", "VALIDATING"].includes(flow.state);
}

function authMessage(status: AuthStatusDto): string {
  if (!status.signedIn) return initialState.message;
  return `${status.premium ? "会员账号" : "普通账号"} · ${
    status.persistence === "memory" ? "仅本次运行" : "已保存到本机系统凭据库"
  } · 可使用账号状态与远程判题`;
}

export const authService = new AuthService();
