import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// Runtime bootstrap stays dependency-free after bundling and is shipped as JavaScript.
import { checkNodeVersion, findNpmCli, prepareRuntime, runNode, runtimeKey } from "../scripts/runtime/prepare-runtime.mjs";

const temporary: string[] = [];
const workspace = (): string => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "leetcode bootstrap test "));
  temporary.push(directory);
  writeFileSync(path.join(directory, "runtime.tgz"), "test-runtime");
  return directory;
};
const fakeInstall = async ({ staging }: { staging: string }): Promise<void> => {
  const directory = path.join(staging, "dist");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "index.js"), "export {};");
};
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("marketplace runtime bootstrap", () => {
  it("checks the native runtime's minimum Node version", () => {
    for (const version of ["20.19.0", "22.21.0", "22.22.1"]) expect(() => checkNodeVersion(version)).toThrow("22.22.2");
    for (const version of ["22.22.2", "22.23.0", "24.0.0"]) expect(() => checkNodeVersion(version)).not.toThrow();
  });

  it("isolates the cache by platform, architecture, ABI and package content", () => {
    const base = runtimeKey("one", "darwin", "arm64", "137");
    expect(new Set([base, runtimeKey("two", "darwin", "arm64", "137"), runtimeKey("one", "win32", "arm64", "137"),
      runtimeKey("one", "darwin", "x64", "137"), runtimeKey("one", "darwin", "arm64", "127")]).size).toBe(5);
  });

  it("resolves npm's JavaScript entry point in a Node installation with spaces", () => {
    const directory = workspace();
    const npm = path.join(directory, "node_modules/npm/bin/npm-cli.js");
    mkdirSync(path.dirname(npm), { recursive: true });
    writeFileSync(npm, "");
    expect(findNpmCli({ PATH: "" }, path.join(directory, "node.exe"))).toBe(realpathSync(npm));
    expect(() => findNpmCli({ PATH: "" }, path.join(directory, "missing/node.exe"))).toThrow("npm");
  });

  it("installs once across concurrent starts and reuses the completed runtime", async () => {
    const directory = workspace();
    const install = vi.fn(fakeInstall);
    const options = { pluginRoot: directory, dataRoot: directory, install };
    const [first, second] = await Promise.all([prepareRuntime(options), prepareRuntime(options)]);
    expect(first).toBe(second);
    expect(existsSync(first)).toBe(true);
    expect(await prepareRuntime(options)).toBe(first);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("cleans failed setup and permits the next explicit attempt", async () => {
    const directory = workspace();
    const options = { pluginRoot: directory, dataRoot: directory };
    await expect(prepareRuntime({ ...options, install: async () => { throw new Error("offline"); } })).rejects.toThrow("offline");
    expect(readdirSync(path.join(directory, "runtime"))).toEqual([]);
    expect(existsSync(await prepareRuntime({ ...options, install: fakeInstall }))).toBe(true);
  });

  it("does not publish a cancelled installation or delete user solution files", async () => {
    const directory = workspace();
    const solution = path.join(directory, "solution.ts");
    writeFileSync(solution, "user code");
    const controller = new AbortController();
    await expect(prepareRuntime({ pluginRoot: directory, dataRoot: directory, signal: controller.signal,
      install: async (options: { staging: string }) => { await fakeInstall(options); controller.abort(); },
    })).rejects.toThrow();
    expect(readdirSync(path.join(directory, "runtime"))).toEqual([]);
    expect(existsSync(solution)).toBe(true);
  });

  it("terminates an installer that exceeds its deadline", async () => {
    await expect(runNode(["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 200 })).rejects.toThrow("超时");
  });

  it("cancels an active installer process", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 200);
    try {
      await expect(runNode(["-e", "setInterval(() => {}, 1000)"], { signal: controller.signal })).rejects.toThrow("取消");
    } finally { clearTimeout(timer); }
  });
});
