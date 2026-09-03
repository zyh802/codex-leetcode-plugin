import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CatalogHttpServer, type CatalogHttpDependencies } from "../src/ui/catalog-http-server.js";
import { registerCatalogHttp } from "../src/ui/register-catalog-http.js";

describe("local catalog HTTP app", () => {
  it("registers a browser-launch tool without inline UI metadata", async () => {
    const toolConfigs = new Map<string, Record<string, unknown>>();
    const toolHandlers = new Map<string, (args: Record<string, unknown>) => Promise<Record<string, unknown>>>();
    const server = {
      registerTool: (name: string, config: Record<string, unknown>, handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
        toolConfigs.set(name, config);
        toolHandlers.set(name, handler);
        return {};
      },
    };
    const catalogHttp = {
      open: vi.fn(async () => ({
        url: "http://127.0.0.1:43210/launch/token?query=two-sum",
        origin: "http://127.0.0.1:43210",
        presentation: "codex-browser" as const,
        workspaceRoot: "/workspace",
        solutionRoot: "/workspace",
      })),
      closeCatalog: vi.fn(async () => ({ closed: true, alreadyClosed: false, blockedByCriticalActivity: false })),
    };

    registerCatalogHttp(server as never, catalogHttp as never);
    expect(toolConfigs.get("leetcode_open_catalog")?._meta).toBeUndefined();
    const result = await toolHandlers.get("leetcode_open_catalog")?.({ query: "two-sum", workspaceRoot: "/workspace" });
    expect(catalogHttp.open).toHaveBeenCalledWith("two-sum", "/workspace");
    expect(result?.structuredContent).toMatchObject({
      ok: true,
      data: { presentation: "codex-browser", origin: "http://127.0.0.1:43210" },
    });
    const closed = await toolHandlers.get("leetcode_close_catalog")?.({});
    expect(catalogHttp.closeCatalog).toHaveBeenCalledTimes(1);
    expect(closed?.structuredContent).toMatchObject({ ok: true, data: { closed: true } });
  });

  it("serves an authenticated loopback app and rejects cross-origin writes", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-http-"));
    const htmlPath = path.join(directory, "catalog.html");
    writeFileSync(htmlPath, "<!doctype html><style>body{color:black}</style><script>window.ready=true</script>");
    const createSolution = vi.fn(async (_problemId: number, _langSlug: string, directoryInput: string) => ({
      filePath: path.join(directoryInput, "two-sum.ts"),
      metadataPath: path.join(directoryInput, "metadata.json"),
      created: true,
      codeHash: "a".repeat(64),
    }));
    const readSolution = vi.fn((filePath: string) => ({
      filePath,
      content: "function twoSum() {}",
      codeHash: "a".repeat(64),
    }));
    const saveSolution = vi.fn((filePath: string, _directoryInput: string, content: string) => ({
      filePath,
      content,
      codeHash: "b".repeat(64),
    }));
    const searchProblems = vi.fn((query: string) => [{ id: 1, frontendId: "1", slug: "two-sum", title: query }]);
    const getAuthStatus = vi.fn(async () => ({ signedIn: false, username: null, premium: false }));
    const startBrowserLogin = vi.fn(() => ({
      flowId: "fa543836-05e7-4fd0-914a-a661c27b199e",
      state: "WAITING_FOR_USER",
    }));
    const getBrowserLoginStatus = vi.fn(() => ({
      flowId: "fa543836-05e7-4fd0-914a-a661c27b199e",
      state: "WAITING_FOR_USER",
    }));
    const cancelBrowserLogin = vi.fn(() => ({
      flowId: "fa543836-05e7-4fd0-914a-a661c27b199e",
      state: "CANCELLED",
    }));
    const importCookie = vi.fn(async () => ({ signedIn: true, username: "cookie-user", premium: false }));
    const importSession = vi.fn(async () => ({ signedIn: true, username: "local-user", premium: false }));
    const runRemote = vi.fn(async () => ({ jobId: 9, remoteId: "run-9" }));
    const dependencies: CatalogHttpDependencies = {
      getCatalogStats: () => ({ total: 1, lastUpdatedAt: null, categories: [] }),
      searchProblems,
      startFullSync: () => 7,
      getSyncStatus: (runId) => ({ runId, state: "READY" }),
      getAuthStatus,
      startBrowserLogin,
      getBrowserLoginStatus,
      cancelBrowserLogin,
      importCookie,
      importSession,
      forgetSession: () => ({ forgotten: true }),
      getProblem: async (problemId) => ({ id: problemId, slug: "two-sum" }),
      createSolution,
      readSolution,
      saveSolution,
      runRemote,
      prepareSubmission: () => ({ confirmationToken: "fa543836-05e7-4fd0-914a-a661c27b199e" }),
      submitSolution: async () => ({ jobId: 10, remoteId: "submit-10" }),
      getJudgeResult: async () => ({ terminal: true, accepted: true }),
      cancelJudgePoll: (jobId) => ({ jobId, cancelled: true }),
      getLatestJudgeJob: () => null,
      prepareReview: async () => ({ problem: { id: 1 } }),
    };
    const catalogHttp = new CatalogHttpServer(dependencies, htmlPath);

    try {
      const launch = await catalogHttp.open("两数", directory);
      expect(launch.presentation).toBe("codex-browser");
      expect(launch.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(launch.solutionRoot).toBe(directory);

      const redirect = await fetch(launch.url, { redirect: "manual" });
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get("location")).toBe("/?query=%E4%B8%A4%E6%95%B0");
      const cookie = redirect.headers.get("set-cookie");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");

      const page = await fetch(`${launch.origin}${redirect.headers.get("location")}`, {
        headers: { Cookie: cookie ?? "" },
      });
      expect(page.status).toBe(200);
      expect(page.headers.get("content-security-policy")).toContain("script-src 'nonce-");
      expect(await page.text()).toContain("<script nonce=");

      const bootstrap = await fetch(`${launch.origin}/api/bootstrap?query=two-sum`, {
        headers: { Cookie: cookie ?? "" },
      });
      expect(await bootstrap.json()).toMatchObject({
        ok: true,
        data: {
          query: "two-sum",
          stats: { total: 1 },
          problems: [{ slug: "two-sum" }],
          workspace: { workspaceRoot: directory, solutionRoot: directory, customized: false },
        },
      });

      const pageId = "cc669e33-bec4-4c93-831f-48d8bf79a033";
      const registerClient = await fetch(`${launch.origin}/api/clients/register`, {
        method: "POST",
        headers: { Cookie: cookie ?? "", Origin: launch.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      expect(await registerClient.json()).toMatchObject({ ok: true, data: { pageId, activeClients: 1 } });
      const heartbeat = await fetch(`${launch.origin}/api/clients/heartbeat`, {
        method: "POST",
        headers: { Cookie: cookie ?? "", Origin: launch.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      expect(await heartbeat.json()).toMatchObject({ ok: true, data: { activeClients: 1 } });

      const sharedDirectory = path.join(directory, "shared-solutions");
      const updateDirectory = await fetch(`${launch.origin}/api/settings/solution-root`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ directory: sharedDirectory }),
      });
      expect(await updateDirectory.json()).toEqual({
        ok: true,
        data: { workspaceRoot: directory, solutionRoot: sharedDirectory, customized: true },
      });

      const createCode = await fetch(`${launch.origin}/api/tools/leetcode_create_solution`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ problemId: 1, langSlug: "typescript" }),
      });
      expect(await createCode.json()).toMatchObject({
        ok: true,
        data: {
          filePath: path.join(sharedDirectory, "two-sum.ts"),
          editor: {
            content: "function twoSum() {}",
            codeHash: "a".repeat(64),
          },
        },
      });
      expect(createSolution).toHaveBeenCalledWith(1, "typescript", sharedDirectory);

      const saveCode = await fetch(`${launch.origin}/api/editor/save`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filePath: path.join(sharedDirectory, "two-sum.ts"),
          content: "function twoSum() { return []; }",
          expectedHash: "a".repeat(64),
        }),
      });
      expect(await saveCode.json()).toMatchObject({
        ok: true,
        data: { content: "function twoSum() { return []; }", codeHash: "b".repeat(64) },
      });
      expect(saveSolution).toHaveBeenCalledWith(
        path.join(sharedDirectory, "two-sum.ts"),
        sharedDirectory,
        "function twoSum() { return []; }",
        "a".repeat(64),
      );

      const localCall = await fetch(`${launch.origin}/api/tools/leetcode_start_full_sync`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(await localCall.json()).toEqual({ ok: true, data: { runId: 7 } });

      const filtered = await fetch(`${launch.origin}/api/tools/leetcode_search_problems`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "two",
          filters: { difficulties: ["Easy"], categories: ["algorithms"], paid: "free", favorite: false },
          limit: 50,
          offset: 0,
        }),
      });
      expect(await filtered.json()).toMatchObject({ ok: true, data: [{ slug: "two-sum" }] });
      expect(searchProblems).toHaveBeenLastCalledWith("two", 50, 0, {
        difficulties: ["Easy"],
        categories: ["algorithms"],
        paid: "free",
        favorite: false,
      });

      const invalidFilter = await fetch(`${launch.origin}/api/tools/leetcode_search_problems`, {
        method: "POST",
        headers: { Cookie: cookie ?? "", Origin: launch.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "", filters: { difficulties: ["Legendary"] }, limit: 50, offset: 0 }),
      });
      expect(await invalidFilter.json()).toMatchObject({
        ok: false,
        error: { code: "INVALID_INPUT", retryable: false },
      });

      const login = await fetch(`${launch.origin}/api/tools/leetcode_import_session`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session: "session-value", csrf: "csrf-value" }),
      });
      expect(await login.json()).toMatchObject({ ok: true, data: { signedIn: true, username: "local-user" } });
      expect(importSession).toHaveBeenCalledWith("session-value", "csrf-value");

      const browserLogin = await fetch(`${launch.origin}/api/tools/leetcode_start_browser_login`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(await browserLogin.json()).toMatchObject({
        ok: true,
        data: { state: "WAITING_FOR_USER" },
      });
      expect(startBrowserLogin).toHaveBeenCalledWith("system");

      const browserLoginStatus = await fetch(
        `${launch.origin}/api/tools/leetcode_get_browser_login_status`,
        {
          method: "POST",
          headers: {
            Cookie: cookie ?? "",
            Origin: launch.origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ flowId: "fa543836-05e7-4fd0-914a-a661c27b199e" }),
        },
      );
      expect(await browserLoginStatus.json()).toMatchObject({ ok: true, data: { state: "WAITING_FOR_USER" } });

      const browserLoginCancel = await fetch(`${launch.origin}/api/tools/leetcode_cancel_browser_login`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flowId: "fa543836-05e7-4fd0-914a-a661c27b199e" }),
      });
      expect(await browserLoginCancel.json()).toMatchObject({ ok: true, data: { state: "CANCELLED" } });

      const cookieLogin = await fetch(`${launch.origin}/api/tools/leetcode_import_cookie`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cookie: "LEETCODE_SESSION=session-value; csrftoken=csrf-value",
        }),
      });
      expect(await cookieLogin.json()).toMatchObject({
        ok: true,
        data: { signedIn: true, username: "cookie-user" },
      });
      expect(importCookie).toHaveBeenCalledWith(
        "LEETCODE_SESSION=session-value; csrftoken=csrf-value",
        "system",
      );

      const remoteRun = await fetch(`${launch.origin}/api/tools/leetcode_remote_run`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: launch.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filePath: path.join(sharedDirectory, "two-sum.ts"), input: "[]\n0" }),
      });
      expect(await remoteRun.json()).toEqual({ ok: true, data: { jobId: 9, remoteId: "run-9" } });
      expect(runRemote).toHaveBeenCalledTimes(1);

      const crossOriginCall = await fetch(`${launch.origin}/api/tools/leetcode_start_full_sync`, {
        method: "POST",
        headers: {
          Cookie: cookie ?? "",
          Origin: "https://example.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(crossOriginCall.status).toBe(403);

      const releaseClient = await fetch(`${launch.origin}/api/clients/release`, {
        method: "POST",
        headers: { Cookie: cookie ?? "", Origin: launch.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      expect(await releaseClient.json()).toEqual({ ok: true, data: { released: true, activeClients: 0 } });
    } finally {
      await catalogHttp.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("closes idempotently, rotates authorization, and can reopen", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-close-"));
    const htmlPath = path.join(directory, "catalog.html");
    writeFileSync(htmlPath, "<!doctype html><div>catalog</div>");
    const catalogHttp = new CatalogHttpServer(createDependencies(), htmlPath);
    try {
      const first = await catalogHttp.open("", directory);
      expect(catalogHttp.isRunning()).toBe(true);
      await expect(catalogHttp.closeCatalog()).resolves.toEqual({
        closed: true,
        alreadyClosed: false,
        blockedByCriticalActivity: false,
      });
      await expect(catalogHttp.closeCatalog()).resolves.toEqual({
        closed: false,
        alreadyClosed: true,
        blockedByCriticalActivity: false,
      });
      const second = await catalogHttp.open("", directory);
      expect(second.url).not.toBe(first.url);
      expect(catalogHttp.isRunning()).toBe(true);
    } finally {
      await catalogHttp.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("closes through the authenticated HTTP endpoint without terminating its owner", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-http-close-"));
    const htmlPath = path.join(directory, "catalog.html");
    writeFileSync(htmlPath, "<!doctype html><div>catalog</div>");
    const catalogHttp = new CatalogHttpServer(createDependencies(), htmlPath);
    try {
      const launch = await catalogHttp.open("", directory);
      const redirect = await fetch(launch.url, { redirect: "manual" });
      const cookie = redirect.headers.get("set-cookie") ?? "";
      const close = await fetch(`${launch.origin}/api/catalog/close`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: launch.origin, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(await close.json()).toMatchObject({ ok: true, data: { closed: true } });
      await new Promise((resolve) => setTimeout(resolve, 15));
      expect(catalogHttp.isRunning()).toBe(false);
      await catalogHttp.open("", directory);
      expect(catalogHttp.isRunning()).toBe(true);
    } finally {
      await catalogHttp.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps an idle listener alive during critical work and reclaims it afterwards", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-idle-"));
    const htmlPath = path.join(directory, "catalog.html");
    writeFileSync(htmlPath, "<!doctype html><div>catalog</div>");
    let critical = true;
    const catalogHttp = new CatalogHttpServer(
      { ...createDependencies(), hasCriticalActivity: () => critical },
      htmlPath,
      { heartbeatIntervalMs: 5, leaseExpiresAfterMs: 10, sweepIntervalMs: 5, idleCloseAfterMs: 10 },
    );
    try {
      const launch = await catalogHttp.open("", directory);
      const redirect = await fetch(launch.url, { redirect: "manual" });
      const cookie = redirect.headers.get("set-cookie") ?? "";
      const pageId = "2aed256f-e5bf-4dbc-b4d8-63e170b5c59f";
      await fetch(`${launch.origin}/api/clients/register`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: launch.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      await fetch(`${launch.origin}/api/clients/release`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: launch.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      await new Promise((resolve) => setTimeout(resolve, 35));
      expect(catalogHttp.isRunning()).toBe(true);
      critical = false;
      await new Promise((resolve) => setTimeout(resolve, 35));
      expect(catalogHttp.isRunning()).toBe(false);
    } finally {
      await catalogHttp.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function createDependencies(): CatalogHttpDependencies {
  return {
    getCatalogStats: () => ({ total: 0, lastUpdatedAt: null, categories: [] }),
    searchProblems: () => [],
    startFullSync: () => 1,
    getSyncStatus: () => null,
    getAuthStatus: async () => ({ signedIn: false, username: null, premium: false }),
    startBrowserLogin: () => ({ flowId: null, state: "IDLE" }),
    getBrowserLoginStatus: () => ({ flowId: null, state: "IDLE" }),
    cancelBrowserLogin: () => ({ flowId: null, state: "CANCELLED" }),
    importCookie: async () => ({ signedIn: true }),
    importSession: async () => ({ signedIn: true }),
    forgetSession: () => ({ forgotten: true }),
    getProblem: async () => ({ id: 1 }),
    createSolution: async () => ({ filePath: "solution.ts", metadataPath: "metadata.json", created: true, codeHash: "a".repeat(64) }),
    readSolution: (filePath) => ({ filePath, content: "", codeHash: "a".repeat(64) }),
    saveSolution: (filePath, _directory, content) => ({ filePath, content, codeHash: "b".repeat(64) }),
    runRemote: async () => ({ jobId: 1, remoteId: "run-1" }),
    prepareSubmission: () => ({ confirmationToken: "token" }),
    submitSolution: async () => ({ jobId: 2, remoteId: "submit-2" }),
    getJudgeResult: async () => ({ terminal: true }),
    cancelJudgePoll: () => ({ cancelled: true }),
    getLatestJudgeJob: () => null,
    prepareReview: async () => ({}),
  };
}
