import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { AppError } from "../core/errors.js";
import type { SolutionTemplate } from "../domain/types.js";
import type { LeetCodeDatabase } from "../storage/database.js";

interface WorkspaceMetadata {
  schemaVersion: 1;
  endpoint: "cn";
  questionId: string;
  frontendId: string;
  titleSlug: string;
  solutions: Record<string, string>;
}

export interface ResolvedSolution {
  problemId: number;
  questionId: string;
  frontendId: string;
  slug: string;
  langSlug: string;
  filePath: string;
  code: string;
  codeHash: string;
}

export interface EditableSolution {
  filePath: string;
  content: string;
  codeHash: string;
}

export class WorkspaceManager {
  constructor(private readonly database: LeetCodeDatabase) {}

  createSolution(template: SolutionTemplate, rootDirectory: string): {
    filePath: string;
    metadataPath: string;
    created: boolean;
    codeHash: string;
  } {
    const root = path.resolve(rootDirectory);
    mkdirSync(root, { recursive: true });
    if (lstatSync(root).isSymbolicLink()) {
      throw new AppError("INVALID_INPUT", "Solution root cannot be a symbolic link.");
    }
    const problemDirectory = path.join(
      root,
      "cn",
      `${template.frontendId.padStart(4, "0")}-${safeSegment(template.slug)}`,
    );
    mkdirSync(problemDirectory, { recursive: true });
    assertWithinRoot(root, problemDirectory);

    const filePath = path.join(problemDirectory, `solution.${extensionForLanguage(template.langSlug)}`);
    const metadataPath = path.join(problemDirectory, "metadata.json");
    const created = !existsSync(filePath);
    if (created) atomicCreate(filePath, template.starterCode);

    const metadata = readOrCreateMetadata(metadataPath, {
      schemaVersion: 1,
      endpoint: "cn",
      questionId: template.questionId,
      frontendId: template.frontendId,
      titleSlug: template.slug,
      solutions: {},
    });
    assertMetadataIdentity(metadata, template.questionId, template.slug);
    metadata.solutions[template.langSlug] = path.basename(filePath);
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

    const codeHash = sha256(readFileSync(filePath, "utf8"));
    this.database.upsertWorkspace(template.problemId, template.langSlug, filePath, codeHash);
    return { filePath, metadataPath, created, codeHash };
  }

  readSolutionForEditing(filePathInput: string, rootDirectory: string): EditableSolution {
    const filePath = resolveEditableFile(filePathInput, rootDirectory);
    const content = readFileSync(filePath, "utf8");
    return { filePath, content, codeHash: sha256(content) };
  }

  saveSolutionFromEditor(
    filePathInput: string,
    rootDirectory: string,
    content: string,
    expectedHash: string,
  ): EditableSolution {
    const filePath = resolveEditableFile(filePathInput, rootDirectory);
    const currentContent = readFileSync(filePath, "utf8");
    if (sha256(currentContent) !== expectedHash) {
      throw new AppError(
        "FILE_CHANGED_DURING_EDIT",
        "代码文件已在编辑器外被修改。请重新创建/打开该题，确认最新内容后再保存。",
      );
    }
    atomicReplace(filePath, content);
    return { filePath, content, codeHash: sha256(content) };
  }

  resolveSolution(filePathInput: string): ResolvedSolution {
    const filePath = path.resolve(filePathInput);
    if (!existsSync(filePath)) throw new AppError("FILE_NOT_FOUND", `Solution file does not exist: ${filePath}`);
    const codeWithMarkers = readFileSync(filePath, "utf8");
    const metadataPath = path.join(path.dirname(filePath), "metadata.json");

    let problemId: number;
    let questionId: string;
    let frontendId: string;
    let slug: string;
    let langSlug: string;
    if (existsSync(metadataPath)) {
      const metadata = parseMetadata(readFileSync(metadataPath, "utf8"));
      const match = Object.entries(metadata.solutions).find(([, name]) => name === path.basename(filePath));
      if (!match) {
        throw new AppError("SOLUTION_IDENTITY_CONFLICT", "metadata.json does not map the selected solution file.");
      }
      langSlug = match[0];
      const local = this.database.findProblemByFrontendId(metadata.frontendId);
      if (local.questionId !== metadata.questionId || local.slug !== metadata.titleSlug) {
        throw new AppError("SOLUTION_IDENTITY_CONFLICT", "Local problem identity conflicts with metadata.json.");
      }
      problemId = local.id;
      questionId = local.questionId;
      frontendId = metadata.frontendId;
      slug = local.slug;
    } else {
      const marker = parseLeetCodeMarker(codeWithMarkers);
      const local = this.database.findProblemByFrontendId(marker.frontendId);
      problemId = local.id;
      questionId = local.questionId;
      frontendId = marker.frontendId;
      slug = local.slug;
      langSlug = marker.langSlug;
    }

    const code = extractCodeRegion(codeWithMarkers);
    const codeHash = sha256(code);
    this.database.upsertWorkspace(problemId, langSlug, filePath, codeHash);
    return { problemId, questionId, frontendId, slug, langSlug, filePath, code, codeHash };
  }
}

