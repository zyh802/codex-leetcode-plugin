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
  workspace: WorkspaceSettings;
}

interface WorkspaceSettings {
  workspaceRoot: string | null;
  solutionRoot: string | null;
  customized: boolean;
}

interface EditableSolution {
  filePath: string;
  content: string;
  codeHash: string;
}

interface CreatedSolution {
  filePath: string;
  created: boolean;
  editor: EditableSolution;
}

interface ToolEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
}

const PAGE_SIZE = 50;

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
  saveDirectoryButton: requiredButton("save-directory-button"),
  resetDirectoryButton: requiredButton("reset-directory-button"),
  workspaceRootHint: required("workspace-root-hint"),
  directoryStatus: required("directory-status"),
  solutionTarget: required("solution-target"),
  createButton: requiredButton("create-button"),
  createResult: required("create-result"),
  codeEditor: required("code-editor"),
  editorFilePath: required("editor-file-path"),
  codeInput: requiredTextarea("code-input"),
  copyPathButton: requiredButton("copy-path-button"),
  saveCodeButton: requiredButton("save-code-button"),
  editorStatus: required("editor-status"),
};

let query = "";
let offset = 0;
let problems: ProblemListItem[] = [];
let selectedProblem: ProblemDetail | null = null;
let searchSequence = 0;
let detailSequence = 0;
let searchTimer: number | undefined;
let catalogTotal = 0;
let workspaceSettings: WorkspaceSettings = {
  workspaceRoot: null,
  solutionRoot: null,
  customized: false,
};
let editableSolution: EditableSolution | null = null;

elements.searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void search(elements.searchInput.value.trim(), false), 250);
});
elements.loadMore.addEventListener("click", () => void search(query, true));
elements.syncButton.addEventListener("click", () => void synchronizeCatalog());
elements.createButton.addEventListener("click", () => void createSolution());
elements.saveDirectoryButton.addEventListener("click", () => void saveSolutionRoot(elements.directoryInput.value));
elements.resetDirectoryButton.addEventListener("click", () => void saveSolutionRoot(null));
elements.saveCodeButton.addEventListener("click", () => void saveCode());
elements.copyPathButton.addEventListener("click", () => void copyEditorPath());
elements.codeInput.addEventListener("input", renderEditorDirtyState);
elements.codeInput.addEventListener("keydown", handleEditorKeydown);
window.addEventListener("beforeunload", (event) => {
  if (!editorIsDirty()) return;
  event.preventDefault();
});

await initialize();

async function initialize(): Promise<void> {
  const requestedQuery = new URLSearchParams(window.location.search).get("query") ?? "";
  try {
    const initial = await getJson<InitialState>(`/api/bootstrap?query=${encodeURIComponent(requestedQuery)}`);
    query = initial.query;
    elements.searchInput.value = query;
    problems = initial.problems;
    offset = problems.length;
    renderStats(initial.stats);
    renderWorkspaceSettings(initial.workspace);
    renderProblemList();
  } catch (error) {
    showStatus(messageOf(error), "error");
    elements.catalogSummary.textContent = "本地服务连接失败";
  }
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
  const langSlug = elements.languageSelect.value;
  if (!selectedProblem || !langSlug) return;
  if (!workspaceSettings.solutionRoot) {
    elements.directoryInput.focus();
    elements.createResult.textContent = "请先在顶部设置公共解答目录。";
    elements.createResult.dataset.kind = "error";
    return;
  }
  if (editorIsDirty() && !window.confirm("当前代码还有未保存修改。仍要打开另一份代码吗？")) return;
  elements.createButton.disabled = true;
  elements.createResult.textContent = "正在获取最新模板并创建代码…";
  elements.createResult.dataset.kind = "working";
  try {
    const created = await callTool<CreatedSolution>("leetcode_create_solution", {
      problemId: selectedProblem.id,
      langSlug,
    });
    elements.createResult.textContent = created.created
      ? `代码已创建并在下方打开：${created.filePath}`
      : `已有代码，未覆盖并已在下方打开：${created.filePath}`;
    elements.createResult.dataset.kind = "success";
    openEditor(created.editor);
  } catch (error) {
    elements.createResult.textContent = messageOf(error);
    elements.createResult.dataset.kind = "error";
  } finally {
    elements.createButton.disabled = false;
  }
}

async function saveSolutionRoot(directory: string | null): Promise<void> {
  if (directory !== null && !directory.trim()) {
    elements.directoryInput.focus();
    elements.directoryStatus.textContent = "请输入解答目录，或点击“恢复工作区”。";
    elements.directoryStatus.dataset.kind = "error";
    return;
  }
  if (editorIsDirty() && !window.confirm("当前代码还有未保存修改。更改解答目录会关闭这份代码，是否继续？")) return;
  elements.saveDirectoryButton.disabled = true;
  elements.resetDirectoryButton.disabled = true;
  elements.directoryStatus.textContent = "正在应用…";
  elements.directoryStatus.dataset.kind = "working";
  try {
    const previousRoot = workspaceSettings.solutionRoot;
    const settings = await postJson<WorkspaceSettings>("/api/settings/solution-root", { directory });
    renderWorkspaceSettings(settings);
    if (settings.solutionRoot !== previousRoot) closeEditor();
    elements.directoryStatus.textContent = settings.customized ? "已应用公共目录" : "已恢复当前工作区";
    elements.directoryStatus.dataset.kind = "success";
  } catch (error) {
    elements.directoryStatus.textContent = messageOf(error);
    elements.directoryStatus.dataset.kind = "error";
  } finally {
    elements.saveDirectoryButton.disabled = false;
    elements.resetDirectoryButton.disabled = workspaceSettings.workspaceRoot === null || !workspaceSettings.customized;
  }
}

