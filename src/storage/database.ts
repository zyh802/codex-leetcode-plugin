import Database from "better-sqlite3";
import { problemCategories } from "../domain/types.js";
import type {
  CatalogProblem,
  CatalogProblemRecord,
  ProblemCategory,
  ProblemSearchFilters,
  SyncStatus,
} from "../domain/types.js";
import { AppError } from "../core/errors.js";

const ENDPOINT_CN = 1;

export class LeetCodeDatabase {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  upsertCatalog(problems: CatalogProblem[]): number {
    const upsert = this.db.prepare(`
      INSERT INTO problems (
        endpoint_id, question_id, frontend_id, slug, title, difficulty,
        paid_only, total_accepted, total_submitted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(endpoint_id, question_id) DO UPDATE SET
        frontend_id = excluded.frontend_id,
        slug = excluded.slug,
        title = excluded.title,
        difficulty = excluded.difficulty,
        paid_only = excluded.paid_only,
        total_accepted = excluded.total_accepted,
        total_submitted = excluded.total_submitted,
        retired_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `);
    const category = this.db.prepare(`
      INSERT OR IGNORE INTO problem_categories(problem_id, category)
      SELECT id, ? FROM problems WHERE endpoint_id = ? AND question_id = ?
    `);
    const userState = this.db.prepare(`
      INSERT INTO user_problem_state(problem_id, status, favorite, updated_at)
      SELECT id, @status, COALESCE(@favorite, 0), CURRENT_TIMESTAMP
      FROM problems WHERE endpoint_id = @endpoint AND question_id = @questionId
      ON CONFLICT(problem_id) DO UPDATE SET
        status = excluded.status,
        favorite = CASE WHEN @favorite IS NULL THEN user_problem_state.favorite ELSE excluded.favorite END,
        updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = this.db.transaction((items: CatalogProblem[]) => {
      for (const item of items) {
        upsert.run(
          ENDPOINT_CN,
          item.questionId,
          item.frontendId,
          item.slug,
          item.title,
          item.difficulty,
          item.paidOnly ? 1 : 0,
          item.totalAccepted,
          item.totalSubmitted,
        );
        category.run(item.category, ENDPOINT_CN, item.questionId);
        userState.run({
          status: item.status,
          favorite: item.favorite === undefined || item.favorite === null ? null : item.favorite ? 1 : 0,
          endpoint: ENDPOINT_CN,
          questionId: item.questionId,
        });
      }
    });
    transaction(problems);
    return this.getCatalogStats().total;
  }

  createSyncRun(): number {
    const transaction = this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT INTO sync_runs(endpoint_id, state, started_at)
        VALUES (?, 'FETCHING_CATALOGS', CURRENT_TIMESTAMP)
      `).run(ENDPOINT_CN);
      const runId = Number(result.lastInsertRowid);
      const insertCategory = this.db.prepare(`
        INSERT INTO sync_categories(run_id, category, state) VALUES (?, ?, 'queued')
      `);
      for (const category of problemCategories) insertCategory.run(runId, category);
      return runId;
    });
    return transaction();
  }

  listPendingSyncCategories(runId: number): ProblemCategory[] {
    const rows = this.db.prepare(`
      SELECT category FROM sync_categories
      WHERE run_id = ? AND state IN ('queued', 'running', 'retryable')
      ORDER BY rowid
    `).all(runId) as Array<{ category: ProblemCategory }>;
    return rows.map((row) => row.category);
  }

  setSyncCategoryState(runId: number, category: ProblemCategory, state: string, errorCode?: string): void {
    this.db.prepare(`
      UPDATE sync_categories SET
        state = ?,
        attempts = attempts + CASE WHEN ? = 'running' THEN 1 ELSE 0 END,
        error_code = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE run_id = ? AND category = ?
    `).run(state, state, errorCode ?? null, runId, category);
  }

  setSyncState(runId: number, state: string, finished = false): void {
    this.db.prepare(`
      UPDATE sync_runs
      SET state = ?, finished_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE finished_at END
      WHERE id = ?
    `).run(state, finished ? 1 : 0, runId);
  }

  getSyncStatus(runId?: number): SyncStatus | null {
    const selected = runId === undefined
      ? this.db.prepare("SELECT id, state, started_at, finished_at FROM sync_runs ORDER BY id DESC LIMIT 1").get()
      : this.db.prepare("SELECT id, state, started_at, finished_at FROM sync_runs WHERE id = ?").get(runId);
    const run = selected as { id: number; state: string; started_at: string; finished_at: string | null } | undefined;
    if (!run) return null;
    const categoryStats = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN state = 'synced' THEN 1 ELSE 0 END) AS synced,
        SUM(CASE WHEN state = 'retryable' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN state IN ('queued', 'running', 'retryable') THEN 1 ELSE 0 END) AS pending
      FROM sync_categories WHERE run_id = ?
    `).get(run.id) as Record<string, number | null>;
    return {
      runId: run.id,
      state: run.state,
      catalogUnique: this.getCatalogStats().total,
      catalogCategoriesTotal: categoryStats.total ?? 0,
      catalogCategoriesSynced: categoryStats.synced ?? 0,
      failedCategories: categoryStats.failed ?? 0,
      pendingCategories: categoryStats.pending ?? 0,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
    };
  }

  getCatalogStats(): {
    total: number;
    lastUpdatedAt: string | null;
    categories: Array<{ category: ProblemCategory; count: number }>;
  } {
    const summary = this.db.prepare(`
      SELECT COUNT(*) AS total, MAX(updated_at) AS lastUpdatedAt
      FROM problems WHERE endpoint_id = ? AND retired_at IS NULL
    `).get(ENDPOINT_CN) as { total: number; lastUpdatedAt: string | null };
    const categories = this.db.prepare(`
      SELECT pc.category, COUNT(*) AS count
      FROM problem_categories pc JOIN problems p ON p.id = pc.problem_id
      WHERE p.endpoint_id = ? AND p.retired_at IS NULL
      GROUP BY pc.category ORDER BY pc.category
    `).all(ENDPOINT_CN) as Array<{ category: ProblemCategory; count: number }>;
    return { ...summary, categories };
  }

  searchProblems(query: string, limit: number, offset = 0, filters: ProblemSearchFilters = {}): unknown[] {
    const normalized = query.trim();
    const pattern = `%${escapeLike(normalized)}%`;
    const where: string[] = [`
      p.endpoint_id = ? AND p.retired_at IS NULL AND (
        ? = '' OR
        p.frontend_id LIKE ? ESCAPE '\\' OR
        p.slug LIKE ? ESCAPE '\\' OR
        p.title LIKE ? ESCAPE '\\'
      )
    `];
    const parameters: unknown[] = [ENDPOINT_CN, normalized, pattern, pattern, pattern];
    if (filters.difficulties && filters.difficulties.length > 0) {
      where.push(`p.difficulty IN (${placeholders(filters.difficulties.length)})`);
      parameters.push(...filters.difficulties);
    }
    if (filters.categories && filters.categories.length > 0) {
      where.push(`EXISTS (
        SELECT 1 FROM problem_categories selected_pc
        WHERE selected_pc.problem_id = p.id
          AND selected_pc.category IN (${placeholders(filters.categories.length)})
      )`);
      parameters.push(...filters.categories);
    }
    if (filters.paid === "free") where.push("p.paid_only = 0");
    if (filters.paid === "paid") where.push("p.paid_only = 1");
    if (filters.statuses && filters.statuses.length > 0) {
      const statusConditions = filters.statuses.map((status) => {
        if (status === "solved") return "LOWER(COALESCE(ups.status, '')) = 'ac'";
        if (status === "attempted") return "ups.status IS NOT NULL AND LOWER(ups.status) <> 'ac'";
        return "ups.status IS NULL";
      });
      where.push(`(${statusConditions.join(" OR ")})`);
    }
    if (filters.favorite) where.push("COALESCE(ups.favorite, 0) = 1");
    parameters.push(limit, offset);
    const rows = this.db.prepare(`
      SELECT p.id, p.frontend_id AS frontendId, p.slug, p.title, p.difficulty,
             p.paid_only AS paidOnly, ups.status, COALESCE(ups.favorite, 0) AS favorite,
             GROUP_CONCAT(pc.category) AS categories
      FROM problems p
      LEFT JOIN user_problem_state ups ON ups.problem_id = p.id
      LEFT JOIN problem_categories pc ON pc.problem_id = p.id
      WHERE ${where.join(" AND ")}
      GROUP BY p.id
      ORDER BY
        CASE
          WHEN p.frontend_id <> '' AND p.frontend_id NOT GLOB '*[^0-9]*' THEN 0
          ELSE 1
        END,
        CASE
          WHEN p.frontend_id <> '' AND p.frontend_id NOT GLOB '*[^0-9]*'
            THEN CAST(p.frontend_id AS INTEGER)
        END,
        p.frontend_id COLLATE NOCASE,
        p.id
      LIMIT ? OFFSET ?
    `).all(...parameters) as Array<{
      id: number;
      frontendId: string;
      slug: string;
      title: string;
      difficulty: string;
      paidOnly: number;
      status: string | null;
      favorite: number;
      categories: string | null;
    }>;
    return rows.map((row) => ({
      ...row,
      paidOnly: row.paidOnly === 1,
      favorite: row.favorite === 1,
      categories: row.categories?.split(",") ?? [],
    }));
  }

  getCatalogProblem(problemId: number): CatalogProblemRecord {
    const row = this.db.prepare(`
      SELECT id, question_id AS questionId, frontend_id AS frontendId, slug, title,
             difficulty, paid_only AS paidOnly
      FROM problems WHERE id = ? AND endpoint_id = ? AND retired_at IS NULL
    `).get(problemId, ENDPOINT_CN) as (Omit<CatalogProblemRecord, "paidOnly"> & { paidOnly: number }) | undefined;
    if (!row) throw new AppError("PROBLEM_NOT_FOUND_LOCAL", `Problem ${problemId} was not found locally.`);
    return { ...row, paidOnly: row.paidOnly === 1 };
  }

  findProblemByFrontendId(frontendId: string): { id: number; questionId: string; slug: string } {
    const row = this.db.prepare(`
      SELECT id, question_id AS questionId, slug FROM problems
      WHERE endpoint_id = ? AND frontend_id = ? AND retired_at IS NULL
    `).get(ENDPOINT_CN, frontendId) as { id: number; questionId: string; slug: string } | undefined;
    if (!row) throw new AppError("PROBLEM_NOT_FOUND_LOCAL", `Problem ${frontendId} was not found locally.`);
    return row;
  }

  upsertWorkspace(problemId: number, langSlug: string, filePath: string, contentHash: string): void {
    this.db.prepare(`
      INSERT INTO workspaces(problem_id, lang_slug, file_path, content_hash)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(problem_id, lang_slug) DO UPDATE SET
        file_path = excluded.file_path, content_hash = excluded.content_hash
    `).run(problemId, langSlug, filePath, contentHash);
  }

  getWorkspaceByPath(filePath: string): {
    workspaceId: number;
    problemId: number;
    questionId: string;
    frontendId: string;
    slug: string;
    langSlug: string;
    filePath: string;
  } | null {
    return (this.db.prepare(`
      SELECT w.id AS workspaceId, w.problem_id AS problemId, p.question_id AS questionId,
             p.frontend_id AS frontendId, p.slug, w.lang_slug AS langSlug, w.file_path AS filePath
      FROM workspaces w JOIN problems p ON p.id = w.problem_id
      WHERE w.file_path = ? AND p.endpoint_id = ?
    `).get(filePath, ENDPOINT_CN) as {
      workspaceId: number;
      problemId: number;
      questionId: string;
      frontendId: string;
      slug: string;
      langSlug: string;
      filePath: string;
    } | undefined) ?? null;
  }

  createJudgeJob(workspaceId: number, type: "run" | "submit", requestHash: string): number {
    const result = this.db.prepare(`
      INSERT INTO judge_jobs(workspace_id, type, state, request_hash)
      VALUES (?, ?, 'CREATED', ?)
    `).run(workspaceId, type, requestHash);
    return Number(result.lastInsertRowid);
  }

  setJudgeTicket(jobId: number, remoteId: string): void {
    this.db.prepare(`
      UPDATE judge_jobs SET remote_id = ?, state = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(remoteId, jobId);
  }

  setJudgeResult(jobId: number, result: unknown, terminal: boolean): void {
    this.db.prepare(`
      UPDATE judge_jobs SET state = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(terminal ? "COMPLETE" : "PENDING", JSON.stringify(result), jobId);
  }

  setJudgeFailure(jobId: number, state: "FAILED" | "UNKNOWN", error: unknown): void {
    this.db.prepare(`
      UPDATE judge_jobs SET state = ?, result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(state, JSON.stringify(error), jobId);
  }

  getJudgeJob(jobId: number): {
    id: number;
    type: "run" | "submit";
    state: string;
    remoteId: string | null;
    resultJson: string | null;
    requestHash: string;
    workspaceId: number;
    filePath: string;
  } {
    const row = this.db.prepare(`
      SELECT j.id, j.type, j.state, j.remote_id AS remoteId, j.result_json AS resultJson,
             j.request_hash AS requestHash, j.workspace_id AS workspaceId, w.file_path AS filePath
      FROM judge_jobs j JOIN workspaces w ON w.id = j.workspace_id WHERE j.id = ?
    `).get(jobId) as {
      id: number;
      type: "run" | "submit";
      state: string;
      remoteId: string | null;
      resultJson: string | null;
      requestHash: string;
      workspaceId: number;
      filePath: string;
    } | undefined;
    if (!row) throw new AppError("INVALID_INPUT", `Judge job ${jobId} does not exist.`);
    return row;
  }

  findBlockingSubmit(workspaceId: number, requestHash: string): { jobId: number; state: string } | null {
    return (this.db.prepare(`
      SELECT id AS jobId, state FROM judge_jobs
      WHERE workspace_id = ? AND type = 'submit' AND request_hash = ?
        AND state IN ('CREATED', 'PENDING', 'UNKNOWN')
      ORDER BY id DESC LIMIT 1
    `).get(workspaceId, requestHash) as { jobId: number; state: string } | undefined) ?? null;
  }

  getLatestJudgeJobByPath(filePath: string): ReturnType<LeetCodeDatabase["getJudgeJob"]> | null {
    const row = this.db.prepare(`
      SELECT j.id FROM judge_jobs j JOIN workspaces w ON w.id = j.workspace_id
      WHERE w.file_path = ? ORDER BY j.id DESC LIMIT 1
    `).get(filePath) as { id: number } | undefined;
    return row ? this.getJudgeJob(row.id) : null;
  }

  getStoredJudgeResult(jobId: number): unknown | null {
    const job = this.getJudgeJob(jobId);
    return job.resultJson === null ? null : JSON.parse(job.resultJson) as unknown;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const applied = this.db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
    const appliedSet = new Set(applied.map((row) => row.version));
    if (!appliedSet.has(1)) {
      const migrate = this.db.transaction(() => {
        this.db.exec(SCHEMA_V1);
        this.db.prepare("INSERT INTO schema_migrations(version) VALUES (1)").run();
      });
      migrate();
    }
    if (!appliedSet.has(2)) {
      const migrate = this.db.transaction(() => {
        this.db.exec(SCHEMA_V2);
        this.db.prepare("INSERT INTO schema_migrations(version) VALUES (2)").run();
      });
      migrate();
    }
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

const SCHEMA_V1 = `
  CREATE TABLE endpoints (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL UNIQUE,
    base_url TEXT NOT NULL,
    adapter_version INTEGER NOT NULL DEFAULT 1
  );
  INSERT INTO endpoints(id, kind, base_url) VALUES (1, 'cn', 'https://leetcode.cn');

  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints(id),
    display_name TEXT,
    secret_ref TEXT,
    UNIQUE(endpoint_id, display_name)
  );

  CREATE TABLE problems (
    id INTEGER PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints(id),
    question_id TEXT NOT NULL,
    frontend_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    translated_title TEXT,
    difficulty TEXT NOT NULL CHECK(difficulty IN ('Easy', 'Medium', 'Hard')),
    paid_only INTEGER NOT NULL DEFAULT 0,
    total_accepted INTEGER,
    total_submitted INTEGER,
    content_access TEXT NOT NULL DEFAULT 'pending',
    enable_run_code INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    detail_fetched_at TEXT,
    retired_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(endpoint_id, question_id),
    UNIQUE(endpoint_id, slug)
  );
  CREATE INDEX idx_problems_filters ON problems(endpoint_id, difficulty, paid_only, content_access);

  CREATE TABLE problem_contents (
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    locale TEXT NOT NULL,
    html_raw TEXT NOT NULL,
    html_sanitized TEXT NOT NULL,
    plain_text TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY(problem_id, locale)
  );

  CREATE TABLE code_templates (
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    lang_slug TEXT NOT NULL,
    lang_name TEXT NOT NULL,
    starter_code TEXT NOT NULL,
    PRIMARY KEY(problem_id, lang_slug)
  );

  CREATE TABLE problem_samples (
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    input_text TEXT NOT NULL,
    source TEXT NOT NULL,
    PRIMARY KEY(problem_id, ordinal)
  );

  CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints(id),
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    translated_name TEXT,
    UNIQUE(endpoint_id, slug)
  );
  CREATE TABLE problem_tags (
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY(problem_id, tag_id)
  );
  CREATE TABLE problem_categories (
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    PRIMARY KEY(problem_id, category)
  );
  CREATE TABLE user_problem_state (
    problem_id INTEGER PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
    status TEXT,
    favorite INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE sync_runs (
    id INTEGER PRIMARY KEY,
    endpoint_id INTEGER NOT NULL REFERENCES endpoints(id),
    state TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE TABLE sync_items (
    run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(run_id, problem_id)
  );
  CREATE INDEX idx_sync_items_state ON sync_items(run_id, state);

  CREATE TABLE workspaces (
    id INTEGER PRIMARY KEY,
    problem_id INTEGER NOT NULL REFERENCES problems(id),
    lang_slug TEXT NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    content_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(problem_id, lang_slug)
  );

  CREATE TABLE judge_jobs (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id),
    type TEXT NOT NULL CHECK(type IN ('run', 'submit')),
    remote_id TEXT,
    state TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE VIRTUAL TABLE problem_search USING fts5(
    frontend_id,
    title,
    translated_title,
    body,
    tags,
    tokenize = 'unicode61'
  );
`;

const SCHEMA_V2 = `
  DROP TABLE IF EXISTS problem_search;
  DROP TABLE IF EXISTS problem_tags;
  DROP TABLE IF EXISTS tags;
  DROP TABLE IF EXISTS problem_samples;
  DROP TABLE IF EXISTS code_templates;
  DROP TABLE IF EXISTS problem_contents;
  DROP TABLE IF EXISTS sync_items;

  DELETE FROM sync_runs;
  UPDATE problems SET
    translated_title = NULL,
    content_access = 'live',
    enable_run_code = 0,
    metadata_json = NULL,
    detail_fetched_at = NULL;

  CREATE TABLE sync_categories (
    run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(run_id, category)
  );
  CREATE INDEX idx_sync_categories_state ON sync_categories(run_id, state);
`;
