import { apiRequest, callTool } from "@/api/client.js";
import type { CreatedSolutionDto, EditableSolutionDto, WorkspaceSettingsDto } from "./types.js";

export const workspaceApi = {
  create(problemId: number, langSlug: string, signal?: AbortSignal): Promise<CreatedSolutionDto> {
    return callTool<CreatedSolutionDto>("leetcode_create_solution", { problemId, langSlug }, signal);
  },
  save(filePath: string, content: string, expectedHash: string, signal?: AbortSignal): Promise<EditableSolutionDto> {
    return apiRequest<EditableSolutionDto>("/api/editor/save", {
      body: { filePath, content, expectedHash },
      signal,
    });
  },
  setSolutionRoot(directory: string | null, signal?: AbortSignal): Promise<WorkspaceSettingsDto> {
    return apiRequest<WorkspaceSettingsDto>("/api/settings/solution-root", { body: { directory }, signal });
  },
};
