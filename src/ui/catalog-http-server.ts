import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { z } from "zod";
import { AppError } from "../core/errors.js";
import { toToolResult } from "../core/result.js";

export interface CatalogHttpDependencies {
  getCatalogStats(): unknown;
  searchProblems(query: string, limit: number, offset: number): unknown;
  startFullSync(): number;
  getSyncStatus(runId?: number): unknown;
  getProblem(problemId: number): Promise<unknown>;
  createSolution(problemId: number, langSlug: string, directory: string): Promise<{
    filePath: string;
    metadataPath: string;
    created: boolean;
    codeHash: string;
  }>;
  readSolution(filePath: string, directory: string): {
    filePath: string;
    content: string;
    codeHash: string;
  };
  saveSolution(filePath: string, directory: string, content: string, expectedHash: string): {
    filePath: string;
    content: string;
    codeHash: string;
  };
}

export interface CatalogLaunch {
  url: string;
  origin: string;
  presentation: "codex-browser";
  workspaceRoot: string | null;
  solutionRoot: string | null;
}

export interface CatalogWorkspaceSettings {
  workspaceRoot: string | null;
  solutionRoot: string | null;
  customized: boolean;
}

const toolSchemas = {
  leetcode_search_problems: z.object({
    query: z.string().max(200).default(""),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  leetcode_get_problem: z.object({ problemId: z.number().int().positive() }),
  leetcode_start_full_sync: z.object({}),
  leetcode_get_sync_status: z.object({ runId: z.number().int().positive().optional() }),
  leetcode_get_catalog_stats: z.object({}),
  leetcode_create_solution: z.object({
    problemId: z.number().int().positive(),
    langSlug: z.string().min(1).max(64),
  }),
};

const solutionRootSchema = z.object({
  directory: z.string().trim().min(1).max(4_096).nullable(),
});

const editorSaveSchema = z.object({
  filePath: z.string().min(1).max(4_096),
  content: z.string().max(900_000),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/u),
});

type CatalogToolName = keyof typeof toolSchemas;

export class CatalogHttpServer {
  private readonly launchToken = randomBytes(32).toString("base64url");
  private readonly htmlPath: string;
  private server: NodeHttpServer | undefined;
  private origin: string | undefined;
  private starting: Promise<string> | undefined;
  private workspaceRoot: string | null = null;
  private solutionRoot: string | null = null;
  private readonly editableFilePaths = new Set<string>();

  constructor(
    private readonly dependencies: CatalogHttpDependencies,
    htmlPath = path.join(import.meta.dirname, "catalog.html"),
  ) {
    this.htmlPath = htmlPath;
  }

  async open(query = "", workspaceRoot?: string): Promise<CatalogLaunch> {
    this.selectWorkspaceRoot(workspaceRoot);
    const origin = await this.ensureStarted();
    const search = new URLSearchParams();
    const normalizedQuery = query.trim();
    if (normalizedQuery) search.set("query", normalizedQuery);
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return {
      url: `${origin}/launch/${this.launchToken}${suffix}`,
      origin,
      presentation: "codex-browser",
      workspaceRoot: this.workspaceRoot,
      solutionRoot: this.solutionRoot,
    };
  }

  getWorkspaceSettings(): CatalogWorkspaceSettings {
    return {
      workspaceRoot: this.workspaceRoot,
      solutionRoot: this.solutionRoot,
      customized: this.workspaceRoot !== null && this.solutionRoot !== this.workspaceRoot,
    };
  }

  setSolutionRoot(directory: string | null): CatalogWorkspaceSettings {
    if (directory === null) {
      if (this.solutionRoot !== this.workspaceRoot) this.editableFilePaths.clear();
      this.solutionRoot = this.workspaceRoot;
      return this.getWorkspaceSettings();
    }
    const base = this.workspaceRoot;
    if (!path.isAbsolute(directory) && base === null) {
      throw new AppError("INVALID_INPUT", "Set an absolute solution directory when no workspace is available.");
    }
    const nextRoot = path.resolve(base ?? process.cwd(), directory);
    if (nextRoot !== this.solutionRoot) this.editableFilePaths.clear();
    this.solutionRoot = nextRoot;
    return this.getWorkspaceSettings();
  }

  async close(): Promise<void> {
    if (this.starting) {
      await this.starting.catch(() => undefined);
    }
    const server = this.server;
    this.server = undefined;
    this.origin = undefined;
    if (!server?.listening) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  private async ensureStarted(): Promise<string> {
    if (this.origin) return this.origin;
    if (this.starting) return this.starting;

    const server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined);
          return;
        }
        this.sendJson(response, 500, {
          ok: false,
          error: { code: "INTERNAL", message: "Local catalog server failed.", retryable: true },
        });
      });
    });
    this.server = server;
    this.starting = new Promise<string>((resolve, reject) => {
      const handleError = (error: Error): void => reject(error);
      server.once("error", handleError);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", handleError);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Local catalog server did not receive a TCP address."));
          return;
        }
        const origin = `http://127.0.0.1:${(address as AddressInfo).port}`;
        this.origin = origin;
        server.unref();
        resolve(origin);
      });
    });

    try {
      return await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = this.origin;
    if (!origin) {
      this.sendJson(response, 503, {
        ok: false,
        error: { code: "NOT_READY", message: "Local catalog server is starting.", retryable: true },
      });
      return;
    }

    if (request.headers.host !== new URL(origin).host) {
      this.sendJson(response, 421, {
        ok: false,
        error: { code: "INVALID_HOST", message: "Invalid local host header.", retryable: false },
      });
      return;
    }

    const url = new URL(request.url ?? "/", origin);
    if (request.method === "GET" && url.pathname.startsWith("/launch/")) {
      const suppliedToken = decodeURIComponent(url.pathname.slice("/launch/".length));
      if (!safeEqual(suppliedToken, this.launchToken)) {
        this.sendJson(response, 404, {
          ok: false,
          error: { code: "NOT_FOUND", message: "Launch link is invalid.", retryable: false },
        });
        return;
      }
      const redirect = new URL("/", origin);
      const query = url.searchParams.get("query");
      if (query) redirect.searchParams.set("query", query.slice(0, 200));
      response.writeHead(302, {
        Location: `${redirect.pathname}${redirect.search}`,
        "Set-Cookie": sessionCookie(this.launchToken),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      response.end();
      return;
    }

    if (!this.isAuthorized(request)) {
      this.sendJson(response, 401, {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Open the catalog from Codex again.", retryable: true },
      });
      return;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/catalog.html")) {
      await this.sendCatalogHtml(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      const query = (url.searchParams.get("query") ?? "").slice(0, 200);
      this.sendJson(response, 200, {
        ok: true,
        data: {
          stats: this.dependencies.getCatalogStats(),
          query,
          problems: this.dependencies.searchProblems(query, 50, 0),
          workspace: this.getWorkspaceSettings(),
        },
      });
      return;
    }
    if (request.method === "POST" &&
      (url.pathname.startsWith("/api/tools/") || url.pathname.startsWith("/api/settings/") ||
        url.pathname.startsWith("/api/editor/"))) {
      if (request.headers.origin && request.headers.origin !== origin) {
        this.sendJson(response, 403, {
          ok: false,
          error: { code: "INVALID_ORIGIN", message: "Cross-origin requests are not allowed.", retryable: false },
        });
        return;
      }
      if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
        this.sendJson(response, 415, {
          ok: false,
          error: { code: "INVALID_CONTENT_TYPE", message: "Expected application/json.", retryable: false },
        });
        return;
      }
    }
    if (request.method === "POST" && url.pathname === "/api/settings/solution-root") {
      const input = solutionRootSchema.parse(await readJsonBody(request));
      this.sendJson(response, 200, { ok: true, data: this.setSolutionRoot(input.directory) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/editor/save") {
      const input = editorSaveSchema.parse(await readJsonBody(request));
      const result = await toToolResult(() => this.saveEditableSolution(
        input.filePath,
        input.content,
        input.expectedHash,
      ));
      this.sendJson(response, 200, result);
      return;
    }
    if (request.method === "POST" && url.pathname.startsWith("/api/tools/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/tools/".length));
      if (!isCatalogToolName(name)) {
        this.sendJson(response, 404, {
          ok: false,
          error: { code: "UNKNOWN_TOOL", message: "This tool is not available to the local UI.", retryable: false },
        });
        return;
      }
      const input = await readJsonBody(request);
      const result = await toToolResult(() => this.dispatch(name, input));
      this.sendJson(response, 200, result);
      return;
    }

    this.sendJson(response, 404, {
      ok: false,
      error: { code: "NOT_FOUND", message: "Local catalog route not found.", retryable: false },
    });
  }

  private isAuthorized(request: IncomingMessage): boolean {
    const cookieHeader = request.headers.cookie ?? "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .find(([name]) => name === "codex_leetcode_session")?.[1];
    return token !== undefined && safeEqual(token, this.launchToken);
  }

  private async dispatch(name: CatalogToolName, input: unknown): Promise<unknown> {
    switch (name) {
      case "leetcode_search_problems": {
        const args = toolSchemas.leetcode_search_problems.parse(input);
        return this.dependencies.searchProblems(args.query, args.limit, args.offset);
      }
      case "leetcode_get_problem": {
        const args = toolSchemas.leetcode_get_problem.parse(input);
        return this.dependencies.getProblem(args.problemId);
      }
      case "leetcode_start_full_sync": {
        toolSchemas.leetcode_start_full_sync.parse(input);
        return { runId: this.dependencies.startFullSync() };
      }
      case "leetcode_get_sync_status": {
        const args = toolSchemas.leetcode_get_sync_status.parse(input);
        return this.dependencies.getSyncStatus(args.runId);
      }
      case "leetcode_get_catalog_stats": {
        toolSchemas.leetcode_get_catalog_stats.parse(input);
        return this.dependencies.getCatalogStats();
      }
      case "leetcode_create_solution": {
        const args = toolSchemas.leetcode_create_solution.parse(input);
        if (this.solutionRoot === null) {
          throw new AppError("INVALID_INPUT", "Set the shared solution directory before creating code.");
        }
        const created = await this.dependencies.createSolution(args.problemId, args.langSlug, this.solutionRoot);
        const editor = this.dependencies.readSolution(created.filePath, this.solutionRoot);
        this.editableFilePaths.add(path.resolve(editor.filePath));
        return { ...created, editor };
      }
    }
  }

  private saveEditableSolution(filePath: string, content: string, expectedHash: string): unknown {
    if (this.solutionRoot === null) {
      throw new AppError("INVALID_INPUT", "Set the shared solution directory before saving code.");
    }
    const resolved = path.resolve(filePath);
    if (!this.editableFilePaths.has(resolved)) {
      throw new AppError("INVALID_INPUT", "This file was not opened by the current catalog editor.");
    }
    return this.dependencies.saveSolution(resolved, this.solutionRoot, content, expectedHash);
  }

  private selectWorkspaceRoot(input?: string): void {
    const candidate = input?.trim() || detectProcessWorkspaceRoot();
    if (!candidate) return;
    if (!path.isAbsolute(candidate)) {
      throw new AppError("INVALID_INPUT", "The current workspace root must be an absolute path.");
    }
    const resolved = path.resolve(candidate);
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new AppError("INVALID_INPUT", "The current workspace root is not an accessible directory.");
    }
    if (resolved !== this.workspaceRoot) {
      this.workspaceRoot = resolved;
      this.solutionRoot = resolved;
      this.editableFilePaths.clear();
    }
  }

  private async sendCatalogHtml(response: ServerResponse): Promise<void> {
    const nonce = randomBytes(18).toString("base64");
    const source = await readFile(this.htmlPath, "utf8");
    const html = source
      .replaceAll("<script", `<script nonce="${nonce}"`)
      .replaceAll("<style", `<style nonce="${nonce}"`);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "img-src 'self' data: https://leetcode.cn https://assets.leetcode.cn https://pic.leetcode.cn https://leetcode.com https://assets.leetcode.com https://s3-lc-upload.s3.amazonaws.com",
        "font-src 'self' data:",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(html);
  }

  private sendJson(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(JSON.stringify(value));
  }
}

function detectProcessWorkspaceRoot(): string | null {
  const cwd = path.resolve(process.cwd());
  const pluginRoots = [process.env.PLUGIN_ROOT, process.env.CLAUDE_PLUGIN_ROOT]
    .filter((value): value is string => Boolean(value))
    .map((value) => path.resolve(value));
  return pluginRoots.includes(cwd) ? null : cwd;
}

function isCatalogToolName(value: string): value is CatalogToolName {
  return Object.prototype.hasOwnProperty.call(toolSchemas, value);
}

function sessionCookie(token: string): string {
  return `codex_leetcode_session=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 1_000_000) throw new Error("Request body exceeds 1 MB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
