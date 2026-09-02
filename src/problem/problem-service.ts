import sanitizeHtml from "sanitize-html";
import type { LeetCodeCnAdapter } from "../adapter/leetcode-cn.js";
import type { SessionCredentials } from "../adapter/http-client.js";
import { AppError } from "../core/errors.js";
import type { ProblemDetailView, QuestionDetail, SolutionTemplate } from "../domain/types.js";
import type { LeetCodeDatabase } from "../storage/database.js";

export class ProblemService {
  constructor(
    private readonly database: LeetCodeDatabase,
    private readonly adapter: LeetCodeCnAdapter,
    private readonly credentialsProvider: () => SessionCredentials | undefined,
  ) {}

  async getProblem(problemId: number): Promise<ProblemDetailView> {
    const catalog = this.database.getCatalogProblem(problemId);
    const detail = await this.adapter.getQuestionDetail(catalog.slug, this.credentialsProvider());
    assertIdentity(catalog.questionId, catalog.slug, detail);

    if (detail.content === null && detail.translatedContent === null) {
      throw new AppError(
        "PERMISSION_LOCKED",
        `Question ${catalog.slug} did not return readable content for the current session.`,
      );
    }

    const contents: ProblemDetailView["contents"] = [];
    if (detail.content !== null) {
      const html = sanitizeHtml(detail.content);
      contents.push({ locale: "en", html, plainText: htmlToPlainText(html) });
    }
    if (detail.translatedContent !== null) {
      const html = sanitizeHtml(detail.translatedContent);
      contents.push({ locale: "zh-CN", html, plainText: htmlToPlainText(html) });
    }

    const { content: _rawContent, translatedContent: _rawTranslatedContent, ...safeDetail } = detail;
    return {
      ...safeDetail,
      id: catalog.id,
      contents,
      samples: detail.sampleTestCase === null
        ? []
        : [{ ordinal: 1, input: detail.sampleTestCase, source: "sampleTestCase" }],
    };
  }

  async getSolutionTemplate(problemId: number, langSlug: string): Promise<SolutionTemplate> {
    const problem = await this.getProblem(problemId);
    const template = problem.templates.find((candidate) => candidate.langSlug === langSlug);
    if (!template) {
      throw new AppError("LANGUAGE_UNSUPPORTED", `Language ${langSlug} is unavailable for problem ${problemId}.`);
    }
    return {
      problemId: problem.id,
      questionId: problem.questionId,
      frontendId: problem.frontendId,
      slug: problem.slug,
      title: problem.translatedTitle ?? problem.title,
      langSlug: template.langSlug,
      langName: template.langName,
      starterCode: template.starterCode,
    };
  }
}

function assertIdentity(questionId: string, slug: string, detail: QuestionDetail): void {
  if (detail.questionId !== questionId || detail.slug !== slug) {
    throw new AppError("UPSTREAM_SCHEMA_CHANGED", `Question identity changed while opening ${slug}.`);
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/p>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}
