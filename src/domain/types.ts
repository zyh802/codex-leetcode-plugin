export const problemCategories = ["algorithms", "database", "shell", "concurrency"] as const;
export type ProblemCategory = (typeof problemCategories)[number];

export interface CatalogProblem {
  questionId: string;
  frontendId: string;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
  totalAccepted: number | null;
  totalSubmitted: number | null;
  status: string | null;
  category: ProblemCategory;
}

export interface CodeTemplate {
  langSlug: string;
  langName: string;
  starterCode: string;
}

export interface ProblemTag {
  slug: string;
  name: string;
  translatedName: string | null;
}

export interface QuestionDetail {
  questionId: string;
  frontendId: string;
  slug: string;
  title: string;
  translatedTitle: string | null;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
  content: string | null;
  translatedContent: string | null;
  sampleTestCase: string | null;
  enableRunCode: boolean;
  templates: CodeTemplate[];
  tags: ProblemTag[];
  metadata: Record<string, unknown> | null;
}

export interface CatalogProblemRecord {
  id: number;
  questionId: string;
  frontendId: string;
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  paidOnly: boolean;
}

export type ProblemDetailView = Omit<QuestionDetail, "content" | "translatedContent"> & {
  id: number;
  contents: Array<{
    locale: "en" | "zh-CN";
    html: string;
    plainText: string;
  }>;
  samples: Array<{
    ordinal: number;
    input: string;
    source: "sampleTestCase";
  }>;
};

export interface SolutionTemplate {
  problemId: number;
  questionId: string;
  frontendId: string;
  slug: string;
  title: string;
  langSlug: string;
  langName: string;
  starterCode: string;
}

export interface SyncStatus {
  runId: number;
  state: string;
  catalogUnique: number;
  catalogCategoriesTotal: number;
  catalogCategoriesSynced: number;
  failedCategories: number;
  pendingCategories: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface JudgeTicket {
  remoteId: string;
  type: "run" | "submit";
}

export interface NormalizedJudgeResult {
  terminal: boolean;
  state: string;
  statusMessage: string | null;
  accepted: boolean;
  passedTestcases: number | null;
  totalTestcases: number | null;
  runtime: string | null;
  memory: string | null;
  compileError: string | null;
  runtimeError: string | null;
  lastTestcase: string | null;
  codeOutput: unknown;
  expectedOutput: unknown;
  stdOutput: unknown;
}
