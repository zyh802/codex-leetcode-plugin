import { z } from "zod";
import { AppError } from "../core/errors.js";
import type {
  CatalogProblem,
  CodeTemplate,
  ProblemCategory,
  QuestionDetail,
  JudgeTicket,
  NormalizedJudgeResult,
} from "../domain/types.js";
import { HttpClient } from "./http-client.js";
import type { SessionCredentials } from "./http-client.js";

const difficultyByLevel = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
} as const;

const catalogSchema = z.object({
  num_total: z.number(),
  stat_status_pairs: z.array(
    z.object({
      stat: z.object({
        question_id: z.union([z.number(), z.string()]),
        frontend_question_id: z.union([z.number(), z.string()]),
        question__title: z.string(),
        question__title_slug: z.string(),
        total_acs: z.number().nullable().optional(),
        total_submitted: z.number().nullable().optional(),
      }),
      difficulty: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
      paid_only: z.boolean(),
      status: z.string().nullable().optional(),
    }),
  ),
});

const questionSchema = z.object({
  questionId: z.string(),
  questionFrontendId: z.string(),
  title: z.string(),
  titleSlug: z.string(),
  translatedTitle: z.string().nullable().optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  isPaidOnly: z.boolean(),
  content: z.string().nullable().optional(),
  translatedContent: z.string().nullable().optional(),
  codeDefinition: z.string(),
  sampleTestCase: z.string().nullable().optional(),
  metaData: z.string().nullable().optional(),
  enableRunCode: z.boolean(),
  topicTags: z.array(
    z.object({
      name: z.string(),
      slug: z.string(),
      translatedName: z.string().nullable().optional(),
    }),
  ),
});

const graphQlSchema = z.object({
  data: z.object({ question: questionSchema.nullable() }).nullable().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const userStatusSchema = z.object({
  data: z.object({
    userStatus: z.object({
      isSignedIn: z.boolean(),
      username: z.string().nullable().optional(),
      isPremium: z.boolean().nullable().optional(),
    }).nullable(),
  }),
});

const codeDefinitionsSchema = z.array(
  z.object({
    value: z.string(),
    text: z.string(),
    defaultCode: z.string(),
  }),
);

const runTicketSchema = z.object({ interpret_id: z.union([z.string(), z.number()]) });
const submitTicketSchema = z.object({ submission_id: z.union([z.string(), z.number()]) });
const judgeCheckSchema = z.object({
  state: z.string(),
  status_msg: z.string().nullable().optional(),
  run_success: z.boolean().nullable().optional(),
  total_correct: z.number().nullable().optional(),
  passed_testcase: z.number().nullable().optional(),
  total_testcases: z.number().nullable().optional(),
  status_runtime: z.string().nullable().optional(),
  status_memory: z.string().nullable().optional(),
  compile_error: z.string().nullable().optional(),
  runtime_error: z.string().nullable().optional(),
  last_testcase: z.string().nullable().optional(),
  code_output: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  std_output: z.unknown().optional(),
}).passthrough();

export class LeetCodeCnAdapter {
  constructor(private readonly http: HttpClient) {}

  async getCatalog(category: ProblemCategory, credentials?: SessionCredentials): Promise<CatalogProblem[]> {
    const raw = await this.http.getJson(`/api/problems/${category}/`, credentials === undefined ? {} : { credentials });
    return parseCatalogResponse(raw, category);
  }

  async getQuestionDetail(slug: string, credentials?: SessionCredentials): Promise<QuestionDetail> {
    const raw = await this.http.postJson("/graphql/", {
      operationName: "questionData",
      variables: { titleSlug: slug },
      query: QUESTION_QUERY,
    }, {
      ...(credentials === undefined ? {} : { credentials }),
      referer: `https://leetcode.cn/problems/${slug}/`,
    });
    return parseQuestionResponse(raw, slug);
  }

  async getAuthStatus(credentials?: SessionCredentials): Promise<{
    signedIn: boolean;
    username: string | null;
    premium: boolean;
  }> {
    const raw = await this.http.postJson("/graphql/", {
      operationName: "globalData",
      variables: {},
      query: `query globalData { userStatus { isSignedIn username isPremium } }`,
    }, credentials === undefined ? {} : { credentials });
    const parsed = userStatusSchema.safeParse(raw);
    if (!parsed.success || parsed.data.data.userStatus === null) {
      throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode user status schema changed.");
    }
    return {
      signedIn: parsed.data.data.userStatus.isSignedIn,
      username: parsed.data.data.userStatus.username ?? null,
      premium: parsed.data.data.userStatus.isPremium ?? false,
    };
  }

  async runRemote(request: {
    slug: string;
    questionId: string;
    langSlug: string;
    code: string;
    input: string;
  }, credentials: SessionCredentials): Promise<JudgeTicket> {
    const raw = await this.http.postJson(`/problems/${request.slug}/interpret_solution/`, {
      lang: request.langSlug,
      question_id: request.questionId,
      typed_code: request.code,
      data_input: request.input,
      test_mode: false,
    }, { credentials, referer: `https://leetcode.cn/problems/${request.slug}/` });
    const parsed = runTicketSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode Run ticket schema changed.", false, parsed.error.issues);
    }
    return { remoteId: String(parsed.data.interpret_id), type: "run" };
  }

  async submitRemote(request: {
    slug: string;
    questionId: string;
    langSlug: string;
    code: string;
  }, credentials: SessionCredentials): Promise<JudgeTicket> {
    const raw = await this.http.postJson(`/problems/${request.slug}/submit/`, {
      lang: request.langSlug,
      question_id: request.questionId,
      typed_code: request.code,
      test_mode: false,
      judge_type: "large",
    }, { credentials, referer: `https://leetcode.cn/problems/${request.slug}/` });
    const parsed = submitTicketSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode Submit ticket schema changed.", false, parsed.error.issues);
    }
    return { remoteId: String(parsed.data.submission_id), type: "submit" };
  }

  async pollJudge(remoteId: string, credentials: SessionCredentials): Promise<NormalizedJudgeResult> {
    const raw = await this.http.getJson(`/submissions/detail/${encodeURIComponent(remoteId)}/check/`, { credentials });
    return parseJudgeResult(raw);
  }
}

