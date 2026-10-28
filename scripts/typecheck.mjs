// Typecheck the inline <script> of index.html with the TypeScript compiler (checkJs, no emit).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) throw new Error(`expected one inline script, found ${scripts.length}`);

// Keep line numbers aligned with index.html so errors point at the real source line.
const before = html.slice(0, html.indexOf(scripts[0])).split("\n").length - 1;
const out = join(root, ".typecheck");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "app.js"), "\n".repeat(before) + scripts[0]);

const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tsc, "--noEmit", "--allowJs", "--checkJs", "--target", "es2022",
  "--lib", "es2022,dom,dom.iterable", "--skipLibCheck", join(out, "app.js")], { stdio: "inherit" });
if (result.status !== 0) {
  console.error("typecheck failed (line numbers match index.html)");
  process.exit(result.status ?? 1);
}
console.log("typecheck passed: inline script of index.html");
