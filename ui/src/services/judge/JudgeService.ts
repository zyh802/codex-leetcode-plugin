import { create } from "zustand";
import { judgeApi } from "@/api/judge/judgeApi.js";
import type { JudgeOperationDto, SubmissionConfirmationDto } from "@/api/judge/types.js";
import { ApiError, isAuthError, messageOf } from "@/api/errors.js";
import {
  presentJudgeResult,
  type JudgeResultPresentation,
  type JudgeResultTone,
} from "@/judge-result.js";
import { eventBus } from "@/services/eventBus.js";

interface JudgeState {
  currentJobId: number | null;
  operation: JudgeOperationDto | null;
  activePollJobId: number | null;
  activePollType: JudgeOperationDto | null;
  resumableJobId: number | null;
  runBusy: boolean;
  submitBusy: boolean;
  reviewBusy: boolean;
  result: JudgeResultPresentation;
  drawerOpen: boolean;
}

const initialState: JudgeState = {
  currentJobId: null,
  operation: null,
  activePollJobId: null,
  activePollType: null,
  resumableJobId: null,
  runBusy: false,
  submitBusy: false,
  reviewBusy: false,
  result: notice("idle", "等待运行", "选择样例或输入自定义数据，然后点击下方“运行”。"),
  drawerOpen: false,
};
export const useJudgeStore = create<JudgeState>(() => initialState);

class JudgeService {
  private pollingGeneration = 0;
  private controller: AbortController | undefined;

  resetForSolution(): void {
    this.stopLocalPoll();
    useJudgeStore.setState(initialState, true);
  }

  setDrawerOpen(drawerOpen: boolean): void {
    useJudgeStore.setState({ drawerOpen });
  }

  async restore(filePath: string): Promise<void> {
    try {
      const job = await judgeApi.latest(filePath);
      if (job === null) return;
      const result = job.resultJson ? safePresent(JSON.parse(job.resultJson) as unknown, job.type) : initialState.result;
      useJudgeStore.setState({
        currentJobId: job.id,
        operation: job.type,
        result,
        drawerOpen: job.resultJson !== null,
        resumableJobId: job.remoteId === null || job.state === "COMPLETE" ? null : job.id,
      });
    } catch {
      // Recovery is advisory and must not block editing.
    }
  }

  async run(filePath: string, input: string): Promise<void> {
    useJudgeStore.setState({ runBusy: true, operation: "run", result: notice("working", "正在创建运行任务", "请稍候。", "run"), drawerOpen: true });
    try {
      const ticket = await judgeApi.run(filePath, input);
      useJudgeStore.setState({ currentJobId: ticket.jobId, operation: "run", runBusy: false, resumableJobId: null });
      await this.poll(ticket.jobId, "run");
    } catch (error) {
      this.handleError(error);
    } finally {
      useJudgeStore.setState({ runBusy: false });
    }
  }

  async prepareSubmission(filePath: string): Promise<SubmissionConfirmationDto | null> {
    useJudgeStore.setState({ submitBusy: true, operation: "submit", result: notice("working", "正在准备提交", "正在生成一次性确认摘要。", "submit"), drawerOpen: true });
    try {
      return await judgeApi.prepareSubmit(filePath);
    } catch (error) {
      this.handleError(error);
      return null;
    } finally {
      useJudgeStore.setState({ submitBusy: false });
    }
  }

  cancelPreparedSubmission(): void {
    useJudgeStore.setState({ result: notice("warning", "已取消提交", "没有向力扣发送正式提交请求。", "submit"), drawerOpen: true });
  }

  async submit(filePath: string, confirmationToken: string): Promise<void> {
    await this.stopActiveRunForSubmit();
    useJudgeStore.setState({
      submitBusy: true,
      operation: "submit",
      result: notice("working", "正在提交", "如果响应不确定，插件不会自动重发同一份代码。", "submit"),
      drawerOpen: true,
    });
    try {
      const ticket = await judgeApi.submit(filePath, confirmationToken);
      useJudgeStore.setState({ currentJobId: ticket.jobId, operation: "submit", resumableJobId: null });
      await this.poll(ticket.jobId, "submit");
    } catch (error) {
      this.handleError(error);
    } finally {
      useJudgeStore.setState({ submitBusy: false });
    }
  }

  async cancelPolling(): Promise<void> {
    const jobId = useJudgeStore.getState().activePollJobId;
    if (jobId === null) return;
    try {
      await judgeApi.cancel(jobId);
    } catch (error) {
      useJudgeStore.setState({ result: notice("failure", "取消等待失败", messageOf(error)), drawerOpen: true });
      return;
    }
    this.stopLocalPoll();
    useJudgeStore.setState({
      activePollJobId: null,
      activePollType: null,
      resumableJobId: jobId,
      result: notice("warning", "已停止等待", "远端任务仍然保留，可以随时继续查询。", useJudgeStore.getState().operation),
      drawerOpen: true,
    });
  }

