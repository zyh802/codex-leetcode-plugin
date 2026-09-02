import { readFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type { LeetCodeDatabase } from "../storage/database.js";

export const CATALOG_UI_URI = "ui://codex-leetcode/catalog.html";

export function registerCatalogUi(server: McpServer, database: LeetCodeDatabase): void {
  registerAppTool(
    server,
    "leetcode_open_catalog",
    {
      title: "Open LeetCode catalog",
      description: "Open the interactive LeetCode catalog browser. Use this when the user wants to browse or choose problems visually.",
      inputSchema: {
        query: z.string().max(200).default(""),
      },
      _meta: {
        ui: { resourceUri: CATALOG_UI_URI },
        "openai/outputTemplate": CATALOG_UI_URI,
        "openai/toolInvocation/invoking": "正在打开力扣题库…",
        "openai/toolInvocation/invoked": "力扣题库已打开",
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ query }) => {
      const initialState = {
        stats: database.getCatalogStats(),
        query,
        problems: database.searchProblems(query, 50, 0),
      };
      return {
        structuredContent: initialState,
        content: [{
          type: "text",
          text: `已打开力扣题库；本地目录包含 ${initialState.stats.total} 道题。`,
        }],
      };
    },
  );

  registerAppResource(
    server,
    "Codex LeetCode catalog",
    CATALOG_UI_URI,
    {
      description: "Interactive catalog, live problem detail, and solution workspace creator.",
      _meta: { ui: { prefersBorder: false, csp: { resourceDomains: leetCodeAssetDomains } } },
    },
    async () => {
      const html = await readFile(path.join(import.meta.dirname, "catalog.html"), "utf8");
      return {
        contents: [{
          uri: CATALOG_UI_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: { prefersBorder: false, csp: { resourceDomains: leetCodeAssetDomains } },
          },
        }],
      };
    },
  );
}

const leetCodeAssetDomains = [
  "https://leetcode.cn",
  "https://assets.leetcode.cn",
  "https://pic.leetcode.cn",
  "https://leetcode.com",
  "https://assets.leetcode.com",
  "https://s3-lc-upload.s3.amazonaws.com",
];
