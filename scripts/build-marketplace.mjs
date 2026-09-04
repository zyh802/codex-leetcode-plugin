import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { findNpmCli } from "./runtime/prepare-runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "plugins/codex-leecode-plugin");
const temporary = mkdtempSync(path.join(os.tmpdir(), "leetcode-package-"));
const check = process.argv.includes("--check");
const prepared = path.join(temporary, "plugin");
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? files(file) : [file];
});
try {
  mkdirSync(prepared);
  const stage = path.join(temporary, "runtime");
  mkdirSync(stage);
  const runtimeFiles = files(path.join(root, "src")).filter((file) => file.endsWith(".ts")).map((file) =>
    path.join("dist", path.relative(path.join(root, "src"), file).replace(/\.ts$/u, ".js")));
  runtimeFiles.push("dist/ui/catalog.html");
  for (const file of runtimeFiles) {
    mkdirSync(path.dirname(path.join(stage, file)), { recursive: true });
    cpSync(path.join(root, file), path.join(stage, file));
  }
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  delete manifest.scripts;
  manifest.files = ["dist", "npm-shrinkwrap.json"];
  writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // npm honours shrinkwrap when installing the tarball, pinning transitive runtime dependencies.
  cpSync(path.join(root, "package-lock.json"), path.join(stage, "npm-shrinkwrap.json"));
  const packed = JSON.parse(execFileSync(process.execPath, [findNpmCli(), "pack", "--ignore-scripts", "--json", "--pack-destination", temporary], { cwd: stage, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (!packed[0].files.some((file) => file.path === "npm-shrinkwrap.json")) {
    throw new Error("分发归档缺少 npm-shrinkwrap.json，禁止生成未锁定依赖的安装包。");
  }
  cpSync(path.join(temporary, packed[0].filename), path.join(prepared, "runtime.tgz"));
  for (const folder of [".codex-plugin", "skills", "assets"]) cpSync(path.join(root, folder), path.join(prepared, folder), { recursive: true });
  cpSync(path.join(root, "README.md"), path.join(prepared, "README.md"));
  writeFileSync(path.join(prepared, ".mcp.json"), `${JSON.stringify({ mcpServers: { leetcode: {
    type: "stdio", command: "node", args: ["-e", "const p=require('node:path'),u=require('node:url');const r=process.env.PLUGIN_ROOT||process.env.CLAUDE_PLUGIN_ROOT||process.cwd();import(u.pathToFileURL(p.join(r,'bootstrap.mjs')).href);"],
  } } }, null, 2)}\n`);
  await build({
    entryPoints: [path.join(root, "scripts/runtime/launcher.mjs")], outfile: path.join(prepared, "bootstrap.mjs"),
    bundle: true, platform: "node", target: "node22", format: "esm", minify: true,
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  const client = new Client({ name: "catalog-packager", version: "1.0.0" });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, "dist/index.js")],
      env: { ...process.env, CODEX_LEETCODE_DATA_DIR: path.join(temporary, "data") }, stderr: "pipe" }));
    const catalog = await client.listTools();
    writeFileSync(path.join(prepared, "tools.json"), `${JSON.stringify({ serverInfo: client.getServerVersion(), tools: catalog.tools }, null, 2)}\n`);
  } finally { await client.close(); }
  const relativeFiles = files(prepared).map((file) => path.relative(prepared, file));
  if (check) {
    const changed = relativeFiles.filter((file) => !existsSync(path.join(output, file)) || !readFileSync(path.join(prepared, file)).equals(readFileSync(path.join(output, file))));
    const extra = files(output).map((file) => path.relative(output, file)).filter((file) => !relativeFiles.includes(file));
    if (changed.length || extra.length) throw new Error(`分发包与源码不一致，请执行 npm run build:marketplace 并一同提交：${[...changed, ...extra].join(", ")}`);
  } else {
    // Only remove obsolete generated files from the designated package directory.
    if (existsSync(output)) for (const file of files(output)) if (!relativeFiles.includes(path.relative(output, file))) rmSync(file);
    cpSync(prepared, output, { recursive: true });
  }
  process.stdout.write(`${check ? "Verified" : "Built"} marketplace package (${relativeFiles.length} files).\n`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
