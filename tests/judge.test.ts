import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseJudgeResult } from "../src/adapter/leetcode-cn.js";
import { RemoteJudgeService } from "../src/judge/remote-judge-service.js";
import { LeetCodeDatabase } from "../src/storage/database.js";
import { WorkspaceManager } from "../src/workspace/workspace-manager.js";
import { AppError } from "../src/core/errors.js";

describe("judge result normalization", () => {
  it("requires all acceptance invariants", () => {
    expect(parseJudgeResult({
      state: "SUCCESS",
      status_msg: "Accepted",
      run_success: true,
      total_correct: 12,
      total_testcases: 12,
      status_runtime: "1 ms",
      status_memory: "10 MB",
    })).toMatchObject({ terminal: true, accepted: true, passedTestcases: 12, totalTestcases: 12 });

    expect(parseJudgeResult({
      state: "SUCCESS",
      status_msg: "Accepted",
      run_success: false,
      total_correct: 12,
      total_testcases: 12,
    }).accepted).toBe(false);
  });

  it.each([
    ["Wrong Answer", { last_testcase: "[1,2]" }],
    ["Compile Error", { compile_error: "syntax error" }],
    ["Runtime Error", { runtime_error: "panic" }],
    ["Time Limit Exceeded", {}],
    ["Memory Limit Exceeded", {}],
  ])("normalizes terminal %s results without claiming acceptance", (statusMessage, extra) => {
    expect(parseJudgeResult({
      state: "SUCCESS",
      status_msg: statusMessage,
      run_success: false,
      passed_testcase: 0,
      total_testcases: 1,
      ...extra,
    })).toMatchObject({ terminal: true, statusMessage, accepted: false });
  });
});

