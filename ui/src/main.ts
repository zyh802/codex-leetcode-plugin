import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import "./styles.css";

interface CatalogStats {
  total: number;
  lastUpdatedAt: string | null;
  categories: Array<{ category: string; count: number }>;
}

interface ProblemListItem {
  id: number;
  frontendId: string;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
  status: string | null;
  categories: string[];
}

interface ProblemDetail {
  id: number;
  frontendId: string;
  slug: string;
  title: string;
  translatedTitle: string | null;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
  contents: Array<{ locale: "en" | "zh-CN"; html: string; plainText: string }>;
  templates: Array<{ langSlug: string; langName: string; starterCode: string }>;
  tags: Array<{ slug: string; name: string; translatedName: string | null }>;
}

interface SyncStatus {
  runId: number;
  state: string;
  catalogUnique: number;
  catalogCategoriesTotal: number;
  catalogCategoriesSynced: number;
  failedCategories: number;
}

interface InitialState {
  stats: CatalogStats;
  query: string;
  problems: ProblemListItem[];
}

interface ToolEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
}

const PAGE_SIZE = 50;
const app = new App({ name: "Codex LeetCode Catalog", version: "0.1.0" }, {}, { strict: true });

const elements = {
  catalogSummary: required("catalog-summary"),
  syncButton: requiredButton("sync-button"),
  syncStatus: required("sync-status"),
  searchInput: requiredInput("search-input"),
  problemList: required("problem-list"),
  loadMore: requiredButton("load-more"),
  emptyState: required("empty-state"),
  detailPlaceholder: required("detail-placeholder"),
  detailLoading: required("detail-loading"),
  detailContent: required("detail-content"),
  detailKicker: required("detail-kicker"),
  detailTitle: required("detail-title"),
  detailDifficulty: required("detail-difficulty"),
  detailTags: required("detail-tags"),
  statement: required("statement"),
  languageSelect: requiredSelect("language-select"),
  directoryInput: requiredInput("directory-input"),
  createButton: requiredButton("create-button"),
  createResult: required("create-result"),
};

let query = "";
let offset = 0;
let problems: ProblemListItem[] = [];
let selectedProblem: ProblemDetail | null = null;
let searchSequence = 0;
let detailSequence = 0;
let searchTimer: number | undefined;
let catalogTotal = 0;

app.ontoolresult = (result) => {
  const initial = result.structuredContent as Partial<InitialState> | undefined;
  if (!initial?.stats || !Array.isArray(initial.problems)) return;
  query = typeof initial.query === "string" ? initial.query : "";
  elements.searchInput.value = query;
  problems = initial.problems;
  offset = problems.length;
  renderStats(initial.stats);
  renderProblemList();
};

elements.searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void search(elements.searchInput.value.trim(), false), 250);
});
elements.loadMore.addEventListener("click", () => void search(query, true));
elements.syncButton.addEventListener("click", () => void synchronizeCatalog());
elements.createButton.addEventListener("click", () => void createSolution());

try {
  await app.connect();
  const hostContext = app.getHostContext();
  applyDocumentTheme(hostContext?.theme ?? "light");
  if (hostContext?.styles?.variables) applyHostStyleVariables(hostContext.styles.variables);
  app.onhostcontextchanged = (context) => {
    if (context.theme) applyDocumentTheme(context.theme);
    if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  };
} catch (error) {
  showStatus(messageOf(error), "error");
}

async function search(nextQuery: string, append: boolean): Promise<void> {
  const sequence = ++searchSequence;
  const nextOffset = append && nextQuery === query ? offset : 0;
  if (!append) {
    query = nextQuery;
    problems = [];
    offset = 0;
    renderProblemList(true);
  }
  elements.loadMore.disabled = true;
  try {
    const nextPage = await callTool<ProblemListItem[]>("leetcode_search_problems", {
      query: nextQuery,
      limit: PAGE_SIZE,
      offset: nextOffset,
    });
    if (sequence !== searchSequence) return;
    query = nextQuery;
    problems = append ? [...problems, ...nextPage] : nextPage;
    offset = nextOffset + nextPage.length;
    renderProblemList();
    elements.loadMore.hidden = nextPage.length < PAGE_SIZE;
  } catch (error) {
    if (sequence === searchSequence) showStatus(messageOf(error), "error");
  } finally {
    elements.loadMore.disabled = false;
  }
}

