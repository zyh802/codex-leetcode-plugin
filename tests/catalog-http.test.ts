import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CatalogHttpServer, type CatalogHttpDependencies } from "../src/ui/catalog-http-server.js";
import { registerCatalogHttp } from "../src/ui/register-catalog-http.js";

describe("local catalog HTTP app", () => {
  it("registers a browser-launch tool without inline UI metadata", async () => {
    let toolConfig: Record<string, unknown> | undefined;
    let toolHandler: ((args: { query: string; workspaceRoot?: string }) => Promise<Record<string, unknown>>) | undefined;
    const server = {
      registerTool: (_name: string, config: Record<string, unknown>, handler: typeof toolHandler) => {
        toolConfig = config;
        toolHandler = handler;
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
    };

    registerCatalogHttp(server as never, catalogHttp as never);
    expect(toolConfig?._meta).toBeUndefined();
    const result = await toolHandler?.({ query: "two-sum", workspaceRoot: "/workspace" });
    expect(catalogHttp.open).toHaveBeenCalledWith("two-sum", "/workspace");
    expect(result?.structuredContent).toMatchObject({
      ok: true,
      data: { presentation: "codex-browser", origin: "http://127.0.0.1:43210" },
    });
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
    const dependencies: CatalogHttpDependencies = {
      getCatalogStats: () => ({ total: 1, lastUpdatedAt: null, categories: [] }),
      searchProblems: (query) => [{ id: 1, frontendId: "1", slug: "two-sum", title: query }],
      startFullSync: () => 7,
      getSyncStatus: (runId) => ({ runId, state: "READY" }),
      getProblem: async (problemId) => ({ id: problemId, slug: "two-sum" }),
      createSolution,
      readSolution,
      saveSolution,
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
    } finally {
      await catalogHttp.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
