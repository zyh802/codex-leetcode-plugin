import { describe, expect, it, vi } from "vitest";
import { LeetCodeCnAdapter } from "../src/adapter/leetcode-cn.js";
import {
  BrowserLoginService,
  browserChannelsForPlatform,
  type BrowserLoginLauncher,
  type BrowserLoginStatus,
  type ManagedBrowserSession,
} from "../src/auth/browser-login-service.js";
import { MemorySecretStore } from "../src/auth/secret-store.js";
import { SessionService } from "../src/auth/session-service.js";

describe("BrowserLoginService", () => {
  it("captures only the target cookies, validates them, and removes the temporary profile", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    vi.spyOn(adapter, "getAuthStatus").mockResolvedValue({
      signedIn: true,
      username: "browser-user",
      premium: false,
    });
    const sessions = new SessionService(new MemorySecretStore(), adapter);
    const browser = fakeBrowser([
      { name: "ignored", value: "not-stored" },
      { name: "LEETCODE_SESSION", value: "session-value-long-enough" },
      { name: "csrftoken", value: "csrf-value-long-enough" },
    ]);
    const launcher: BrowserLoginLauncher = { launch: vi.fn(async () => browser) };
    const removeProfileDirectory = vi.fn(async () => undefined);
    const service = new BrowserLoginService(sessions, launcher, {
      pollIntervalMs: 1,
      createProfileDirectory: async () => "/tmp/codex-leetcode-test-profile",
      removeProfileDirectory,
    });

    const started = service.start();
    const status = await waitForTerminal(service, started.flowId!);

    expect(status).toMatchObject({ state: "SUCCEEDED", username: "browser-user", premium: false });
    expect(JSON.stringify(status)).not.toContain("session-value");
    expect(JSON.stringify(status)).not.toContain("csrf-value");
    expect(sessions.getCredentials()).toEqual({
      session: "session-value-long-enough",
      csrf: "csrf-value-long-enough",
    });
    expect(browser.close).toHaveBeenCalledOnce();
    expect(removeProfileDirectory).toHaveBeenCalledWith("/tmp/codex-leetcode-test-profile");
  });

  it("cancels an active login and cleans up its browser session", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    const sessions = new SessionService(new MemorySecretStore(), adapter);
    const browser = fakeBrowser([]);
    const service = new BrowserLoginService(sessions, { launch: async () => browser }, {
      pollIntervalMs: 5,
      createProfileDirectory: async () => "/tmp/codex-leetcode-cancel-profile",
      removeProfileDirectory: async () => undefined,
    });

    const started = service.start();
    await waitForState(service, started.flowId!, "WAITING_FOR_USER");
    expect(service.cancel(started.flowId!)).toMatchObject({ state: "CANCELLED" });
    await service.close();

    expect(service.getStatus(started.flowId!)).toMatchObject({ state: "CANCELLED" });
    expect(browser.close).toHaveBeenCalledOnce();
    expect(sessions.getCredentials()).toBeUndefined();
  });

  it("keeps an unsigned social-login session open until the account is signed in", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    let signedIn = false;
    const getAuthStatus = vi.spyOn(adapter, "getAuthStatus").mockImplementation(async () => ({
      signedIn,
      username: signedIn ? "wechat-user" : null,
      premium: false,
    }));
    const sessions = new SessionService(new MemorySecretStore(), adapter);
    const browser = fakeBrowser([
      { name: "LEETCODE_SESSION", value: "social-login-session" },
      { name: "csrftoken", value: "csrf-value-long-enough" },
    ]);
    const service = new BrowserLoginService(sessions, { launch: async () => browser }, {
      pollIntervalMs: 1,
      createProfileDirectory: async () => "/tmp/codex-leetcode-social-profile",
      removeProfileDirectory: async () => undefined,
      validationRetryIntervalMs: 5,
    });

    const started = service.start("memory");
    try {
      await vi.waitFor(() => expect(getAuthStatus).toHaveBeenCalled());
      expect(service.getStatus(started.flowId!)).toMatchObject({ state: "WAITING_FOR_USER" });
      expect(browser.close).not.toHaveBeenCalled();
      expect(sessions.getCredentials()).toBeUndefined();

      // The server may authenticate an existing session without replacing its cookies.
      signedIn = true;
      const status = await waitForTerminal(service, started.flowId!);
      expect(status).toMatchObject({ state: "SUCCEEDED", username: "wechat-user" });
      expect(browser.close).toHaveBeenCalledOnce();
    } finally {
      await service.close();
    }
  });

  it("does not retain credentials when cancellation happens during account validation", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    let finishValidation!: (value: { signedIn: true; username: string; premium: false }) => void;
    vi.spyOn(adapter, "getAuthStatus").mockImplementation(() => new Promise((resolve) => {
      finishValidation = resolve;
    }));
    const sessions = new SessionService(new MemorySecretStore(), adapter);
    const browser = fakeBrowser([
      { name: "LEETCODE_SESSION", value: "session-value-long-enough" },
      { name: "csrftoken", value: "csrf-value-long-enough" },
    ]);
    const service = new BrowserLoginService(sessions, { launch: async () => browser }, {
      pollIntervalMs: 1,
      createProfileDirectory: async () => "/tmp/codex-leetcode-validating-profile",
      removeProfileDirectory: async () => undefined,
    });

    const started = service.start();
    await waitForState(service, started.flowId!, "VALIDATING");
    service.cancel(started.flowId!);
    finishValidation({ signedIn: true, username: "cancelled-user", premium: false });
    await service.close();

    expect(service.getStatus(started.flowId!)).toMatchObject({ state: "CANCELLED" });
    expect(sessions.getCredentials()).toBeUndefined();
  });

  it("limits anonymous-session validation but checks changed cookies without waiting for the retry interval", async () => {
    vi.useFakeTimers();
    const adapter = new LeetCodeCnAdapter({} as never);
    const getAuthStatus = vi.spyOn(adapter, "getAuthStatus").mockResolvedValue({
      signedIn: false, username: null, premium: false,
    });
    const sessions = new SessionService(new MemorySecretStore(), adapter);
    const cookies = [
      { name: "LEETCODE_SESSION", value: "anonymous-session" },
      { name: "csrftoken", value: "csrf-value-long-enough" },
    ];
    const browser = fakeBrowser(cookies);
    const service = new BrowserLoginService(sessions, { launch: async () => browser }, {
      pollIntervalMs: 100,
      createProfileDirectory: async () => "/tmp/codex-leetcode-retry-profile",
      removeProfileDirectory: async () => undefined,
    });
    const started = service.start("memory");
    try {
      await vi.advanceTimersByTimeAsync(1_000);
      expect(getAuthStatus).toHaveBeenCalledTimes(1);
      expect(browser.close).not.toHaveBeenCalled();
      cookies[0]!.value = "new-anonymous-session";
      await vi.advanceTimersByTimeAsync(100);
      expect(getAuthStatus).toHaveBeenCalledTimes(2);
      expect(service.cancel(started.flowId!).state).toBe("CANCELLED");
      await service.close();
      expect(browser.close).toHaveBeenCalledOnce();
      expect(sessions.getCredentials()).toBeUndefined();
    } finally {
      await service.close();
      vi.useRealTimers();
    }
  });

  it.each([false, true])("times out without persisting a partial browser session (session cookie: %s)", async (hasSession) => {
    const adapter = new LeetCodeCnAdapter({} as never);
    vi.spyOn(adapter, "getAuthStatus").mockResolvedValue({ signedIn: false, username: null, premium: false });
    const sessions = new SessionService(new MemorySecretStore(), adapter);
    const browser = fakeBrowser([
      { name: "csrftoken", value: "csrf-value-long-enough" },
      ...(hasSession ? [{ name: "LEETCODE_SESSION", value: "anonymous-session" }] : []),
    ]);
    const service = new BrowserLoginService(sessions, { launch: async () => browser }, {
      timeoutMs: 20,
      pollIntervalMs: 2,
      createProfileDirectory: async () => "/tmp/codex-leetcode-timeout-profile",
      removeProfileDirectory: async () => undefined,
    });

    const started = service.start();
    const status = await waitForTerminal(service, started.flowId!);

    expect(status.state).toBe("TIMED_OUT");
    expect(sessions.getCredentials()).toBeUndefined();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("prefers Edge on Windows and Chrome on macOS/Linux", () => {
    expect(browserChannelsForPlatform("win32")).toEqual(["msedge", "chrome"]);
    expect(browserChannelsForPlatform("darwin")).toEqual(["chrome", "msedge"]);
    expect(browserChannelsForPlatform("linux")).toEqual(["chrome", "msedge"]);
  });
});

function fakeBrowser(cookies: Array<{ name: string; value: string }>): ManagedBrowserSession & {
  close: ReturnType<typeof vi.fn>;
} {
  return {
    cookies: vi.fn(async () => cookies),
    close: vi.fn(async () => undefined),
  };
}

async function waitForTerminal(service: BrowserLoginService, flowId: string): Promise<BrowserLoginStatus> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = service.getStatus(flowId);
    if (!["STARTING_BROWSER", "WAITING_FOR_USER", "VALIDATING"].includes(status.state)) return status;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("Browser login did not reach a terminal state.");
}

async function waitForState(
  service: BrowserLoginService,
  flowId: string,
  expected: BrowserLoginStatus["state"],
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (service.getStatus(flowId).state === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Browser login did not reach ${expected}.`);
}
