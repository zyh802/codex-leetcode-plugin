import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "leetcode fresh install "));
const pluginRoot = path.join(temporary, "standalone plugin");
const dataRoot = path.join(temporary, "user data");
const clients = [];
const logs = [];
const start = async () => {
  const config = JSON.parse(readFileSync(path.join(pluginRoot, ".mcp.json"), "utf8")).mcpServers.leetcode;
  const client = new Client({ name: "marketplace-smoke", version: "1.0.0" });
  clients.push(client);
  const transport = new StdioClientTransport({ command: process.execPath, args: config.args, cwd: temporary, stderr: "pipe",
    env: { ...process.env, PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_ROOT: pluginRoot, PLUGIN_DATA: dataRoot, CODEX_LEETCODE_DATA_DIR: dataRoot } });
  transport.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  const before = Date.now();
  await client.connect(transport, { timeout: 5000 });
  assert.ok(Date.now() - before < 5000, "Cold dependency setup blocked MCP initialization");
  const catalog = await client.listTools();
  assert.equal(catalog.tools.length, 25);
  return client;
};
const health = async (client) => {
  const deadline = Date.now() + 210_000;
  while (Date.now() < deadline) {
    const result = await client.callTool({ name: "leetcode_health", arguments: {} });
    if (!result.isError) return result;
    const message = JSON.stringify(result);
    if (!message.includes("仍在准备")) throw new Error(message);
  }
  throw new Error("Runtime never became ready");
};

try {
  cpSync(path.join(root, "plugins/codex-leecode-plugin"), pluginRoot, { recursive: true });
  assert.equal(existsSync(path.join(pluginRoot, "node_modules")), false);
  assert.equal(existsSync(path.join(pluginRoot, "src")), false);
  const [first, second] = await Promise.all([start(), start()]);
  await Promise.all([health(first), health(second)]);
  assert.equal(logs.join("").split("首次启动，正在准备").length - 1, 1, "Concurrent hosts installed runtime more than once");
  const catalog = await first.callTool({ name: "leetcode_open_catalog", arguments: { workspaceRoot: temporary } });
  assert.equal(catalog.structuredContent?.ok, true);
  const launch = catalog.structuredContent.data;
  const redirect = await fetch(launch.url, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  const page = await fetch(`${launch.origin}${redirect.headers.get("location")}`, { headers: { Cookie: redirect.headers.get("set-cookie") } });
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("Codex LeetCode 题库"));
  const closed = await first.callTool({ name: "leetcode_close_catalog", arguments: {} });
  assert.equal(closed.structuredContent?.data?.closed, true);
  await assert.rejects(fetch(launch.origin), "Explicit close left the HTTP listener running");
  await health(first);
  await first.close();
  await second.close();
  const runtimeDirectory = path.join(dataRoot, "runtime");
  const cache = readdirSync(runtimeDirectory);
  assert.equal(cache.length, 1);
  const readyFile = path.join(runtimeDirectory, cache[0], ".ready");
  const before = statSync(readyFile).mtimeMs;
  const warm = await start();
  await health(warm);
  assert.equal(statSync(readyFile).mtimeMs, before, "Warm start reinstalled dependencies");
  const reopened = await warm.callTool({ name: "leetcode_open_catalog", arguments: { workspaceRoot: temporary } });
  assert.equal(reopened.structuredContent?.ok, true);
  await warm.close();
  await assert.rejects(fetch(reopened.structuredContent.data.origin), "Closing MCP left the child HTTP listener running");
  process.stdout.write("Marketplace smoke passed: isolated bundle, fast cold handshake, one concurrent install, HTTP catalog, listener close, warm cache, child shutdown.\n");
} catch (error) {
  process.stderr.write(logs.join(""));
  throw error;
} finally {
  for (const client of clients) await client.close();
  rmSync(temporary, { recursive: true, force: true });
}
