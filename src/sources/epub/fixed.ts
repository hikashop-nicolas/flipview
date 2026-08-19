// Fixed-layout EPUB: a book whose pages were drawn at a size and are meant to be
// seen that way. Comics, children's books, manga, anything designed rather than
// flowed.
//
// One spine item is one page, which is what makes this the tractable half of EPUB:
// the page count is known before anything is laid out, so it fits the viewer's
// model exactly as a PDF does.
import type { OutlineEntry, PageSource } from "../../source";
import { openArchive, type Archive } from "./archive";
import { prepare, textOf, type PreparedPage } from "./document";
import { pageContents, parse, type EpubPackage } from "./package";

export interface EpubSourceOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array;
}

/** What a page is when the book never says: a paperback shape. */
const FALLBACK = { width: 1000, height: 1400 };

export async function createEpubSource(opts: EpubSourceOptions): Promise<PageSource> {
  const data = opts.data ?? (await fetchBook(opts.url!));
  const archive = await openArchive(data);

  const container = archive.text("META-INF/container.xml");
  if (!container) throw new Error("flipview: this EPUB has no container");

  const book: EpubPackage = parse((path) => archive.text(path), container);

  if (!book.prePaginated && book.spine.every((item) => !item.prePaginated)) {
    // Reflowable EPUB is a different shape of problem: its page count depends on
    // the size of the page, so it needs the layout step the viewer does not have
    // yet. Saying so beats showing one screenful per chapter.
    throw new Error("flipview: this EPUB reflows, and only fixed-layout EPUB is supported so far");
  }

  const pages = book.spine;
  const prepared = new Map<number, PreparedPage>();

  const page = (index: number): PreparedPage => {
    const known = prepared.get(index);
    if (known) return known;

    const made = prepare(archive, pages[index].path, FALLBACK);
    prepared.set(index, made);

    return made;
  };

  const first = page(0);

  return {
    kind: "epub",
    pageCount: pages.length,
    aspect: first.width / first.height,

    async mount(index, host, cssWidth) {
      const made = page(index);
      const box = document.createElement("div");
      box.className = "fv-page-mount";

      if (made.kind === "picture") {
        // The page is one picture, so it is shown as one: it clones for the fold,
        // it costs no iframe, and it is what the book actually is.
        const img = new Image();
        img.src = made.url;
        img.alt = "";
        img.decoding = "async";
        box.appendChild(img);
        host.appendChild(box);

        return;
      }

      // Anything else is a document, and a document belongs in its own frame:
      // its stylesheets are its own and must not reach the page around it.
      const frame = document.createElement("iframe");
      frame.className = "fv-page-frame";
      frame.setAttribute("scrolling", "no");
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("aria-hidden", "false");
      frame.style.width = `${made.width}px`;
      frame.style.height = `${made.height}px`;
      // The frame is drawn at the size the page was designed for and scaled down
      // as a whole, which is what "fixed layout" means.
      frame.style.transform = `scale(${cssWidth / made.width})`;
      frame.style.transformOrigin = "0 0";
      frame.srcdoc = made.html;

      box.appendChild(frame);
      host.appendChild(box);
    },

    async render(index, canvas, cssWidth) {
      const made = page(index);

      // Only a page that is one picture can be drawn without a browser laying it
      // out. The panel copes with the rest by showing the page number.
      if (made.kind !== "picture") {
        throw new Error("flipview: this page has no picture of its own");
      }

      const img = await load(made.url);
      const scale = Math.min(2, Math.max(1, (cssWidth || img.naturalWidth) / img.naturalWidth));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    },

    async words(index) {
      return textOf(archive, pages[index].path);
    },

    async outline(): Promise<OutlineEntry[]> {
      const byPath = new Map(pages.map((item, index) => [item.path, index]));

      return pageContents(book.contents, (path) => byPath.get(path) ?? null);
    },

    destroy() {
      archive.destroy();
      prepared.clear();
    },
  };
}

async function fetchBook(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`flipview: cannot read ${url} (${response.status})`);

  return response.arrayBuffer();
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("flipview: a page picture would not load"));
    img.src = src;
  });
}

/** Kept for the type checker's sake: an archive is what a book is read from. */
export type { Archive };
