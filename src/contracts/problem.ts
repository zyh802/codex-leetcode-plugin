import type { ProblemDetailView } from "../domain/types.js";

export type ProblemDetailDto = ProblemDetailView;

export interface GetProblemRequestDto {
  problemId: number;
}
