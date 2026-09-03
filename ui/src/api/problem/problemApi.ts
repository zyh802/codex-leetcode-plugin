import { callTool } from "@/api/client.js";
import type { ProblemDetailDto } from "./types.js";

export const problemApi = {
  get(problemId: number, signal?: AbortSignal): Promise<ProblemDetailDto> {
    return callTool<ProblemDetailDto>("leetcode_get_problem", { problemId }, signal);
  },
};
