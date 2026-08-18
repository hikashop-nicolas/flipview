import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import "../src/engine/Style/stPageFlip.css";
import "../src/flipview.css";
import { createFlipview, createPdfSource, createImageSource, openLightbox } from "../src/index";
import type { FlipviewHandle, PageSource } from "../src/index";

// Query parameters drive the demo as well as the checkboxes, so a state can be
// linked to, and so the accessibility scan can ask for one without clicking.
const wanted = new URLSearchParams(location.search);
const asked = (name: string, fallback: boolean): boolean =>
  wanted.has(name) ? wanted.get(name) !== "0" : fallback;

const stage = document.getElementById("stage")!;
const diag = document.getElementById("diag")!;

// The demo reports what the viewer built, so a state can be checked from a
// screenshot in places where reading the DOM is not possible.
window.setInterval(() => {
  const layers = document.querySelectorAll(".fv-text-layer").length;
  const words = document.querySelectorAll(".fv-text-layer span").length;
  diag.textContent = `pages painted ${document.querySelectorAll(".fv-rendered").length}, text layers ${layers}, spans ${words}`;
}, 700);
const status = document.getElementById("status")!;
const cover = document.getElementById("cover") as HTMLInputElement;
cover.checked = asked("cover", true);
const hard = document.getElementById("hard") as HTMLInputElement;
const rtl = document.getElementById("rtl") as HTMLInputElement;
rtl.checked = asked("rtl", false);
const sound = document.getElementById("sound") as HTMLInputElement;
sound.checked = asked("sound", false);
const slow = document.getElementById("slow") as HTMLInputElement;
const hotspots = document.getElementById("hotspots") as HTMLInputElement;
hotspots.checked = asked("hotspots", false);

// Three regions on the sample, one of each kind: a link out, a jump to another
// page, and one the host answers itself the way a shop would.
const SPOTS = [
  { page: 0, x: 0.08, y: 0.1, width: 0.4, height: 0.12, href: "https://example.com/", target: "_blank", label: "Publisher's site" },
  { page: 1, x: 0.55, y: 0.62, width: 0.34, height: 0.2, goToPage: 5, label: "Jump to page 6" },
  { page: 2, x: 0.12, y: 0.3, width: 0.3, height: 0.22, label: "Blue kettle, 24 euros", data: { product: "42" } },
];

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
    mode: wanted.get("mode") === "single" ? "single" : "auto",
    showCover: cover.checked,
    hardCovers: hard.checked,
    rtl: rtl.checked,
    soundUrl: sound.checked ? ["./page-turn-1.mp3", "./page-turn-2.mp3"] : undefined,
    share: true,
    downloadUrl: "./sample.pdf",
    flippingTime: slow.checked ? 3000 : 700,
    hotspots: hotspots.checked ? SPOTS : [],
    onHotspot: (spot) => {
      if (!spot.data?.product) return;
      status.textContent = `hotspot: product ${spot.data.product}`;
      return false;
    },
    onError: (err, i) => (status.textContent = `page ${i + 1}: ${String(err)}`.slice(0, 120)),
    onPageChange: (i) => (status.textContent = `page ${i + 1} / ${source.pageCount}`),
  });
  if (startAt > 0) book.goTo(startAt);
  if (asked("panel", false)) book.togglePanel();
  document.querySelector(".fv-root")?.classList.toggle("fv-hotspots-shown", asked("showspots", false));
  status.textContent = `page ${(book.currentPage() ?? 0) + 1} / ${source.pageCount}`;
  // Test hook: the e2e suite and manual debugging drive the book through this.
  (window as unknown as { flipview: unknown }).flipview = book;
}

// Rebuilding keeps the reader where they were, so options can be compared in place.
for (const box of [cover, hard, rtl, sound, slow, hotspots]) {
  box.addEventListener("change", () => void open(undefined, book?.currentPage() ?? 0));
}

document.getElementById("light")!.addEventListener("click", () => {
  if (!load) return;
  openLightbox(load(), { deepLink: false, rtl: rtl.checked });
});

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

// Sample document so the demo shows something on load. ?doc=outline opens the
// small one that has a table of contents, which is what fills the contents tab.
const doc = wanted.get("doc") === "outline" ? "./outline.pdf" : "./sample.pdf";
void open(() => createPdfSource({ url: doc, workerSrc }));
