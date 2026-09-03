import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toToolResult } from "../core/result.js";
import type { CatalogHttpServer } from "./catalog-http-server.js";

export function registerCatalogHttp(server: McpServer, catalogHttp: CatalogHttpServer): void {
  server.registerTool(
    "leetcode_open_catalog",
    {
      title: "Open LeetCode catalog in Browser",
      description: "Start the loopback-only LeetCode catalog web app and return its local URL. Open the returned URL in the Codex built-in Browser panel; do not render it as an inline MCP component.",
      inputSchema: {
        query: z.string().max(200).default(""),
        workspaceRoot: z.string().max(4_096).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ query, workspaceRoot }) => {
      const result = await toToolResult(() => catalogHttp.open(query, workspaceRoot));
      const text = result.ok
        ? `本地力扣题库已启动：${result.data.url}\n公共解答目录：${result.data.solutionRoot ?? "尚未设置"}\n请把这个 URL 打开到 Codex 右侧 Browser 面板。`
        : JSON.stringify(result, null, 2);
      return {
        structuredContent: result,
        content: [{ type: "text", text }],
      };
    },
  );

  server.registerTool(
    "leetcode_close_catalog",
    {
      title: "Close LeetCode catalog HTTP app",
      description: "Stop the loopback-only catalog listener without stopping the LeetCode MCP server. Calling it repeatedly is safe.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      const result = await toToolResult(() => catalogHttp.closeCatalog());
      const text = result.ok
        ? result.data.alreadyClosed
          ? "本地题库前端已经关闭；MCP 插件仍在运行。"
          : "本地题库前端已关闭；MCP 插件仍在运行，需要时可再次打开。"
        : JSON.stringify(result, null, 2);
      return {
        structuredContent: result,
        content: [{ type: "text", text }],
      };
    },
  );
}