function readOrCreateMetadata(metadataPath: string, fallback: WorkspaceMetadata): WorkspaceMetadata {
  if (!existsSync(metadataPath)) return fallback;
  return parseMetadata(readFileSync(metadataPath, "utf8"));
}

function parseMetadata(raw: string): WorkspaceMetadata {
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceMetadata>;
    if (
      parsed.schemaVersion === 1 && parsed.endpoint === "cn" &&
      typeof parsed.questionId === "string" && typeof parsed.frontendId === "string" &&
      typeof parsed.titleSlug === "string" && typeof parsed.solutions === "object" &&
      parsed.solutions !== null
    ) {
      return parsed as WorkspaceMetadata;
    }
  } catch {
    // The generic error below avoids copying untrusted metadata into logs.
  }
  throw new AppError("SOLUTION_IDENTITY_CONFLICT", "metadata.json is invalid.");
}

function assertMetadataIdentity(metadata: WorkspaceMetadata, questionId: string, slug: string): void {
  if (metadata.questionId !== questionId || metadata.titleSlug !== slug || metadata.endpoint !== "cn") {
    throw new AppError("SOLUTION_IDENTITY_CONFLICT", "Existing metadata belongs to another problem.");
  }
}

function parseLeetCodeMarker(code: string): { frontendId: string; langSlug: string } {
  const marker = code.match(/@lc\s+app=\S+\s+id=(\S+)\s+lang=(\S+)/u);
  if (!marker?.[1] || !marker[2]) {
    throw new AppError("SOLUTION_IDENTITY_CONFLICT", "No metadata.json or compatible @lc marker was found.");
  }
  return { frontendId: marker[1], langSlug: marker[2] };
}

export function extractCodeRegion(code: string): string {
  const startMarker = "@lc code=start";
  const endMarker = "@lc code=end";
  const start = code.indexOf(startMarker);
  const end = code.indexOf(endMarker);
  if (start === -1 && end === -1) return code;
  if (start === -1 || end === -1 || end <= start) {
    throw new AppError("SOLUTION_IDENTITY_CONFLICT", "The @lc code markers are incomplete or out of order.");
  }
  const contentStart = code.indexOf("\n", start);
  const endLineStart = code.lastIndexOf("\n", end);
  if (contentStart === -1 || endLineStart <= contentStart) {
    throw new AppError("SOLUTION_IDENTITY_CONFLICT", "The @lc code markers must be on separate lines.");
  }
  return code.slice(contentStart + 1, endLineStart).replace(/\r$/u, "");
}

function atomicCreate(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function atomicReplace(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: lstatSync(filePath).mode });
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

function resolveEditableFile(filePathInput: string, rootDirectory: string): string {
  const root = path.resolve(rootDirectory);
  const filePath = path.resolve(filePathInput);
  if (!existsSync(root) || !existsSync(filePath)) {
    throw new AppError("FILE_NOT_FOUND", "要编辑的代码文件不存在。");
  }
  if (lstatSync(root).isSymbolicLink() || lstatSync(filePath).isSymbolicLink()) {
    throw new AppError("INVALID_INPUT", "解答目录和代码文件不能是符号链接。");
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(filePath);
  assertWithinRoot(realRoot, realFile);
  if (!lstatSync(realFile).isFile()) {
    throw new AppError("INVALID_INPUT", "要编辑的路径不是普通文件。");
  }
  return realFile;
}

function assertWithinRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError("INVALID_INPUT", "Resolved solution path escapes the selected root.");
  }
}

function safeSegment(value: string): string {
  const safe = value.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (safe.length === 0) throw new AppError("INVALID_INPUT", "Problem slug cannot form a safe path.");
  return safe;
}

function extensionForLanguage(langSlug: string): string {
  const known: Record<string, string> = {
    c: "c", cpp: "cpp", csharp: "cs", golang: "go", java: "java", javascript: "js",
    kotlin: "kt", php: "php", python: "py", python3: "py", ruby: "rb", rust: "rs",
    scala: "scala", swift: "swift", typescript: "ts",
  };
  return known[langSlug] ?? safeSegment(langSlug);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