export function parseJudgeResult(raw: unknown): NormalizedJudgeResult {
  const parsed = judgeCheckSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode judge result schema changed.", false, parsed.error.issues);
  }
  const value = parsed.data;
  const terminal = value.state === "SUCCESS";
  const passed = value.passed_testcase ?? value.total_correct ?? null;
  const total = value.total_testcases ?? null;
  const accepted = terminal && value.status_msg === "Accepted" && value.run_success === true &&
    passed !== null && total !== null && passed === total;
  return {
    terminal,
    state: value.state,
    statusMessage: value.status_msg ?? null,
    accepted,
    passedTestcases: passed,
    totalTestcases: total,
    runtime: value.status_runtime ?? null,
    memory: value.status_memory ?? null,
    compileError: value.compile_error ?? null,
    runtimeError: value.runtime_error ?? null,
    lastTestcase: value.last_testcase ?? null,
    codeOutput: value.code_output ?? null,
    expectedOutput: value.expected_output ?? null,
    stdOutput: value.std_output ?? null,
  };
}

export function parseCatalogResponse(raw: unknown, category: ProblemCategory): CatalogProblem[] {
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode catalog schema changed.", false, parsed.error.issues);
  }
  return parsed.data.stat_status_pairs.map((entry) => ({
    questionId: String(entry.stat.question_id),
    frontendId: String(entry.stat.frontend_question_id),
    slug: entry.stat.question__title_slug,
    title: entry.stat.question__title,
    difficulty: difficultyByLevel[entry.difficulty.level],
    paidOnly: entry.paid_only,
    totalAccepted: entry.stat.total_acs ?? null,
    totalSubmitted: entry.stat.total_submitted ?? null,
    status: entry.status ?? null,
    category,
  }));
}

export function parseQuestionResponse(raw: unknown, requestedSlug: string): QuestionDetail {
  const parsed = graphQlSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("UPSTREAM_SCHEMA_CHANGED", "LeetCode question schema changed.", false, parsed.error.issues);
  }
  const question = parsed.data.data?.question;
  if (!question) {
    const message = parsed.data.errors?.map((error) => error.message).join("; ");
    throw new AppError(
      "PERMISSION_LOCKED",
      message ?? `Question ${requestedSlug} is unavailable for this session.`,
    );
  }

  let templates: CodeTemplate[];
  try {
    templates = codeDefinitionsSchema.parse(JSON.parse(question.codeDefinition)).map((definition) => ({
      langSlug: definition.value,
      langName: definition.text,
      starterCode: definition.defaultCode,
    }));
  } catch (error) {
    throw new AppError(
      "UPSTREAM_SCHEMA_CHANGED",
      `Invalid codeDefinition for ${requestedSlug}.`,
      false,
      error instanceof Error ? error.message : error,
    );
  }

  let metadata: Record<string, unknown> | null = null;
  if (question.metaData) {
    try {
      const candidate: unknown = JSON.parse(question.metaData);
      if (typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)) {
        metadata = candidate as Record<string, unknown>;
      }
    } catch (error) {
      throw new AppError(
        "UPSTREAM_SCHEMA_CHANGED",
        `Invalid metaData for ${requestedSlug}.`,
        false,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    questionId: question.questionId,
    frontendId: question.questionFrontendId,
    slug: question.titleSlug,
    title: question.title,
    translatedTitle: question.translatedTitle ?? null,
    difficulty: question.difficulty,
    paidOnly: question.isPaidOnly,
    content: question.content ?? null,
    translatedContent: question.translatedContent ?? null,
    sampleTestCase: question.sampleTestCase ?? null,
    enableRunCode: question.enableRunCode,
    templates,
    tags: question.topicTags.map((tag) => ({
      slug: tag.slug,
      name: tag.name,
      translatedName: tag.translatedName ?? null,
    })),
    metadata,
  };
}

const QUESTION_QUERY = `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      questionFrontendId
      title
      titleSlug
      translatedTitle
      difficulty
      isPaidOnly
      content
      translatedContent
      codeDefinition
      sampleTestCase
      metaData
      enableRunCode
      topicTags { name slug translatedName }
    }
  }
`;
