import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const target = path.resolve("dist/ui/catalog.html");
const html = readFileSync(target, "utf8");
const failures = [];
if (/<script\b[^>]*\bsrc=/iu.test(html)) failures.push("catalog.html references an external script");
if (/<link\b[^>]*\brel=["']stylesheet["']/iu.test(html)) failures.push("catalog.html references an external stylesheet");
if (/LEETCODE_SESSION|csrftoken|session-value|csrf-value/u.test(html)) failures.push("catalog.html contains a credential identifier or fixture secret");
if (!html.includes("id=\"root\"")) failures.push("catalog.html is missing the React mount root");
if (statSync(target).size > 750_000) failures.push("catalog.html exceeds the 750 KB architecture budget");

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
