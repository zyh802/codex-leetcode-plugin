import { AppError } from "../core/errors.js";
import type { ProblemService } from "../problem/problem-service.js";
import type { LeetCodeDatabase } from "../storage/database.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";

export class ReviewContextService {
  constructor(
    private readonly database: LeetCodeDatabase,
    private readonly workspaces: WorkspaceManager,
    private readonly problems: ProblemService,
  ) {}

  async prepare(filePath: string, judgeJobId?: number, contestActive = false): Promise<unknown> {
    if (contestActive) {
      throw new AppError("CONTEST_GUARD_ACTIVE", "Code review is disabled while contest guard is active.");
    }
    const solution = this.workspaces.resolveSolution(filePath);
    const problem = await this.problems.getProblem(solution.problemId);
    const preferred = problem.contents.find((content) => content.locale === "zh-CN") ?? problem.contents[0];
    return {
      problem: {
        id: solution.problemId,
        frontendId: problem.frontendId,
        title: problem.translatedTitle ?? problem.title,
        originalTitle: problem.title,
        difficulty: problem.difficulty,
        statementPlainText: preferred?.plainText ?? "",
        samples: problem.samples,
        tags: problem.tags,
      },
      solution: {
        language: solution.langSlug,
        code: solution.code,
        codeHash: solution.codeHash,
        filePath: solution.filePath,
      },
      judge: judgeJobId === undefined ? null : this.database.getStoredJudgeResult(judgeJobId),
      evidenceRule: "Do not claim Accepted unless judge.accepted is true.",
    };
  }
}
