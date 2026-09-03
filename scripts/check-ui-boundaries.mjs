import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("ui/src");
const files = walk(root).filter((file) => /\.(ts|tsx)$/u.test(file));
const violations = [];

for (const file of files) {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const source = readFileSync(file, "utf8");
  if (relative.startsWith("api/") && /from ["']@\/(services|pages|components)\//u.test(source)) {
    violations.push(`${relative}: api may not import services/pages/components`);
  }
  if (relative.startsWith("services/") && /from ["']@\/(pages|components)\//u.test(source)) {
    violations.push(`${relative}: services may not import pages/components`);
  }
  if ((relative.startsWith("pages/") || relative.startsWith("components/")) && /\bfetch\s*\(/u.test(source)) {
    violations.push(`${relative}: UI modules may not call fetch directly`);
  }
  if (relative.startsWith("components/") && /from ["']@\/services\/(auth|catalog|problem|workspace|judge|sync)\//u.test(source)) {
    violations.push(`${relative}: shared components may not depend on domain services`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const target = path.join(directory, name);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}