describe("RemoteJudgeService confirmation", () => {
  it("invalidates confirmation when code changes", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-judge-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const workspaces = new WorkspaceManager(database);
      const workspace = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const adapter = { submitRemote: vi.fn() };
      const sessions = { getRequiredCredentials: () => ({ session: "secret", csrf: "secret" }) };
      const judge = new RemoteJudgeService(database, adapter as never, sessions as never, workspaces);
      const confirmation = judge.prepareSubmission(workspace.filePath);
      writeFileSync(workspace.filePath, "changed code", "utf8");

      await expect(judge.submit(workspace.filePath, confirmation.confirmationToken))
        .rejects.toThrow("changed after confirmation");
      expect(adapter.submitRemote).not.toHaveBeenCalled();
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks replay when a Submit response has an unknown outcome", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-submit-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const workspaces = new WorkspaceManager(database);
      const workspace = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const adapter = {
        submitRemote: vi.fn(async () => {
          throw new AppError("NETWORK_TIMEOUT", "socket closed", true, { outcome: "unknown" });
        }),
      };
      const sessions = sessionStub();
      const judge = new RemoteJudgeService(database, adapter as never, sessions as never, workspaces);

      const first = judge.prepareSubmission(workspace.filePath);
      await expect(judge.submit(workspace.filePath, first.confirmationToken))
        .rejects.toMatchObject({ code: "SUBMIT_OUTCOME_UNKNOWN" });
      const second = judge.prepareSubmission(workspace.filePath);
      await expect(judge.submit(workspace.filePath, second.confirmationToken))
        .rejects.toThrow("recover that job before submitting");
      expect(adapter.submitRemote).toHaveBeenCalledTimes(1);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("cancels only local polling and recovers the saved remote ticket", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-poll-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const workspaces = new WorkspaceManager(database);
      const workspace = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const pollJudge = vi.fn((_remoteId: string, _credentials: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(
            new AppError("JUDGE_POLL_CANCELLED", "cancelled"),
          ), { once: true });
        }));
      const adapter = {
        runRemote: vi.fn(async () => ({ remoteId: "remote-7", type: "run" as const })),
        pollJudge,
      };
      const sessions = sessionStub();
      const judge = new RemoteJudgeService(database, adapter as never, sessions as never, workspaces);
      const ticket = await judge.run(workspace.filePath, "[]\n0");
      const pending = judge.getResult(ticket.jobId, 30_000);
      await vi.waitFor(() => expect(pollJudge).toHaveBeenCalledTimes(1));

      expect(judge.cancelPoll(ticket.jobId)).toMatchObject({ cancelled: true, remoteId: "remote-7" });
      await expect(pending).rejects.toMatchObject({ code: "JUDGE_POLL_CANCELLED" });
      expect(judge.getLatestJob(workspace.filePath)).toMatchObject({ id: ticket.jobId, state: "PENDING" });

      const recoveringAdapter = {
        pollJudge: vi.fn(async () => ({
          terminal: true,
          state: "SUCCESS",
          statusMessage: "Accepted",
          accepted: true,
          passedTestcases: 1,
          totalTestcases: 1,
          runtime: "1 ms",
          memory: "10 MB",
          compileError: null,
          runtimeError: null,
          lastTestcase: null,
          codeOutput: null,
          expectedOutput: null,
          stdOutput: null,
        })),
      };
      const recovered = new RemoteJudgeService(
        database,
        recoveringAdapter as never,
        sessions as never,
        workspaces,
      );
      await expect(recovered.getResult(ticket.jobId, 0)).resolves.toMatchObject({ accepted: true });
      expect(database.getJudgeJob(ticket.jobId).state).toBe("COMPLETE");
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("enforces the requested polling boundary even when an upstream check hangs", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-hard-poll-timeout-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const workspaces = new WorkspaceManager(database);
      const workspace = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const pollJudge = vi.fn((_remoteId: string, _credentials: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(
            new AppError("JUDGE_POLL_CANCELLED", "deadline reached"),
          ), { once: true });
        }));
      const adapter = {
        runRemote: vi.fn(async () => ({ remoteId: "remote-hard-timeout", type: "run" as const })),
        pollJudge,
      };
      const judge = new RemoteJudgeService(database, adapter as never, sessionStub() as never, workspaces);
      const ticket = await judge.run(workspace.filePath, "[]\n0");

      const result = await judge.getResult(ticket.jobId, 20);

      expect(result).toMatchObject({ jobId: ticket.jobId, terminal: false, state: "PENDING" });
      expect(pollJudge).toHaveBeenCalledTimes(1);
      expect(database.getJudgeJob(ticket.jobId).state).toBe("PENDING");
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("returns a bounded pending result and continues querying the same ticket", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-poll-timeout-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      const workspaces = new WorkspaceManager(database);
      const workspace = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const pollJudge = vi.fn()
        .mockResolvedValueOnce(judgeResult(false))
        .mockResolvedValueOnce(judgeResult(true));
      const adapter = {
        runRemote: vi.fn(async () => ({ remoteId: "remote-timeout", type: "run" as const })),
        pollJudge,
      };
      const judge = new RemoteJudgeService(database, adapter as never, sessionStub() as never, workspaces);
      const ticket = await judge.run(workspace.filePath, "[]\n0");

      await expect(judge.getResult(ticket.jobId, 0)).resolves.toMatchObject({ terminal: false });
      await expect(judge.getResult(ticket.jobId, 0)).resolves.toMatchObject({ terminal: true, accepted: true });
      expect(pollJudge).toHaveBeenCalledTimes(2);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects missing, expired, wrong-problem, and wrong-language confirmations", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "codex-leetcode-confirmation-"));
    const database = new LeetCodeDatabase(path.join(directory, "test.db"));
    try {
      seedProblem(database);
      database.upsertCatalog([{
        questionId: "2", frontendId: "2", slug: "add-two-numbers", title: "Add Two Numbers",
        translatedTitle: "两数相加",
        difficulty: "Medium", paidOnly: false, totalAccepted: null, totalSubmitted: null,
        status: null, category: "algorithms",
      }]);
      const workspaces = new WorkspaceManager(database);
      const first = workspaces.createSolution(solutionTemplate(), path.join(directory, "solutions"));
      const second = workspaces.createSolution({
        ...solutionTemplate(), problemId: 2, questionId: "2", frontendId: "2", slug: "add-two-numbers",
      }, path.join(directory, "solutions"));
      const adapter = { submitRemote: vi.fn() };
      const judge = new RemoteJudgeService(database, adapter as never, sessionStub() as never, workspaces);

      await expect(judge.submit(first.filePath, "00000000-0000-4000-8000-000000000000"))
        .rejects.toMatchObject({ code: "SUBMIT_CONFIRMATION_REQUIRED" });

      const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
      const expired = judge.prepareSubmission(first.filePath);
      now.mockReturnValue(301_001);
      await expect(judge.submit(first.filePath, expired.confirmationToken))
        .rejects.toMatchObject({ code: "SUBMIT_CONFIRMATION_REQUIRED" });
      now.mockRestore();

      const wrongProblem = judge.prepareSubmission(first.filePath);
      await expect(judge.submit(second.filePath, wrongProblem.confirmationToken))
        .rejects.toMatchObject({ code: "FILE_CHANGED_AFTER_CONFIRM" });

      const python = workspaces.createSolution({
        ...solutionTemplate(), langSlug: "python3", langName: "Python3", starterCode: "def twoSum():\n    pass\n",
      }, path.join(directory, "solutions"));
      const wrongLanguage = judge.prepareSubmission(first.filePath);
      await expect(judge.submit(python.filePath, wrongLanguage.confirmationToken))
        .rejects.toMatchObject({ code: "FILE_CHANGED_AFTER_CONFIRM" });
      expect(adapter.submitRemote).not.toHaveBeenCalled();
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function sessionStub() {
  return {
    getRequiredCredentials: () => ({ session: "session-secret", csrf: "csrf-secret" }),
    invalidateIfCurrent: vi.fn(),
  };
}

function seedProblem(database: LeetCodeDatabase): void {
  database.upsertCatalog([{
    questionId: "1", frontendId: "1", slug: "two-sum", title: "Two Sum",
    translatedTitle: "两数之和",
    difficulty: "Easy", paidOnly: false, totalAccepted: 1, totalSubmitted: 2,
    status: null, category: "algorithms",
  }]);
}

function solutionTemplate() {
  return {
    problemId: 1,
    questionId: "1",
    frontendId: "1",
    slug: "two-sum",
    title: "Two Sum",
    langSlug: "typescript",
    langName: "TypeScript",
    starterCode: "function twoSum() {}",
  };
}

function judgeResult(terminal: boolean) {
  return {
    terminal,
    state: terminal ? "SUCCESS" : "PENDING",
    statusMessage: terminal ? "Accepted" : null,
    accepted: terminal,
    passedTestcases: terminal ? 1 : null,
    totalTestcases: terminal ? 1 : null,
    runtime: terminal ? "1 ms" : null,
    memory: terminal ? "10 MB" : null,
    compileError: null,
    runtimeError: null,
    lastTestcase: null,
    codeOutput: null,
    expectedOutput: null,
    stdOutput: null,
  };
}
