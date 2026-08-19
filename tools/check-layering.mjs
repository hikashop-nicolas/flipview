// The viewer must not know what a document is made of.
//
// Everything format-specific lives in src/sources, behind the contract in
// src/source.ts. This checks that it stays that way, because the drift is gradual
// and always looks reasonable one import at a time.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = join(root, "src");

/** Libraries that only ever make sense inside a format. */
const FORMAT_LIBRARIES = [/pdfjs-dist/, /epubjs/, /foliate-js/, /jszip/, /fflate/];

/** Words that mean a file has an opinion about one format. */
const FORMAT_WORDS = [/\bpdfjs\b/i, /\bPDFDocument/, /\bepub\b/i];

const problems = [];

async function walk(dir) {
  const out = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith(".ts")) out.push(path);
  }

  return out;
}

for (const file of await walk(src)) {
  const name = relative(root, file);
  // src/sources is where formats are allowed to exist, and the engine is vendored.
  if (name.startsWith("src/sources/") || name.startsWith("src/engine/")) continue;

  const body = await readFile(file, "utf8");

  for (const rx of FORMAT_LIBRARIES) {
    if (rx.test(body)) problems.push(`${name} imports ${rx.source}, which belongs in src/sources`);
  }

  for (const rx of FORMAT_WORDS) {
    // The contract may name formats in prose; code may not.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (rx.test(code) && name !== "src/source.ts") {
      problems.push(`${name} names ${rx.source} outside a comment; the viewer should not know`);
    }
  }
}

// And the contract itself must not reach into a format.
const contract = await readFile(join(src, "source.ts"), "utf8");
if (/^import .*from ["'](?!\.)/m.test(contract)) {
  problems.push("src/source.ts imports a library; the contract has to be free of all of them");
}

if (problems.length === 0) {
  console.log(`layering: the viewer knows nothing about formats (${(await walk(src)).length} files checked)`);
  process.exit(0);
}

console.error(`layering: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
for (const p of problems) console.error("  " + p);
process.exit(1);
