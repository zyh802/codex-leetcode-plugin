import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { prepareRuntime, resolveDataRoot } from "./prepare-runtime.mjs";

const pluginRoot = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(path.join(pluginRoot, "tools.json"), "utf8"));
const dataRoot = resolveDataRoot();
const controller = new AbortController();
const server = new Server(catalog.serverInfo, { capabilities: { tools: {} } });
let connection;
let client;
let closed = false;

function connectRuntime() {
  if (connection) return connection;
  connection = (async () => {
    const entry = await prepareRuntime({ pluginRoot, dataRoot, signal: controller.signal });
    controller.signal.throwIfAborted();
    const candidate = new Client({ name: "codex-leetcode-launcher", version: "1.0.0" });
    client = candidate;
    const transport = new StdioClientTransport({
      command: process.execPath, args: [entry], stderr: "inherit",
      env: { ...process.env, PLUGIN_DATA: dataRoot, CODEX_LEETCODE_DATA_DIR: dataRoot },
    });
    await candidate.connect(transport);
    controller.signal.throwIfAborted();
    candidate.onclose = () => {
      if (client === candidate) { connection = undefined; client = undefined; }
    };
    return candidate;
  })();
  connection.catch(async (error) => {
    process.stderr.write(`[Codex LeetCode] ${error.message}\n`);
    await client?.close();
    connection = undefined;
    client = undefined;
  });
  return connection;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: catalog.tools }));
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  let timer;
  try {
    // Setup cannot hold a tool request forever or delay the initial MCP handshake.
    const runtime = await Promise.race([
      connectRuntime(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("本机依赖仍在准备中，本次工具尚未执行。请稍后重试；可先调用 leetcode_health 检查。")), 20_000); }),
    ]);
    extra.signal.throwIfAborted();
    return await runtime.callTool(request.params, undefined, { signal: extra.signal, timeout: 60_000 });
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: `Codex LeetCode：${error.message}` }] };
  } finally { clearTimeout(timer); }
});

const shutdown = async () => {
  if (closed) return;
  closed = true;
  controller.abort();
  await client?.close();
  if (connection) {
    let timer;
    await Promise.race([connection.catch(() => {}), new Promise((resolve) => { timer = setTimeout(resolve, 3000); })]);
    clearTimeout(timer);
  }
  await server.close();
  process.exit(0);
};
for (const event of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(event, () => void shutdown());
process.stdin.once("end", () => void shutdown());
server.onclose = () => void shutdown();
// Installation starts only after the host initializes this explicitly installed plugin.
server.oninitialized = () => { void connectRuntime(); };
await server.connect(new StdioServerTransport());