  async resumePolling(): Promise<void> {
    const state = useJudgeStore.getState();
    if (state.resumableJobId === null) return;
    await this.poll(state.resumableJobId, state.operation ?? "run");
  }

  async prepareReview(filePath: string): Promise<string | null> {
    useJudgeStore.setState({ reviewBusy: true, result: notice("working", "正在准备评审", "只会使用当前题目、代码和选定判题结果。"), drawerOpen: true });
    try {
      const jobId = useJudgeStore.getState().currentJobId;
      await judgeApi.review(filePath, jobId ?? undefined);
      const prompt = `请使用 leetcode_prepare_review 评审文件 ${filePath}` +
        (jobId === null ? "" : `，并使用判题 Job #${jobId}`) +
        "。先分析正确性、复杂度和边界条件，不要直接覆盖我的代码。";
      useJudgeStore.setState({ result: notice("success", "评审信息已准备", "调用提示已复制，回到 Codex 对话粘贴即可。"), drawerOpen: true });
      return prompt;
    } catch (error) {
      this.handleError(error);
      return null;
    } finally {
      useJudgeStore.setState({ reviewBusy: false });
    }
  }

  shutdown(): void {
    this.stopLocalPoll();
  }

  private async poll(jobId: number, operation: JudgeOperationDto): Promise<void> {
    const generation = ++this.pollingGeneration;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    useJudgeStore.setState({
      activePollJobId: jobId,
      activePollType: operation,
      resumableJobId: null,
      result: notice("working", "正在等待判题结果", "完成后会在这里显示结果。", operation),
      drawerOpen: true,
    });
    try {
      const value = await judgeApi.result(jobId, controller.signal);
      if (generation !== this.pollingGeneration) return;
      useJudgeStore.setState({
        result: safePresent(value, operation),
        resumableJobId: isTerminal(value) ? null : jobId,
        drawerOpen: true,
      });
    } catch (error) {
      if (controller.signal.aborted || generation !== this.pollingGeneration) return;
      if (error instanceof ApiError && error.code === "JUDGE_POLL_CANCELLED") {
        useJudgeStore.setState({ result: notice("warning", "已停止等待", "远端任务仍然保留，可以随时继续查询。", operation), resumableJobId: jobId });
      } else {
        this.handleError(error);
        if (!(error instanceof ApiError && error.code === "SUBMIT_OUTCOME_UNKNOWN")) {
          useJudgeStore.setState({ resumableJobId: jobId });
        }
      }
    } finally {
      if (generation === this.pollingGeneration) {
        useJudgeStore.setState({ activePollJobId: null, activePollType: null });
      }
    }
  }

  private async stopActiveRunForSubmit(): Promise<void> {
    const state = useJudgeStore.getState();
    if (state.activePollJobId === null || state.activePollType !== "run") return;
    await judgeApi.cancel(state.activePollJobId).catch(() => undefined);
    this.stopLocalPoll();
    useJudgeStore.setState({ activePollJobId: null, activePollType: null, resumableJobId: null });
  }

  private stopLocalPoll(): void {
    this.pollingGeneration += 1;
    this.controller?.abort();
    this.controller = undefined;
  }

  private handleError(error: unknown): void {
    const state = useJudgeStore.getState();
    let currentJobId = state.currentJobId;
    if (
      error instanceof ApiError && typeof error.details === "object" && error.details !== null &&
      "jobId" in error.details && typeof error.details.jobId === "number"
    ) currentJobId = error.details.jobId;
    if (isAuthError(error)) eventBus.emit("auth:required", "登录已失效，请重新登录。");
    const prefix = error instanceof ApiError && error.code === "SUBMIT_OUTCOME_UNKNOWN"
      ? "提交结果不确定，已阻止自动重发。"
      : "操作失败。";
    useJudgeStore.setState({
      currentJobId,
      result: notice("failure", prefix.replace(/[。.]$/u, ""), messageOf(error), state.operation),
      drawerOpen: true,
    });
  }
}

function safePresent(value: unknown, operation: JudgeOperationDto | null): JudgeResultPresentation {
  return presentJudgeResult(value, operation) ?? notice("failure", "结果无法显示", "力扣返回了暂不支持的结果格式，请稍后重新查询。", operation);
}

function notice(
  tone: JudgeResultTone,
  title: string,
  message: string,
  operation: JudgeOperationDto | null = null,
): JudgeResultPresentation {
  return {
    tone,
    eyebrow: operation === "submit" ? "提交状态" : operation === "run" ? "运行状态" : "代码操作",
    title,
    message,
    metrics: [],
    details: [],
  };
}

function isTerminal(value: unknown): boolean {
  return typeof value === "object" && value !== null && "terminal" in value && value.terminal === true;
}

export const judgeService = new JudgeService();
