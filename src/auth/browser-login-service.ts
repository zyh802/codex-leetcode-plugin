import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { AppError } from "../core/errors.js";
import type { CredentialPersistence, SessionService } from "./session-service.js";

const LEETCODE_LOGIN_URL = "https://leetcode.cn/accounts/login/";
const LEETCODE_ORIGIN = "https://leetcode.cn";

export type BrowserLoginState =
  | "IDLE"
  | "STARTING_BROWSER"
  | "WAITING_FOR_USER"
  | "VALIDATING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface BrowserLoginStatus {
  flowId: string | null;
  state: BrowserLoginState;
  message: string;
  startedAt: string | null;
  updatedAt: string;
  username: string | null;
  premium: boolean | null;
  persistence: CredentialPersistence | null;
}

export interface BrowserCookie {
  name: string;
  value: string;
}

export interface ManagedBrowserSession {
  cookies(): Promise<BrowserCookie[]>;
  close(): Promise<void>;
}

export interface BrowserLoginLauncher {
  launch(profileDirectory: string): Promise<ManagedBrowserSession>;
}

export interface BrowserLoginServiceOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => Date;
  createProfileDirectory?: () => Promise<string>;
  removeProfileDirectory?: (directory: string) => Promise<void>;
}

interface ActiveBrowserLogin {
  flowId: string;
  abortController: AbortController;
  task: Promise<void>;
  timeout: ReturnType<typeof setTimeout>;
}

export class BrowserLoginService {
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;
  private readonly createProfileDirectory: () => Promise<string>;
  private readonly removeProfileDirectory: (directory: string) => Promise<void>;
  private status: BrowserLoginStatus;
  private active: ActiveBrowserLogin | undefined;

  constructor(
    private readonly sessions: SessionService,
    private readonly launcher: BrowserLoginLauncher = new PlaywrightBrowserLoginLauncher(),
    options: BrowserLoginServiceOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 750;
    this.now = options.now ?? (() => new Date());
    this.createProfileDirectory = options.createProfileDirectory ??
      (() => mkdtemp(path.join(tmpdir(), "codex-leetcode-login-")));
    this.removeProfileDirectory = options.removeProfileDirectory ??
      ((directory) => rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }));
    this.status = this.idleStatus();
  }

  start(persistence: CredentialPersistence = "system"): BrowserLoginStatus {
    if (this.active !== undefined && isActiveState(this.status.state)) return this.getStatus(this.active.flowId);

    const flowId = randomUUID();
    const abortController = new AbortController();
    const startedAt = this.now().toISOString();
    this.status = {
      flowId,
      state: "STARTING_BROWSER",
      message: "正在打开力扣官方登录窗口…",
      startedAt,
      updatedAt: startedAt,
      username: null,
      premium: null,
      persistence,
    };

    const timeout = setTimeout(() => abortController.abort("timeout"), this.timeoutMs);
    const task = this.run(flowId, persistence, abortController.signal).finally(() => {
      clearTimeout(timeout);
      if (this.active?.flowId === flowId) this.active = undefined;
    });
    this.active = { flowId, abortController, task, timeout };
    return this.getStatus(flowId);
  }

  getStatus(flowId?: string): BrowserLoginStatus {
    if (flowId !== undefined && this.status.flowId !== flowId) {
      throw new AppError("AUTH_FLOW_NOT_FOUND", "The browser login flow no longer exists.");
    }
    return { ...this.status };
  }

  isActive(): boolean {
    return this.active !== undefined && isActiveState(this.status.state);
  }

  cancel(flowId: string): BrowserLoginStatus {
    if (this.status.flowId !== flowId) {
      throw new AppError("AUTH_FLOW_NOT_FOUND", "The browser login flow no longer exists.");
    }
    if (!isActiveState(this.status.state)) return this.getStatus(flowId);
    this.update(flowId, "CANCELLED", "已取消浏览器登录。", null, null);
    this.active?.abortController.abort("cancelled");
    return this.getStatus(flowId);
  }

  async close(): Promise<void> {
    const active = this.active;
    if (active === undefined) return;
    active.abortController.abort("shutdown");
    await active.task.catch(() => undefined);
  }

  private async run(flowId: string, persistence: CredentialPersistence, signal: AbortSignal): Promise<void> {
    let profileDirectory: string | undefined;
    let browser: ManagedBrowserSession | undefined;
    try {
      profileDirectory = await this.createProfileDirectory();
      throwIfAborted(signal);
      browser = await this.launcher.launch(profileDirectory);
      throwIfAborted(signal);
      this.update(flowId, "WAITING_FOR_USER", "请在新窗口完成力扣登录；插件不会读取密码或验证码。", null, null);

      for (;;) {
        throwIfAborted(signal);
        const credentials = findCredentials(await browser.cookies());
        if (credentials !== null) {
          this.update(flowId, "VALIDATING", "已取得登录会话，正在验证账号…", null, null);
          const auth = await this.sessions.importSession(credentials, persistence);
          if (signal.aborted) {
            if (this.status.flowId === flowId) this.sessions.invalidateIfCurrent(credentials);
            throwIfAborted(signal);
          }
          this.update(
            flowId,
            "SUCCEEDED",
            `已登录${auth.username ? `：${auth.username}` : "力扣"}。`,
            auth.username,
            auth.premium,
          );
          return;
        }
        await abortableDelay(this.pollIntervalMs, signal);
      }
    } catch (error) {
      if (signal.aborted) {
        if (this.status.flowId !== flowId || this.status.state === "CANCELLED") return;
        const timedOut = signal.reason === "timeout";
        this.update(
          flowId,
          timedOut ? "TIMED_OUT" : "CANCELLED",
          timedOut ? "登录等待已超时，请重新开始。" : "已取消浏览器登录。",
          null,
          null,
        );
        return;
      }
      const message = browserClosed(error)
        ? "登录窗口已关闭，请重新开始。"
        : error instanceof AppError
          ? error.message
          : "浏览器登录失败，请重试或使用高级 Cookie 导入。";
      this.update(flowId, "FAILED", message, null, null);
    } finally {
      await browser?.close().catch(() => undefined);
      if (profileDirectory !== undefined) {
        await this.removeProfileDirectory(profileDirectory).catch(() => undefined);
      }
    }
  }

  private update(
    flowId: string,
    state: BrowserLoginState,
    message: string,
    username: string | null,
    premium: boolean | null,
  ): void {
    if (this.status.flowId !== flowId) return;
    this.status = {
      ...this.status,
      state,
      message,
      username,
      premium,
      updatedAt: this.now().toISOString(),
    };
  }

  private idleStatus(): BrowserLoginStatus {
    return {
      flowId: null,
      state: "IDLE",
      message: "尚未开始浏览器登录。",
      startedAt: null,
      updatedAt: this.now().toISOString(),
      username: null,
      premium: null,
      persistence: null,
    };
  }
}

