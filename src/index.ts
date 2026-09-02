import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LeetCodeCnAdapter } from "./adapter/leetcode-cn.js";
import { HttpClient } from "./adapter/http-client.js";
import { loadConfig } from "./config.js";
import { log } from "./core/logger.js";
import { LeetCodeDatabase } from "./storage/database.js";
import { SyncEngine } from "./sync/sync-engine.js";
import { registerTools } from "./tools/register-tools.js";
import { KeyringSecretStore } from "./auth/secret-store.js";
import { SessionService } from "./auth/session-service.js";
import { WorkspaceManager } from "./workspace/workspace-manager.js";
import { RemoteJudgeService } from "./judge/remote-judge-service.js";
import { ReviewContextService } from "./review/review-context-service.js";
import { ProblemService } from "./problem/problem-service.js";
import { registerCatalogUi } from "./ui/register-catalog-ui.js";

const config = loadConfig();
const database = new LeetCodeDatabase(config.databasePath);
const http = new HttpClient({
  baseUrl: "https://leetcode.cn",
  requestIntervalMs: config.requestIntervalMs,
});
const adapter = new LeetCodeCnAdapter(http);
const sessionService = new SessionService(new KeyringSecretStore(), adapter);
const syncEngine = new SyncEngine(database, adapter, () => sessionService.getCredentials());
const problemService = new ProblemService(database, adapter, () => sessionService.getCredentials());
const workspaceManager = new WorkspaceManager(database);
const remoteJudge = new RemoteJudgeService(database, adapter, sessionService, workspaceManager);
const reviewContext = new ReviewContextService(database, workspaceManager, problemService);
const server = new McpServer({ name: "codex-leecode-plugin", version: "0.1.0" });

registerTools(
  server,
  database,
  syncEngine,
  sessionService,
  problemService,
  workspaceManager,
  remoteJudge,
  reviewContext,
);
registerCatalogUi(server, database);

const shutdown = (): void => {
  database.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
log("info", "LeetCode MCP server started", { databasePath: config.databasePath });
