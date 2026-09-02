import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const dataDir = mkdtempSync(path.join(tmpdir(), "codex-leetcode-mcp-"));
const pluginRoot = process.cwd();
const mcpConfig = JSON.parse(
  readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8"),
);
const serverConfig = mcpConfig.mcpServers.leetcode;
const omitPluginRoot = process.env.CODEX_LEETCODE_SMOKE_NO_PLUGIN_ROOT === "1";
const client = new Client({ name: "codex-leetcode-smoke", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: serverConfig.command,
  args: serverConfig.args,
  cwd: pluginRoot,
  env: {
    ...process.env,
    ...serverConfig.env,
    PLUGIN_ROOT: omitPluginRoot ? "" : pluginRoot,
    CLAUDE_PLUGIN_ROOT: omitPluginRoot ? "" : pluginRoot,
    PLUGIN_DATA: dataDir,
    CODEX_LEETCODE_DATA_DIR: dataDir,
  },
  stderr: "pipe",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const resources = await client.listResources();
  const health = await client.callTool({ name: "leetcode_health", arguments: {} });
  const catalog = await client.callTool({ name: "leetcode_open_catalog", arguments: {} });
  const ui = await client.readResource({ uri: "ui://codex-leetcode/catalog.html" });
  const uiText = ui.contents.find((content) => "text" in content)?.text ?? "";
  process.stdout.write(`${JSON.stringify({
    toolNames: tools.tools.map((tool) => tool.name),
    catalogToolMeta: tools.tools.find((tool) => tool.name === "leetcode_open_catalog")?._meta,
    resourceUris: resources.resources.map((resource) => resource.uri),
    ui: {
      mimeType: ui.contents[0]?.mimeType,
      bytes: Buffer.byteLength(uiText, "utf8"),
      containsCatalogTitle: uiText.includes("Codex LeetCode 题库"),
    },
    health: health.content,
    catalog: catalog.structuredContent,
  }, null, 2)}\n`);
} finally {
  await client.close();
  rmSync(dataDir, { recursive: true, force: true });
}