type BrowserChannel = "msedge" | "chrome";

export class PlaywrightBrowserLoginLauncher implements BrowserLoginLauncher {
  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  async launch(profileDirectory: string): Promise<ManagedBrowserSession> {
    for (const channel of browserChannelsForPlatform(this.platform)) {
      let context: BrowserContext;
      try {
        context = await chromium.launchPersistentContext(profileDirectory, {
          channel,
          headless: false,
          timeout: 20_000,
          viewport: null,
          args: ["--no-first-run", "--no-default-browser-check"],
        });
      } catch {
        continue;
      }
      try {
        const page = context.pages()[0] ?? await context.newPage();
        await page.goto(LEETCODE_LOGIN_URL, { waitUntil: "commit", timeout: 30_000 });
        return new PlaywrightManagedBrowserSession(context);
      } catch {
        await context.close().catch(() => undefined);
        throw new AppError(
          "NETWORK_TIMEOUT",
          "已打开浏览器，但无法载入力扣官方登录页。请检查网络后重试。",
          true,
        );
      }
    }
    throw new AppError(
      "BROWSER_LOGIN_UNAVAILABLE",
      "没有找到可用的 Chrome 或 Edge，无法启动安全登录窗口。请安装其中一个浏览器，或使用高级 Cookie 导入。",
    );
  }
}

export function browserChannelsForPlatform(platform: NodeJS.Platform): BrowserChannel[] {
  return platform === "win32" ? ["msedge", "chrome"] : ["chrome", "msedge"];
}

class PlaywrightManagedBrowserSession implements ManagedBrowserSession {
  constructor(private readonly context: BrowserContext) {}

  async cookies(): Promise<BrowserCookie[]> {
    if (this.context.pages().length === 0) throw new Error("Browser closed before login completed.");
    return (await this.context.cookies(LEETCODE_ORIGIN)).map(({ name, value }) => ({ name, value }));
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

function findCredentials(cookies: BrowserCookie[]): { session: string; csrf: string } | null {
  const session = cookies.find((cookie) => cookie.name === "LEETCODE_SESSION")?.value;
  const csrf = cookies.find((cookie) => cookie.name === "csrftoken")?.value;
  return session && csrf ? { session, csrf } : null;
}

function isActiveState(state: BrowserLoginState): boolean {
  return state === "STARTING_BROWSER" || state === "WAITING_FOR_USER" || state === "VALIDATING";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Browser login aborted.", "AbortError");
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Browser login aborted.", "AbortError"));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new DOMException("Browser login aborted.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function browserClosed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /browser has been closed|target page, context or browser has been closed|browser closed/iu.test(message);
}
