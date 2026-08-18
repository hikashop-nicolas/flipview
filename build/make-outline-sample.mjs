// Writes demo/public/outline.pdf: a small document that has a table of contents.
//
// Handwritten rather than generated, because nothing on the machine adds an
// outline to a PDF and the demo needs one to show the contents panel at all.
// It is a valid PDF, assembled here so the byte offsets in the xref are right.
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PAGES = ["Introduction", "Materials", "Care and washing", "Contact"];

const objects = [];
const add = (body) => objects.push(body) && objects.length;

// 1: catalogue, 2: page tree, 3: font, then per page: page object + content.
const catalogue = add("");
const tree = add("");
const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

const pageIds = [];
const contentIds = [];

for (const title of PAGES) {
  // The page is 420 by 595, so the text goes where the page actually is: a
  // stream drawn above the MediaBox is valid, invisible, and baffling.
  const text =
    `BT /F1 28 Tf 50 500 Td (${title}) Tj ET\n` +
    `BT /F1 12 Tf 50 460 Td (A page of the outline sample.) Tj ET`;
  const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  contentIds.push(content);
  pageIds.push(
    add(
      `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 420 595]` +
        ` /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    ),
  );
}

const outlines = add("");
const items = PAGES.map(() => add(""));

items.forEach((id, index) => {
  const next = items[index + 1] ? ` /Next ${items[index + 1]} 0 R` : "";
  const prev = items[index - 1] ? ` /Prev ${items[index - 1]} 0 R` : "";
  objects[id - 1] =
    `<< /Title (${PAGES[index]}) /Parent ${outlines} 0 R${prev}${next}` +
    ` /Dest [${pageIds[index]} 0 R /Fit] >>`;
});

objects[outlines - 1] =
  `<< /Type /Outlines /First ${items[0]} 0 R /Last ${items[items.length - 1]} 0 R /Count ${items.length} >>`;
objects[tree - 1] =
  `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
objects[catalogue - 1] =
  `<< /Type /Catalog /Pages ${tree} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines >>`;

let pdf = "%PDF-1.4\n";
const offsets = [];

objects.forEach((body, index) => {
  offsets.push(pdf.length);
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});

const startxref = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogue} 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

const out = join(root, "demo/public/outline.pdf");
await writeFile(out, pdf, "latin1");
console.log(`${out}: ${PAGES.length} pages, ${items.length} bookmarks, ${pdf.length} bytes`);
