import type { CatalogStatsDto, ProblemListItemDto } from "./catalog.js";
import type { WorkspaceSettingsDto } from "./workspace.js";

export interface CatalogLaunchDto {
  url: string;
  origin: string;
  presentation: "codex-browser";
  workspaceRoot: string | null;
  solutionRoot: string | null;
}

export interface CatalogBootstrapDto {
  stats: CatalogStatsDto;
  query: string;
  problems: ProblemListItemDto[];
  workspace: WorkspaceSettingsDto;
}
