export interface WorkspaceSettingsDto {
  workspaceRoot: string | null;
  solutionRoot: string | null;
  customized: boolean;
}

export interface EditableSolutionDto {
  filePath: string;
  content: string;
  codeHash: string;
}

export interface CreatedSolutionDto {
  filePath: string;
  metadataPath: string;
  created: boolean;
  codeHash: string;
  editor: EditableSolutionDto;
}

export interface SaveSolutionRequestDto extends EditableSolutionDto {
  expectedHash: string;
}
