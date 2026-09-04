import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import lockfile from "proper-lockfile";
import { x as extractTar } from "tar";

export function checkNodeVersion(version = process.versions.node) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (major < 22 || (major === 22 && (minor < 22 || (minor === 22 && patch < 2)))) {
    throw new Error("请安装 Node.js 22.22.2 或更新版本（包含 npm），然后重新打开插件。");
  }
}

export function findNpmCli(environment = process.env, executable = process.execPath) {
  const directories = [path.dirname(executable), ...(environment.PATH ?? environment.Path ?? "").split(path.delimiter)];
  const candidates = [environment.npm_execpath, ...directories.flatMap((directory) => [
    path.join(directory, "node_modules/npm/bin/npm-cli.js"),
    path.resolve(directory, "../lib/node_modules/npm/bin/npm-cli.js"),
    path.join(directory, "npm"),
  ])];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const resolved = realpathSync(candidate);
    if (path.basename(resolved) === "npm-cli.js") return resolved;
  }
  throw new Error("未找到 npm。请安装包含 npm 的 Node.js，并重新启动 Codex。");
}

export function runtimeKey(archive, platform = process.platform, arch = process.arch, abi = process.versions.modules) {
  return `${platform}-${arch}-abi${abi}-${createHash("sha256").update(archive).digest("hex").slice(0, 24)}`;
}

export function resolveDataRoot(environment = process.env) {
  return path.resolve(environment.CODEX_LEETCODE_DATA_DIR || environment.PLUGIN_DATA || environment.CLAUDE_PLUGIN_DATA ||
    path.join(environment.CODEX_HOME || path.join(os.homedir(), ".codex"), "plugin-data", "codex-leecode-plugin"));
}

function stopChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    const command = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    spawnSync(command, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}

/** Never invoke npm.cmd through a shell: spaces and metacharacters in paths stay arguments. */
export function runNode(args, { cwd, signal, timeoutMs = 180_000, env = process.env } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(process.stderr, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    let stopped;
    const stop = (reason) => { stopped = reason; stopChild(child); };
    const abort = () => stop(new Error("插件已关闭，运行环境准备已取消。"));
    const timer = setTimeout(() => stop(new Error("依赖准备超时，请检查网络后重试。")), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code) => {
      cleanup();
      if (stopped) reject(stopped);
      else if (code !== 0) reject(new Error(`运行环境准备失败（退出码 ${code}）。请检查 npm 网络及本机原生依赖支持后重试。`));
      else resolve();
    });
  });
}

export async function prepareRuntime({ pluginRoot, dataRoot, signal, install = installRuntime }) {
  checkNodeVersion();
  const archivePath = path.join(pluginRoot, "runtime.tgz");
  const key = runtimeKey(readFileSync(archivePath));
  const cacheRoot = path.join(dataRoot, "runtime");
  const destination = path.join(cacheRoot, key);
  const entry = path.join(destination, "dist/index.js");
  const ready = () => existsSync(path.join(destination, ".ready")) && existsSync(entry);
  if (ready()) return entry;
  mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  const release = await lockfile.lock(cacheRoot, {
    realpath: false, lockfilePath: `${destination}.lock`, stale: 30_000, update: 5_000,
    retries: { retries: 200, factor: 1, minTimeout: 1000, maxTimeout: 1000 },
  });
  let staging;
  try {
    signal?.throwIfAborted();
    if (ready()) return entry;
    process.stderr.write("[Codex LeetCode] 首次启动，正在准备本机运行依赖；后续启动将复用缓存。\n");
    staging = mkdtempSync(path.join(cacheRoot, `${key}.preparing-`));
    await install({ staging, archivePath, signal });
    signal?.throwIfAborted();
    writeFileSync(path.join(staging, ".ready"), key);
    // Only replace this content-addressed, plugin-owned cache, never user solution/data directories.
    if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    renameSync(staging, destination);
    staging = undefined;
    return entry;
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
    await release();
  }
}

async function installRuntime({ staging, archivePath, signal }) {
  await extractTar({ file: archivePath, cwd: staging, strip: 1, strict: true });
  signal?.throwIfAborted();
  // Install from the extracted lockfile, without resolving dependency ranges again.
  await runNode([findNpmCli(), "ci", "--omit=dev", "--prefer-offline", "--no-audit", "--no-fund", "--no-update-notifier", "--registry=https://registry.npmjs.org"], { cwd: staging, signal });
  // Probe native modules before publishing the cache; never mark a broken ABI installation ready.
  const probe = "const{createRequire}=require('node:module');const p=require('node:path');const r=createRequire(p.join(process.cwd(),'package.json'));const DB=r('better-sqlite3');new DB(':memory:').close();r('@napi-rs/keyring');";
  await runNode(["-e", probe], { cwd: staging, signal, timeoutMs: 15_000 });
}
