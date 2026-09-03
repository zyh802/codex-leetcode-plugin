import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toToolResult } from "../core/result.js";
import type { LeetCodeDatabase } from "../storage/database.js";
import type { SyncEngine } from "../sync/sync-engine.js";
import type { SessionService } from "../auth/session-service.js";
import type { BrowserLoginService } from "../auth/browser-login-service.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";
import type { RemoteJudgeService } from "../judge/remote-judge-service.js";
import type { ReviewContextService } from "../review/review-context-service.js";
import type { ProblemService } from "../problem/problem-service.js";
import { completionStatuses, problemCategories, problemDifficulties } from "../domain/types.js";

export function registerTools(
  server: McpServer,
  database: LeetCodeDatabase,
  syncEngine: SyncEngine,
  sessionService: SessionService,
  browserLogin: BrowserLoginService,
  problemService: ProblemService,
  workspaceManager: WorkspaceManager,
  remoteJudge: RemoteJudgeService,
  reviewContext: ReviewContextService,
): void {
  server.registerTool(
    "leetcode_health",
    {
      description: "Check whether the local LeetCode MCP server and database are available.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => response(await toToolResult(() => ({ status: "ok", endpoint: "cn" }))),
  );

  server.registerTool(
    "leetcode_auth_status",
    {
      description: "Check the locally stored LeetCode session without exposing credentials.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => response(await toToolResult(() => sessionService.getStatus())),
  );

  server.registerTool(
    "leetcode_start_browser_login",
    {
      description: "Open a temporary local Chrome or Edge window on leetcode.cn and start an automatic browser login flow. Passwords and verification codes remain on the official site.",
      inputSchema: { persistence: z.enum(["system", "memory"]).default("system") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ persistence }) => response(await toToolResult(() => browserLogin.start(persistence))),
  );

  server.registerTool(
    "leetcode_get_browser_login_status",
    {
      description: "Read the current browser-login state without exposing cookies or other credentials.",
      inputSchema: { flowId: z.string().uuid().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ flowId }) => response(await toToolResult(() => browserLogin.getStatus(flowId))),
  );

  server.registerTool(
    "leetcode_cancel_browser_login",
    {
      description: "Cancel one active browser-login flow and remove its temporary browser profile.",
      inputSchema: { flowId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ flowId }) => response(await toToolResult(() => browserLogin.cancel(flowId))),
  );

  server.registerTool(
    "leetcode_import_cookie",
    {
      description: "Advanced fallback: validate a complete LeetCode Cookie header, extract the required values, and store them in the operating-system credential store.",
      inputSchema: {
        cookie: z.string().min(1).max(32_768),
        persistence: z.enum(["system", "memory"]).default("system"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ cookie, persistence }) => response(
      await toToolResult(() => sessionService.importCookie(cookie, persistence)),
    ),
  );

  server.registerTool(
    "leetcode_import_session",
    {
      description: "Compatibility fallback: validate separately supplied LeetCode session values and store them in the operating-system credential store.",
      inputSchema: {
        session: z.string().min(8).max(16_384),
        csrf: z.string().min(8).max(16_384),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ session, csrf }) => response(await toToolResult(() => sessionService.importSession({ session, csrf }))),
  );

  server.registerTool(
    "leetcode_forget_session",
    {
      description: "Delete only the saved LeetCode credential; local catalog and solution files remain untouched.",
      inputSchema: { confirm: z.literal(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async () => response(await toToolResult(() => {
      sessionService.forget();
      return { forgotten: true };
    })),
  );

  server.registerTool(
    "leetcode_start_full_sync",
    {
      description: "Synchronize the complete LeetCode CN problem catalog. Problem details are not prefetched or cached.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async () => response(await toToolResult(() => ({ runId: syncEngine.startFullSync() }))),
  );

  server.registerTool(
    "leetcode_get_sync_status",
    {
      description: "Read exact category progress for a complete LeetCode catalog synchronization run.",
      inputSchema: { runId: z.number().int().positive().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ runId }) => response(await toToolResult(() => database.getSyncStatus(runId))),
  );

  server.registerTool(
    "leetcode_pause_sync",
    {
      description: "Pause an active full synchronization after its current request.",
      inputSchema: { runId: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ runId }) => response(await toToolResult(() => {
      syncEngine.pause(runId);
      return { runId, pauseRequested: true };
    })),
  );

  server.registerTool(
    "leetcode_resume_sync",
    {
      description: "Resume a paused or partial full synchronization from local progress.",
      inputSchema: { runId: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ runId }) => response(await toToolResult(() => {
      syncEngine.resume(runId);
      return { runId, resumed: true };
    })),
  );

  server.registerTool(
    "leetcode_get_catalog_stats",
    {
      description: "Get local LeetCode catalog statistics without loading any problem details.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => response(await toToolResult(() => database.getCatalogStats())),
  );

  server.registerTool(
    "leetcode_search_problems",
    {
      description: "Search the complete locally synchronized catalog by problem number, title, or slug without network access.",
      inputSchema: {
        query: z.string().max(200).default(""),
        filters: z.object({
          difficulties: z.array(z.enum(problemDifficulties)).max(problemDifficulties.length).optional(),
          categories: z.array(z.enum(problemCategories)).max(problemCategories.length).optional(),
          paid: z.enum(["all", "free", "paid"]).default("all"),
          statuses: z.array(z.enum(completionStatuses)).max(completionStatuses.length).optional(),
          favorite: z.boolean().default(false),
        }).default({ paid: "all", favorite: false }),
        limit: z.number().int().min(1).max(100).default(30),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ query, filters, limit, offset }) => response(
      await toToolResult(() => database.searchProblems(query, limit, offset, filters)),
    ),
  );

  server.registerTool(
    "leetcode_get_problem",
    {
      description: "Fetch one selected problem's current statement, samples, tags, metadata, and templates from LeetCode. The detail is not cached locally.",
      inputSchema: { problemId: z.number().int().positive() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ problemId }) => response(await toToolResult(() => problemService.getProblem(problemId))),
  );

  server.registerTool(
    "leetcode_create_solution",
    {
      description: "Fetch the selected problem's current language template, then create or reuse a local solution without overwriting user code.",
      inputSchema: {
        problemId: z.number().int().positive(),
        langSlug: z.string().min(1).max(64),
        directory: z.string().min(1).max(4_096),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ problemId, langSlug, directory }) => response(await toToolResult(async () => {
      const template = await problemService.getSolutionTemplate(problemId, langSlug);
      return workspaceManager.createSolution(template, directory);
    })),
  );

  server.registerTool(
    "leetcode_resolve_solution",
    {
      description: "Resolve a solution file to its local problem, language, code region, and code hash.",
      inputSchema: { filePath: z.string().min(1).max(4_096) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ filePath }) => response(await toToolResult(() => workspaceManager.resolveSolution(filePath))),
  );

  server.registerTool(
    "leetcode_remote_run",
    {
      description: "Run the current solution against a sample or custom input using LeetCode's remote judge.",
      inputSchema: {
        filePath: z.string().min(1).max(4_096),
        input: z.string().max(1_000_000),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ filePath, input }) => response(await toToolResult(() => remoteJudge.run(filePath, input))),
  );

  server.registerTool(
    "leetcode_prepare_submission",
    {
      description: "Create a five-minute one-time confirmation token for the exact current solution code hash.",
      inputSchema: { filePath: z.string().min(1).max(4_096) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    },
    async ({ filePath }) => response(await toToolResult(() => remoteJudge.prepareSubmission(filePath))),
  );

  server.registerTool(
    "leetcode_submit_solution",
    {
      description: "Submit the exact confirmed solution to LeetCode. A fresh one-time confirmation token is required.",
      inputSchema: {
        filePath: z.string().min(1).max(4_096),
        confirmationToken: z.string().uuid(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ filePath, confirmationToken }) => response(
      await toToolResult(() => remoteJudge.submit(filePath, confirmationToken)),
    ),
  );

  server.registerTool(
    "leetcode_get_judge_result",
    {
      description: "Read or briefly wait for a remote Run or Submit result using its local job ID.",
      inputSchema: {
        jobId: z.number().int().positive(),
        waitMs: z.number().int().min(0).max(30_000).default(0),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ jobId, waitMs }) => response(await toToolResult(() => remoteJudge.getResult(jobId, waitMs))),
  );

  server.registerTool(
    "leetcode_cancel_judge_poll",
    {
      description: "Cancel only the active local polling loop for a judge job. The remote Run or Submit and its saved ticket remain recoverable.",
      inputSchema: { jobId: z.number().int().positive() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ jobId }) => response(await toToolResult(() => remoteJudge.cancelPoll(jobId))),
  );

  server.registerTool(
    "leetcode_prepare_review",
    {
      description: "Fetch the selected problem detail without caching it and prepare a scoped Codex review context with the solution and optional judge result.",
      inputSchema: {
        filePath: z.string().min(1).max(4_096),
        judgeJobId: z.number().int().positive().optional(),
        contestActive: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ filePath, judgeJobId, contestActive }) => response(
      await toToolResult(() => reviewContext.prepare(filePath, judgeJobId, contestActive)),
    ),
  );
}

function response(result: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