async function openProblem(item: ProblemListItem, row: HTMLButtonElement): Promise<void> {
  const sequence = ++detailSequence;
  for (const candidate of elements.problemList.querySelectorAll(".problem-row")) {
    candidate.classList.toggle("selected", candidate === row);
  }
  elements.detailPlaceholder.hidden = true;
  elements.detailContent.hidden = true;
  elements.detailLoading.hidden = false;
  elements.createResult.textContent = "";
  try {
    const detail = await callTool<ProblemDetail>("leetcode_get_problem", { problemId: item.id });
    if (sequence !== detailSequence) return;
    selectedProblem = detail;
    renderProblemDetail(detail);
  } catch (error) {
    if (sequence !== detailSequence) return;
    selectedProblem = null;
    elements.detailLoading.hidden = true;
    elements.detailPlaceholder.hidden = false;
    elements.detailPlaceholder.querySelector("strong")!.textContent = "题面加载失败";
    elements.detailPlaceholder.querySelector("span:last-child")!.textContent = messageOf(error);
  }
}

async function synchronizeCatalog(): Promise<void> {
  elements.syncButton.disabled = true;
  showStatus("正在启动目录同步…", "working");
  try {
    const started = await callTool<{ runId: number }>("leetcode_start_full_sync", {});
    for (;;) {
      const status = await callTool<SyncStatus | null>("leetcode_get_sync_status", { runId: started.runId });
      if (!status) throw new Error("找不到同步任务状态。");
      renderSyncStatus(status);
      if (status.state === "READY") {
        const stats = await callTool<CatalogStats>("leetcode_get_catalog_stats", {});
        renderStats(stats);
        await search(query, false);
        showStatus(`目录同步完成，共 ${stats.total} 道题。`, "success");
        break;
      }
      if (["PARTIAL", "PAUSED", "AUTH_REQUIRED"].includes(status.state)) {
        throw new Error(`目录同步停在 ${status.state}，可在对话中继续诊断或恢复。`);
      }
      await delay(700);
    }
  } catch (error) {
    showStatus(messageOf(error), "error");
  } finally {
    elements.syncButton.disabled = false;
  }
}

async function createSolution(): Promise<void> {
  const directory = elements.directoryInput.value.trim();
  const langSlug = elements.languageSelect.value;
  if (!selectedProblem || !langSlug) return;
  if (!directory) {
    elements.directoryInput.focus();
    elements.createResult.textContent = "请先填写解答根目录。";
    elements.createResult.dataset.kind = "error";
    return;
  }
  elements.createButton.disabled = true;
  elements.createResult.textContent = "正在获取最新模板并创建代码…";
  elements.createResult.dataset.kind = "working";
  try {
    const created = await callTool<{ filePath: string; created: boolean }>("leetcode_create_solution", {
      problemId: selectedProblem.id,
      langSlug,
      directory,
    });
    elements.createResult.textContent = created.created
      ? `代码已创建：${created.filePath}`
      : `已有代码，未覆盖：${created.filePath}`;
    elements.createResult.dataset.kind = "success";
  } catch (error) {
    elements.createResult.textContent = messageOf(error);
    elements.createResult.dataset.kind = "error";
  } finally {
    elements.createButton.disabled = false;
  }
}

function renderStats(stats: CatalogStats): void {
  catalogTotal = stats.total;
  elements.catalogSummary.textContent = stats.total === 0
    ? "尚未同步目录"
    : `${stats.total.toLocaleString("zh-CN")} 道题 · 详情按点击实时获取`;
}

function renderSyncStatus(status: SyncStatus): void {
  showStatus(
    `同步目录 ${status.catalogCategoriesSynced}/${status.catalogCategoriesTotal} · ${status.catalogUnique} 道题`,
    status.failedCategories > 0 ? "error" : "working",
  );
}

