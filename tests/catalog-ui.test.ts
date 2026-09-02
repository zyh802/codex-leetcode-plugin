import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOG_UI_URI, registerCatalogUi } from "../src/ui/register-catalog-ui.js";
import { LeetCodeDatabase } from "../src/storage/database.js";

describe("catalog MCP App", () => {
  it("registers a decoupled render tool and standards-based UI resource", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-ui-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    let toolConfig: Record<string, unknown> | undefined;
    let toolHandler: ((args: { query: string }) => Promise<Record<string, unknown>>) | undefined;
    let resourceConfig: Record<string, unknown> | undefined;
    const server = {
      registerTool: (_name: string, config: Record<string, unknown>, handler: typeof toolHandler) => {
        toolConfig = config;
        toolHandler = handler;
        return {};
      },
      registerResource: (
        _name: string,
        _uri: string,
        config: Record<string, unknown>,
        _handler: unknown,
      ) => {
        resourceConfig = config;
        return {};
      },
    };

    try {
      database.upsertCatalog([{
        questionId: "1",
        frontendId: "1",
        slug: "two-sum",
        title: "两数之和",
        difficulty: "Easy",
        paidOnly: false,
        totalAccepted: 1,
        totalSubmitted: 2,
        status: null,
        category: "algorithms",
      }]);

      registerCatalogUi(server as never, database);
      const metadata = toolConfig?._meta as Record<string, unknown>;
      expect(metadata.ui).toEqual({ resourceUri: CATALOG_UI_URI });
      expect(metadata["ui/resourceUri"]).toBe(CATALOG_UI_URI);
      expect(resourceConfig?.mimeType).toBe("text/html;profile=mcp-app");

      const result = await toolHandler?.({ query: "两数" });
      expect(result?.structuredContent).toMatchObject({
        stats: { total: 1 },
        query: "两数",
        problems: [{ frontendId: "1", slug: "two-sum" }],
      });
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
