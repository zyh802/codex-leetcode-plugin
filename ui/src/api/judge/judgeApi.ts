import { callTool } from "@/api/client.js";
import { JUDGE_WAIT_MS } from "@/config/constants.js";
import type { JudgeJobDto, JudgeTicketDto, SubmissionConfirmationDto } from "./types.js";

export const judgeApi = {
  run(filePath: string, input: string): Promise<JudgeTicketDto> {
    return callTool<JudgeTicketDto>("leetcode_remote_run", { filePath, input });
  },
  prepareSubmit(filePath: string): Promise<SubmissionConfirmationDto> {
    return callTool<SubmissionConfirmationDto>("leetcode_prepare_submission", { filePath });
  },
  submit(filePath: string, confirmationToken: string): Promise<JudgeTicketDto> {
    return callTool<JudgeTicketDto>("leetcode_submit_solution", { filePath, confirmationToken });
  },
  result(jobId: number, signal?: AbortSignal): Promise<unknown> {
    return callTool<unknown>("leetcode_get_judge_result", { jobId, waitMs: JUDGE_WAIT_MS }, signal);
  },
  cancel(jobId: number): Promise<unknown> {
    return callTool("leetcode_cancel_judge_poll", { jobId });
  },
  latest(filePath: string): Promise<JudgeJobDto | null> {
    return callTool<JudgeJobDto | null>("leetcode_get_latest_judge_job", { filePath });
  },
  review(filePath: string, judgeJobId?: number): Promise<unknown> {
    return callTool("leetcode_prepare_review", {
      filePath,
      ...(judgeJobId === undefined ? {} : { judgeJobId }),
    });
  },
};
