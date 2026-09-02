import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../core/errors.js";
import type { LeetCodeCnAdapter } from "../adapter/leetcode-cn.js";
import type { SessionService } from "../auth/session-service.js";
import type { LeetCodeDatabase } from "../storage/database.js";
import type { WorkspaceManager } from "../workspace/workspace-manager.js";

interface SubmissionConfirmation {
  token: string;
  filePath: string;
  problemId: number;
  langSlug: string;
  codeHash: string;
  expiresAt: number;
}
export class RemoteJudgeService {
  private readonly confirmations = new Map<string, SubmissionConfirmation>();

  constructor(
    private readonly database: LeetCodeDatabase,
    private readonly adapter: LeetCodeCnAdapter,
    private readonly sessions: SessionService,
    private readonly workspaces: WorkspaceManager,
  ) {}

  async run(filePath: string, input: string): Promise<{ jobId: number; remoteId: string }> {
    const solution = this.workspaces.resolveSolution(filePath);
    const workspace = this.requireWorkspace(solution.filePath);
    const credentials = this.sessions.getRequiredCredentials();
    const requestHash = hashRequest({ type: "run", codeHash: solution.codeHash, input });
    const jobId = this.database.createJudgeJob(workspace.workspaceId, "run", requestHash);
    const ticket = await this.adapter.runRemote({
      slug: solution.slug,
      questionId: solution.questionId,
      langSlug: solution.langSlug,
      code: solution.code,
      input,
    }, credentials);
    this.database.setJudgeTicket(jobId, ticket.remoteId);
    return { jobId, remoteId: ticket.remoteId };
  }

  prepareSubmission(filePath: string): {
    confirmationToken: string;
    problemId: number;
    slug: string;
    langSlug: string;
    filePath: string;
    codeHash: string;
    expiresAt: string;
  } {
    const solution = this.workspaces.resolveSolution(filePath);
    const token = randomUUID();
    const expiresAt = Date.now() + 5 * 60_000;
    this.confirmations.set(token, {
      token,
      filePath: solution.filePath,
      problemId: solution.problemId,
      langSlug: solution.langSlug,
      codeHash: solution.codeHash,
      expiresAt,
    });
    return {
      confirmationToken: token,
      problemId: solution.problemId,
      slug: solution.slug,
      langSlug: solution.langSlug,
      filePath: solution.filePath,
      codeHash: solution.codeHash,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async submit(filePath: string, confirmationToken: string): Promise<{ jobId: number; remoteId: string }> {
    const confirmation = this.confirmations.get(confirmationToken);
    this.confirmations.delete(confirmationToken);
    if (!confirmation || confirmation.expiresAt < Date.now()) {
      throw new AppError("SUBMIT_CONFIRMATION_REQUIRED", "Create a fresh submission confirmation first.");
    }
    const solution = this.workspaces.resolveSolution(filePath);
    if (
      confirmation.filePath !== solution.filePath || confirmation.problemId !== solution.problemId ||
      confirmation.langSlug !== solution.langSlug || confirmation.codeHash !== solution.codeHash
    ) {
      throw new AppError("FILE_CHANGED_AFTER_CONFIRM", "The solution identity or code changed after confirmation.");
    }
    const workspace = this.requireWorkspace(solution.filePath);
    const credentials = this.sessions.getRequiredCredentials();
    const jobId = this.database.createJudgeJob(
      workspace.workspaceId,
      "submit",
      hashRequest({ type: "submit", codeHash: solution.codeHash }),
    );
    const ticket = await this.adapter.submitRemote({
      slug: solution.slug,
      questionId: solution.questionId,
      langSlug: solution.langSlug,
      code: solution.code,
    }, credentials);
    this.database.setJudgeTicket(jobId, ticket.remoteId);
    return { jobId, remoteId: ticket.remoteId };
  }

  async getResult(jobId: number, waitMs = 0): Promise<unknown> {
    const job = this.database.getJudgeJob(jobId);
    if (job.state === "COMPLETE" && job.resultJson !== null) return JSON.parse(job.resultJson) as unknown;
    if (job.remoteId === null) throw new AppError("JUDGE_TIMEOUT", "The judge job has no remote ticket yet.", true);
    const credentials = this.sessions.getRequiredCredentials();
    const deadline = Date.now() + Math.min(Math.max(waitMs, 0), 30_000);
    let delay = 500;
    do {
      const result = await this.adapter.pollJudge(job.remoteId, credentials);
      this.database.setJudgeResult(jobId, result, result.terminal);
      if (result.terminal || Date.now() >= deadline) return result;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 2_000);
    } while (Date.now() <= deadline);
    return this.database.getJudgeJob(jobId);
  }

  private requireWorkspace(filePath: string): NonNullable<ReturnType<LeetCodeDatabase["getWorkspaceByPath"]>> {
    const workspace = this.database.getWorkspaceByPath(filePath);
    if (workspace === null) throw new AppError("SOLUTION_IDENTITY_CONFLICT", "Solution workspace was not registered.");
    return workspace;
  }
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
