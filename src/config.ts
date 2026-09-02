import path from "node:path";
import { mkdirSync } from "node:fs";

export interface AppConfig {
  dataDir: string;
  databasePath: string;
  endpoint: "cn";
  requestIntervalMs: number;
}
export function loadConfig(): AppConfig {
  const configured = process.env.CODEX_LEETCODE_DATA_DIR ?? process.env.PLUGIN_DATA;
  const dataDir = path.resolve(configured ?? path.join(process.cwd(), ".data"));
  mkdirSync(dataDir, { recursive: true });

  return {
    dataDir,
    databasePath: path.join(dataDir, "leetcode.db"),
    endpoint: "cn",
    requestIntervalMs: readPositiveInteger("CODEX_LEETCODE_REQUEST_INTERVAL_MS", 1_000),
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
