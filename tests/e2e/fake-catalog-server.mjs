import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const html = await readFile(path.resolve("dist/ui/catalog.html"), "utf8");
let signedIn = true;
let loginChecks = 0;
let submitCalls = 0;
const problem = { id: 1, frontendId: "1", slug: "two-sum", title: "Two Sum", difficulty: "Easy", paidOnly: false, status: "ac", favorite: true, categories: ["algorithms"] };
const detail = {
  ...problem,
  questionId: "1",
  translatedTitle: "两数之和",
  contents: [{ locale: "zh-CN", html: "<p>给定一个整数数组，返回目标和对应的下标。</p>", plainText: "给定一个整数数组" }],
  templates: [{ langSlug: "typescript", langName: "TypeScript", starterCode: "function twoSum() {}" }],
  tags: [{ slug: "array", name: "Array", translatedName: "数组" }],
  samples: [{ ordinal: 1, input: "[2,7,11,15]\n9", source: "sampleTestCase" }],
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4179");
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/catalog.html")) return sendHtml(response);
  if (url.pathname === "/__test/reset") { signedIn = true; loginChecks = 0; submitCalls = 0; return send(response, { ok: true }); }
  if (url.pathname === "/__test/signout") { signedIn = false; loginChecks = 0; return send(response, { ok: true }); }
  if (url.pathname === "/__test/state") return send(response, { signedIn, submitCalls });
  const body = request.method === "POST" ? await bodyOf(request) : {};
  if (url.pathname === "/api/bootstrap") return send(response, { ok: true, data: { stats: { total: 1, lastUpdatedAt: null, categories: [{ category: "algorithms", count: 1 }] }, query: "", problems: [problem], workspace: { workspaceRoot: "/workspace", solutionRoot: "/workspace", customized: false } } });
  if (url.pathname === "/api/clients/register" || url.pathname === "/api/clients/heartbeat") return send(response, { ok: true, data: { pageId: body.pageId, activeClients: 1, heartbeatIntervalMs: 30_000, expiresAfterMs: 120_000 } });
  if (url.pathname === "/api/clients/release") return send(response, { ok: true, data: { released: true, activeClients: 0 } });
  if (url.pathname === "/api/catalog/close") return send(response, { ok: true, data: { closed: true, alreadyClosed: false, blockedByCriticalActivity: false } });
  if (url.pathname === "/api/settings/solution-root") return send(response, { ok: true, data: { workspaceRoot: "/workspace", solutionRoot: body.directory ?? "/workspace", customized: body.directory !== null } });
  if (url.pathname === "/api/editor/save") return send(response, { ok: true, data: { filePath: body.filePath, content: body.content, codeHash: "b".repeat(64) } });
  if (url.pathname === "/api/tools/leetcode_auth_status") return send(response, { ok: true, data: { signedIn, username: signedIn ? "codex-user" : null, premium: false, persistence: signedIn ? "system" : null } });
  if (url.pathname === "/api/tools/leetcode_get_browser_login_status") {
    loginChecks += 1;
    if (loginChecks >= 2) signedIn = true;
    return send(response, { ok: true, data: { flowId: loginChecks ? "90a2e438-0df9-424f-914f-7107f7f0bd55" : null, state: signedIn ? "SUCCEEDED" : "IDLE", message: signedIn ? "已登录。" : "尚未开始浏览器登录。", startedAt: null, updatedAt: new Date().toISOString(), username: signedIn ? "codex-user" : null, premium: false, persistence: signedIn ? "system" : null } });
  }
  if (url.pathname === "/api/tools/leetcode_start_browser_login") return send(response, { ok: true, data: { flowId: "90a2e438-0df9-424f-914f-7107f7f0bd55", state: "WAITING_FOR_USER", message: "请完成登录。", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), username: null, premium: null, persistence: "system" } });
  if (url.pathname === "/api/tools/leetcode_search_problems") return send(response, { ok: true, data: [problem] });
  if (url.pathname === "/api/tools/leetcode_get_problem") return send(response, { ok: true, data: detail });
  if (url.pathname === "/api/tools/leetcode_create_solution") return send(response, { ok: true, data: { filePath: "/workspace/two-sum.ts", metadataPath: "/workspace/meta.json", created: true, codeHash: "a".repeat(64), editor: { filePath: "/workspace/two-sum.ts", content: "function twoSum() {}", codeHash: "a".repeat(64) } } });
  if (url.pathname === "/api/tools/leetcode_get_latest_judge_job") return send(response, { ok: true, data: null });
  if (url.pathname === "/api/tools/leetcode_remote_run") return send(response, { ok: true, data: { jobId: 7, remoteId: "run-7" } });
  if (url.pathname === "/api/tools/leetcode_get_judge_result") return send(response, { ok: true, data: { terminal: true, accepted: true, statusMessage: "Accepted", passedTestcases: 3, totalTestcases: 3, runtime: "1 ms", memory: "12 MB" } });
  if (url.pathname === "/api/tools/leetcode_prepare_submission") return send(response, { ok: true, data: { confirmationToken: "f6c82a7f-0ee1-4b71-9bef-e0a9e36ad640", problemId: 1, slug: "two-sum", langSlug: "typescript", filePath: "/workspace/two-sum.ts", codeHash: "b".repeat(64), expiresAt: new Date(Date.now() + 60_000).toISOString() } });
  if (url.pathname === "/api/tools/leetcode_submit_solution") { submitCalls += 1; return send(response, { ok: true, data: { jobId: 8, remoteId: "submit-8" } }); }
  if (url.pathname === "/api/tools/leetcode_prepare_review") return send(response, { ok: true, data: {} });
  if (url.pathname === "/api/tools/leetcode_start_full_sync") return send(response, { ok: true, data: { runId: 1 } });
  if (url.pathname === "/api/tools/leetcode_get_sync_status") return send(response, { ok: true, data: { runId: 1, state: "READY", catalogUnique: 1, catalogCategoriesTotal: 4, catalogCategoriesSynced: 4, failedCategories: 0, pendingCategories: 0, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() } });
  if (url.pathname === "/api/tools/leetcode_get_catalog_stats") return send(response, { ok: true, data: { total: 1, lastUpdatedAt: null, categories: [{ category: "algorithms", count: 1 }] } });
  return send(response, { ok: false, error: { code: "NOT_FOUND", message: url.pathname, retryable: false } }, 404);
}).listen(4179, "127.0.0.1");

function sendHtml(response) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(html);
}
function send(response, value, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}
async function bodyOf(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