function openEditor(solution: EditableSolution): void {
  editableSolution = solution;
  elements.editorFilePath.textContent = solution.filePath;
  elements.codeInput.value = solution.content;
  elements.codeEditor.hidden = false;
  renderEditorDirtyState();
  elements.editorStatus.textContent = "已加载现有文件";
  elements.editorStatus.dataset.kind = "success";
  window.requestAnimationFrame(() => {
    elements.codeEditor.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.codeInput.focus();
  });
}

function closeEditor(): void {
  editableSolution = null;
  elements.codeInput.value = "";
  elements.editorFilePath.textContent = "";
  elements.codeEditor.hidden = true;
  elements.saveCodeButton.disabled = true;
}

async function saveCode(): Promise<void> {
  if (!editableSolution || !editorIsDirty()) return;
  const target = editableSolution;
  const submittedContent = elements.codeInput.value;
  elements.saveCodeButton.disabled = true;
  elements.editorStatus.textContent = "正在保存…";
  elements.editorStatus.dataset.kind = "working";
  try {
    const saved = await postJson<EditableSolution>("/api/editor/save", {
      filePath: target.filePath,
      content: submittedContent,
      expectedHash: target.codeHash,
    });
    if (editableSolution?.filePath !== target.filePath) return;
    editableSolution = saved;
    if (elements.codeInput.value === submittedContent) elements.codeInput.value = saved.content;
    renderEditorDirtyState();
    elements.editorStatus.textContent = "已保存";
    elements.editorStatus.dataset.kind = "success";
  } catch (error) {
    elements.editorStatus.textContent = messageOf(error);
    elements.editorStatus.dataset.kind = "error";
    elements.saveCodeButton.disabled = false;
  }
}

async function copyEditorPath(): Promise<void> {
  if (!editableSolution) return;
  try {
    await navigator.clipboard.writeText(editableSolution.filePath);
    elements.editorStatus.textContent = "文件路径已复制";
    elements.editorStatus.dataset.kind = "success";
  } catch {
    elements.editorStatus.textContent = "无法自动复制，请从上方选择文件路径。";
    elements.editorStatus.dataset.kind = "error";
  }
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveCode();
    return;
  }
  if (event.key !== "Tab") return;
  event.preventDefault();
  const start = elements.codeInput.selectionStart;
  const end = elements.codeInput.selectionEnd;
  elements.codeInput.setRangeText("  ", start, end, "end");
  elements.codeInput.dispatchEvent(new Event("input"));
}

function editorIsDirty(): boolean {
  return editableSolution !== null && elements.codeInput.value !== editableSolution.content;
}

function renderEditorDirtyState(): void {
  const dirty = editorIsDirty();
  elements.saveCodeButton.disabled = !dirty;
  if (!editableSolution) return;
  elements.editorStatus.textContent = dirty ? "有未保存修改" : "已保存";
  elements.editorStatus.dataset.kind = dirty ? "working" : "success";
}

function renderWorkspaceSettings(settings: WorkspaceSettings): void {
  workspaceSettings = settings;
  elements.directoryInput.value = settings.solutionRoot ?? "";
  elements.directoryInput.placeholder = settings.workspaceRoot ?? "请输入绝对路径";
  elements.workspaceRootHint.textContent = settings.workspaceRoot
    ? `当前工作区：${settings.workspaceRoot}`
    : "未检测到当前工作区，请设置绝对路径";
  elements.resetDirectoryButton.disabled = settings.workspaceRoot === null || !settings.customized;
  elements.solutionTarget.textContent = settings.solutionRoot
    ? `将创建到 ${settings.solutionRoot}；所有题目共用此目录，已有代码不会被覆盖。`
    : "请先在顶部设置公共解答目录；已有代码不会被覆盖。";
  elements.createButton.disabled = selectedProblem === null ||
    selectedProblem.templates.length === 0 || settings.solutionRoot === null;
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
  elements.createButton.disabled = detail.templates.length === 0 || workspaceSettings.solutionRoot === null;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/tools/${encodeURIComponent(name)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return parseEnvelope<T>(response, name);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  return parseEnvelope<T>(response, url);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseEnvelope<T>(response, url);
}

async function parseEnvelope<T>(response: Response, operation: string): Promise<T> {
  let envelope: ToolEnvelope<T>;
  try {
    envelope = await response.json() as ToolEnvelope<T>;
  } catch {
    throw new Error(`${operation} 返回了无效数据。`);
  }
  if (!response.ok || !envelope.ok) {
    throw new Error(envelope.error?.message ?? `${operation} 调用失败。`);
  }
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

function requiredTextarea(id: string): HTMLTextAreaElement {
  return required(id) as HTMLTextAreaElement;
}
