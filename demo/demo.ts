import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import "../src/flipview.css";
import { createFlipview, createPdfSource, createImageSource } from "../src/index";
import type { FlipviewHandle } from "../src/index";

const stage = document.getElementById("stage")!;
const status = document.getElementById("status")!;
let book: FlipviewHandle | null = null;

async function open(load: () => Promise<Awaited<ReturnType<typeof createPdfSource>>>) {
  book?.destroy();
  stage.replaceChildren();
  status.textContent = "loading...";
  const source = await load();
  book = createFlipview(stage, source, {
    onPageChange: (i) => (status.textContent = `page ${i + 1} / ${source.pageCount}`),
  });
  status.textContent = `page 1 / ${source.pageCount}`;
  // Test hook: the e2e suite and manual debugging drive the book through this.
  (window as unknown as { flipview: unknown }).flipview = book;
}

document.getElementById("file")!.addEventListener("change", (e) => {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  if (!files.length) return;
  if (files[0].type === "application/pdf") {
    void open(async () =>
      createPdfSource({ data: await files[0].arrayBuffer(), workerSrc }),
    );
  } else {
    const urls = files.map((f) => URL.createObjectURL(f));
    void open(() => createImageSource(urls) as never);
  }
});

// Sample document so the demo shows something on load.
void open(() => createPdfSource({ url: "./sample.pdf", workerSrc }));
