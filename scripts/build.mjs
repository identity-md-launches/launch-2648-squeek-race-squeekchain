// Production export: index.html is already the whole app (zero dependencies, zero bundling),
// so the build copies it and its share image into dist/ and checks that every URL is relative.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const files = ["index.html", "og-image.png"];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const file of files) {
  if (!existsSync(join(root, file))) throw new Error(`missing ${file}`);
  cpSync(join(root, file), join(dist, file));
}

const html = readFileSync(join(dist, "index.html"), "utf8");
const absolute = [...html.matchAll(/\s(?:src|href|content)="(\/[^"]*)"/g)].map((m) => m[1]);
if (absolute.length) throw new Error(`root-absolute URLs break gateway subpaths: ${absolute.join(", ")}`);
for (const [, ref] of html.matchAll(/\s(?:src|href|content)="\.\/([^"#?]+)"/g)) {
  if (!existsSync(join(dist, ref))) throw new Error(`index.html references ./${ref}, which is not in dist/`);
}
console.log(`dist/ written: ${files.join(", ")}`);