function renderProblemList(loading = false): void {
  elements.problemList.replaceChildren();
  elements.emptyState.hidden = loading || problems.length > 0;
  if (!loading && problems.length === 0) {
    const title = elements.emptyState.querySelector("strong");
    const description = elements.emptyState.querySelector("span");
    if (query || catalogTotal > 0) {
      if (title) title.textContent = "没有匹配的题目";
      if (description) description.textContent = "换一个题号、标题或 slug 试试。";
    } else {
      if (title) title.textContent = "本地题库还是空的";
      if (description) description.textContent = "点击“同步目录”获取全部题目的轻量目录。";
    }
  }
  if (loading) {
    const skeleton = document.createElement("div");
    skeleton.className = "list-loading";
    skeleton.textContent = "正在搜索…";
    elements.problemList.append(skeleton);
    elements.loadMore.hidden = true;
    return;
  }
  for (const item of problems) {
    const row = document.createElement("button");
    row.className = "problem-row";
    row.type = "button";
    row.innerHTML = `
      <span class="problem-number">${escapeHtml(item.frontendId)}</span>
      <span class="problem-title">${escapeHtml(item.title)}</span>
      <span class="difficulty ${item.difficulty.toLowerCase()}">${difficultyLabel(item.difficulty)}</span>
    `;
    row.addEventListener("click", () => void openProblem(item, row));
    elements.problemList.append(row);
  }
  elements.loadMore.hidden = problems.length === 0 || problems.length % PAGE_SIZE !== 0;
}

function renderProblemDetail(detail: ProblemDetail): void {
  elements.detailLoading.hidden = true;
  elements.detailPlaceholder.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailKicker.textContent = `题目 ${detail.frontendId} · ${detail.slug}${detail.paidOnly ? " · Premium" : ""}`;
  elements.detailTitle.textContent = detail.translatedTitle ?? detail.title;
  elements.detailDifficulty.textContent = difficultyLabel(detail.difficulty);
  elements.detailDifficulty.className = `difficulty ${detail.difficulty.toLowerCase()}`;
  elements.detailTags.replaceChildren(...detail.tags.map((tag) => {
    const badge = document.createElement("span");
    badge.textContent = tag.translatedName ?? tag.name;
    return badge;
  }));
  const content = detail.contents.find((item) => item.locale === "zh-CN") ?? detail.contents[0];
  elements.statement.innerHTML = content?.html ?? "<p>当前账号未返回可显示的题面。</p>";
  elements.languageSelect.replaceChildren(...detail.templates.map((template) => {
    const option = document.createElement("option");
    option.value = template.langSlug;
    option.textContent = template.langName;
    return option;
  }));
  const preferred = detail.templates.find((template) => template.langSlug === "typescript")
    ?? detail.templates.find((template) => template.langSlug === "python3")
    ?? detail.templates[0];
  if (preferred) elements.languageSelect.value = preferred.langSlug;
  elements.createButton.disabled = detail.templates.length === 0;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await app.callServerTool({ name, arguments: args });
  const text = result.content?.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error(`${name} 没有返回可解析结果。`);
  let envelope: ToolEnvelope<T>;
  try {
    envelope = JSON.parse(text.text) as ToolEnvelope<T>;
  } catch {
    throw new Error(`${name} 返回了无效数据。`);
  }
  if (!envelope.ok) throw new Error(envelope.error?.message ?? `${name} 调用失败。`);
  return envelope.data as T;
}

function showStatus(message: string, kind: "working" | "success" | "error"): void {
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.kind = kind;
}

function difficultyLabel(value: ProblemDetail["difficulty"]): string {
  return value === "Easy" ? "简单" : value === "Medium" ? "中等" : "困难";
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "发生了未知错误。";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element;
}

function requiredInput(id: string): HTMLInputElement {
  return required(id) as HTMLInputElement;
}

function requiredButton(id: string): HTMLButtonElement {
  return required(id) as HTMLButtonElement;
}

function requiredSelect(id: string): HTMLSelectElement {
  return required(id) as HTMLSelectElement;
}
