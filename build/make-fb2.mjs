// Writes the demo's FB2 out of the EPUB the demo already carries.
//
// Both are the same public-domain book, so nothing new is downloaded and nothing
// new has to be credited; and an FB2 built from real chapters exercises the
// parser the way a real one does.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const files = unzipSync(new Uint8Array(await readFile(join(here, "../demo/public/reflow.epub"))));

const chapters = Object.keys(files)
  .filter((name) => name.endsWith(".html"))
  .sort((a, b) => Number(a.match(/-(\d+)\.htm/)?.[1] ?? 0) - Number(b.match(/-(\d+)\.htm/)?.[1] ?? 0))
  .slice(1, 7);

const cover = Object.keys(files).find((name) => name.endsWith("cover.jpg"));

const escape = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Paragraphs and headings out of Gutenberg's HTML, which is regular enough. */
function chapterOf(html) {
  const title = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const body = html.slice(html.indexOf("<body"));
  const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, inner]) =>
      inner
        .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "<emphasis>$1</emphasis>")
        .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "<emphasis>$1</emphasis>")
        .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "<strong>$1</strong>")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((text) => text !== "");

  return { title, paragraphs };
}

const sections = chapters
  .map((name) => chapterOf(strFromU8(files[name])))
  .filter((chapter) => chapter.paragraphs.length > 0)
  .map(
    ({ title, paragraphs }) =>
      `    <section>
      <title><p>${escape(title || "Chapter")}</p></title>
${paragraphs.map((text) => `      <p>${text}</p>`).join("\n")}
    </section>`
  )
  .join("\n");

const binary = cover
  ? `  <binary id="cover.jpg" content-type="image/jpeg">${Buffer.from(files[cover]).toString("base64")}</binary>\n`
  : "";

const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>children</genre>
      <author><first-name>Lewis</first-name><last-name>Carroll</last-name></author>
      <book-title>Alice's Adventures in Wonderland</book-title>
      <annotation><p>Six chapters, from the Project Gutenberg text, as FictionBook.</p></annotation>
      <lang>en</lang>
${cover ? '      <coverpage><image l:href="#cover.jpg"/></coverpage>\n' : ""}    </title-info>
    <document-info>
      <author><nickname>flipview</nickname></author>
      <programe-used>build/make-fb2.mjs</programe-used>
      <date>2026-08-19</date>
      <id>flipview-demo-alice</id>
      <version>1.0</version>
    </document-info>
  </description>
  <body>
${sections}
  </body>
${binary}</FictionBook>
`;

const out = join(here, "../demo/public/sample.fb2");
await writeFile(out, fb2, "utf8");
console.log(`fb2: ${out} (${Math.round(fb2.length / 1024)} KB, ${chapters.length} chapters)`);
