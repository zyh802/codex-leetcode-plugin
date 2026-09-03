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
  private readonly activePolls = new Map<number, AbortController>();
  private activeRequests = 0;

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
    this.activeRequests += 1;
    try {
      const ticket = await this.adapter.runRemote({
        slug: solution.slug,
        questionId: solution.questionId,
        langSlug: solution.langSlug,
        code: solution.code,
        input,
      }, credentials);
      this.database.setJudgeTicket(jobId, ticket.remoteId);
      return { jobId, remoteId: ticket.remoteId };
    } catch (error) {
      this.handleAuthenticatedError(error, credentials);
      const appError = error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Remote Run failed.");
      this.database.setJudgeFailure(jobId, appError.retryable ? "UNKNOWN" : "FAILED", serializeError(appError));
      throw error;
    } finally {
      this.activeRequests -= 1;
    }
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
    const requestHash = hashRequest({ type: "submit", codeHash: solution.codeHash });
    const blocking = this.database.findBlockingSubmit(workspace.workspaceId, requestHash);
    if (blocking !== null) {
      throw new AppError(
        "SUBMIT_OUTCOME_UNKNOWN",
        `Submit job ${blocking.jobId} is still ${blocking.state}; recover that job before submitting the same code again.`,
        false,
        blocking,
      );
    }
    const jobId = this.database.createJudgeJob(
      workspace.workspaceId,
      "submit",
      requestHash,
    );
    this.activeRequests += 1;
    try {
      const ticket = await this.adapter.submitRemote({
        slug: solution.slug,
        questionId: solution.questionId,
        langSlug: solution.langSlug,
        code: solution.code,
      }, credentials);
      this.database.setJudgeTicket(jobId, ticket.remoteId);
      return { jobId, remoteId: ticket.remoteId };
    } catch (error) {
      this.handleAuthenticatedError(error, credentials);
      const appError = error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Submit failed.");
      const unknown = appError.retryable && hasUnknownOutcome(appError.details);
      this.database.setJudgeFailure(jobId, unknown ? "UNKNOWN" : "FAILED", serializeError(appError));
      if (unknown) {
        throw new AppError(
          "SUBMIT_OUTCOME_UNKNOWN",
          `LeetCode may have received Submit job ${jobId}. It will not be sent again automatically.`,
          false,
          { jobId, cause: appError.code },
        );
      }
      throw error;
    } finally {
      this.activeRequests -= 1;
    }
  }

  async getResult(jobId: number, waitMs = 0): Promise<unknown> {
    const job = this.database.getJudgeJob(jobId);
    if (job.state === "COMPLETE" && job.resultJson !== null) return JSON.parse(job.resultJson) as unknown;
    if (job.remoteId === null) {
      if (job.state === "UNKNOWN") {
        throw new AppError(
          "SUBMIT_OUTCOME_UNKNOWN",
          `Judge job ${jobId} has no remote ticket because the Submit response was uncertain.`,
          false,
          { jobId, state: job.state },
        );
      }
      throw new AppError("JUDGE_TIMEOUT", "The judge job has no remote ticket yet.", true);
    }
    const credentials = this.sessions.getRequiredCredentials();
    const boundedWaitMs = Math.min(Math.max(waitMs, 0), 30_000);
    const deadline = Date.now() + boundedWaitMs;
    const controller = new AbortController();
    const previous = this.activePolls.get(jobId);
    if (previous !== undefined) {
      throw new AppError("INVALID_INPUT", `Judge job ${jobId} is already being polled.`);
    }
    let deadlineReached = false;
    let latestResult: unknown = job.resultJson === null
      ? { jobId, terminal: false, state: job.state, remoteId: job.remoteId }
      : JSON.parse(job.resultJson) as unknown;
    const deadlineTimer = boundedWaitMs > 0
      ? setTimeout(() => {
          deadlineReached = true;
          controller.abort("deadline");
        }, boundedWaitMs)
      : undefined;
    this.activePolls.set(jobId, controller);
    let delay = 500;
    try {
      do {
        const result = await this.adapter.pollJudge(job.remoteId, credentials, controller.signal);
        latestResult = result;
        this.database.setJudgeResult(jobId, result, result.terminal);
        if (result.terminal || Date.now() >= deadline) return result;
        await waitForNextPoll(delay, controller.signal);
        delay = Math.min(delay * 2, 2_000);
      } while (Date.now() <= deadline);
      return this.database.getJudgeJob(jobId);
    } catch (error) {
      if (deadlineReached && error instanceof AppError && error.code === "JUDGE_POLL_CANCELLED") {
        return latestResult;
      }
      this.handleAuthenticatedError(error, credentials);
      throw error;
    } finally {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (this.activePolls.get(jobId) === controller) this.activePolls.delete(jobId);
    }
  }

  cancelPoll(jobId: number): { jobId: number; cancelled: boolean; remoteId: string | null; state: string } {
    const job = this.database.getJudgeJob(jobId);
    const controller = this.activePolls.get(jobId);
    controller?.abort();
    return { jobId, cancelled: controller !== undefined, remoteId: job.remoteId, state: job.state };
  }

  getLatestJob(filePath: string): ReturnType<LeetCodeDatabase["getJudgeJob"]> | null {
    return this.database.getLatestJudgeJobByPath(filePath);
  }

  hasActivePolls(): boolean {
    return this.activeRequests > 0 || this.activePolls.size > 0;
  }

  private requireWorkspace(filePath: string): NonNullable<ReturnType<LeetCodeDatabase["getWorkspaceByPath"]>> {
    const workspace = this.database.getWorkspaceByPath(filePath);
    if (workspace === null) throw new AppError("SOLUTION_IDENTITY_CONFLICT", "Solution workspace was not registered.");
    return workspace;
  }

  private handleAuthenticatedError(error: unknown, credentials: ReturnType<SessionService["getRequiredCredentials"]>): void {
    if (error instanceof AppError && error.code === "AUTH_EXPIRED") this.sessions.invalidateIfCurrent(credentials);
  }
}

function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function hasUnknownOutcome(details: unknown): boolean {
  return typeof details === "object" && details !== null && "outcome" in details && details.outcome === "unknown";
}

function serializeError(error: AppError): unknown {
  return { code: error.code, message: error.message, retryable: error.retryable, details: error.details };
}

function waitForNextPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new AppError("JUDGE_POLL_CANCELLED", "Judge polling was cancelled."));
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = (): void => {
      clearTimeout(timer);
      reject(new AppError("JUDGE_POLL_CANCELLED", "Judge polling was cancelled."));
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
