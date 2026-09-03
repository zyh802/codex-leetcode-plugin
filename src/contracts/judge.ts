export type JudgeOperationDto = "run" | "submit";

export interface JudgeTicketDto {
  jobId: number;
  remoteId: string;
}

export interface SubmissionConfirmationDto {
  confirmationToken: string;
  problemId: number;
  slug: string;
  langSlug: string;
  filePath: string;
  codeHash: string;
  expiresAt: string;
}

export interface JudgeJobDto {
  id: number;
  type: JudgeOperationDto;
  state: string;
  remoteId: string | null;
  resultJson: string | null;
}
