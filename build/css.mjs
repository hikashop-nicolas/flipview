// One stylesheet ships, not two. The engine's rules and ours are concatenated into
// dist/flipview.css so a consumer has a single import, and so the library does not
// depend on its bundler resolving a CSS import from inside a TypeScript module.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const parts = [
  await readFile(join(root, "src/engine/Style/stPageFlip.css"), "utf8"),
  await readFile(join(root, "src/flipview.css"), "utf8"),
];

await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/flipview.css"), parts.join("\n"), "utf8");
console.log("dist/flipview.css written");
