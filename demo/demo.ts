import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import "../src/flipview.css";
import { createFlipview, createPdfSource, createImageSource } from "../src/index";
import type { FlipviewHandle, PageSource } from "../src/index";

const stage = document.getElementById("stage")!;
const status = document.getElementById("status")!;
const cover = document.getElementById("cover") as HTMLInputElement;
cover.checked = true;
const hard = document.getElementById("hard") as HTMLInputElement;
const slow = document.getElementById("slow") as HTMLInputElement;

let book: FlipviewHandle | null = null;
let load: (() => Promise<PageSource>) | null = null;

async function open(next?: () => Promise<PageSource>, startAt = 0) {
  if (next) load = next;
  if (!load) return;
  book?.destroy();
  stage.replaceChildren();
  status.textContent = "loading...";
  const source = await load();
  book = createFlipview(stage, source, {
    deepLink: true,
    showCover: cover.checked,
    hardCovers: hard.checked,
    flippingTime: slow.checked ? 3000 : 700,
    onError: (err, i) => (status.textContent = `page ${i + 1}: ${String(err)}`.slice(0, 120)),
    onPageChange: (i) => (status.textContent = `page ${i + 1} / ${source.pageCount}`),
  });
  if (startAt > 0) book.goTo(startAt);
  status.textContent = `page ${(book.currentPage() ?? 0) + 1} / ${source.pageCount}`;
  // Test hook: the e2e suite and manual debugging drive the book through this.
  (window as unknown as { flipview: unknown }).flipview = book;
}

// Rebuilding keeps the reader where they were, so options can be compared in place.
for (const box of [cover, hard, slow]) {
  box.addEventListener("change", () => void open(undefined, book?.currentPage() ?? 0));
}

document.getElementById("file")!.addEventListener("change", (e) => {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;
  if (files[0].type === "application/pdf") {
    void open(async () => createPdfSource({ data: await files[0].arrayBuffer(), workerSrc }));
  } else {
    const urls = files.map((f) => URL.createObjectURL(f));
    void open(() => createImageSource(urls));
  }
});

// Sample document so the demo shows something on load.
void open(() => createPdfSource({ url: "./sample.pdf", workerSrc }));
