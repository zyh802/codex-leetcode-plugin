import { callTool } from "@/api/client.js";
import type { AuthStatusDto, BrowserLoginStatusDto, CredentialPersistenceDto } from "./types.js";

export const authApi = {
  status(signal?: AbortSignal): Promise<AuthStatusDto> {
    return callTool<AuthStatusDto>("leetcode_auth_status", {}, signal);
  },
  startBrowserLogin(persistence: CredentialPersistenceDto, signal?: AbortSignal): Promise<BrowserLoginStatusDto> {
    return callTool<BrowserLoginStatusDto>("leetcode_start_browser_login", { persistence }, signal);
  },
  browserLoginStatus(flowId?: string, signal?: AbortSignal): Promise<BrowserLoginStatusDto> {
    return callTool<BrowserLoginStatusDto>(
      "leetcode_get_browser_login_status",
      flowId === undefined ? {} : { flowId },
      signal,
    );
  },
  cancelBrowserLogin(flowId: string): Promise<BrowserLoginStatusDto> {
    return callTool<BrowserLoginStatusDto>("leetcode_cancel_browser_login", { flowId });
  },
  importCookie(cookie: string, persistence: CredentialPersistenceDto): Promise<AuthStatusDto> {
    return callTool<AuthStatusDto>("leetcode_import_cookie", { cookie, persistence });
  },
  forget(): Promise<{ forgotten: boolean }> {
    return callTool<{ forgotten: boolean }>("leetcode_forget_session", { confirm: true });
  },
};
