// A book with a very slow page turn and nothing else on the page, for looking at
// the middle of a fold: `node tools/film.mjs http://localhost:5173/slow.html`.
// ?hard films the rigid-cover path. Not built into the published demo.
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
const wasmUrl = new URL("../node_modules/pdfjs-dist/wasm/", import.meta.url).href;
import "../src/engine/Style/stPageFlip.css";
import "../src/flipview.css";
import { createFlipview, createPdfSource } from "../src/index";
const stage = document.getElementById("stage")!;
const source = await createPdfSource({ url: "./sample.pdf", workerSrc, wasmUrl });
(window as unknown as { book: unknown }).book = createFlipview(stage, source, {
  showCover: true,
  hardCovers: new URLSearchParams(location.search).has("hard"),
  flippingTime: 6000,
  maxHeight: 420,
});
