// EPUB. Fixed-layout books are pages that were drawn at a size; reflowable books
// are text that becomes pages only once it knows how big one is. Both start from
// the same paperwork, and this file decides which a book is.
import type { OutlineEntry, PageSource } from "../../source";
import { openArchive, type Archive } from "../archive";
import { prepare, textOf, type PreparedPage } from "./document";
import { pageContents, parse, resolvePath, type EpubPackage } from "./package";
import { createFlowSource } from "../flow/book";

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

  // A book is reflowable unless it says its pages were drawn: the two need
  // different machinery, and which one this is decides everything below.
  if (!book.prePaginated && book.spine.every((item) => !item.prePaginated)) {
    return reflowable(archive, book);
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
      frame.dataset.fvWidth = String(made.width);
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

    /**
     * One spine item is one page here and always will be, so the page number is a
     * real place and the link stays readable. A book that reflows cannot say that,
     * which is why the locator exists at all.
     */
    locate: (index) => String(index + 1),
    async find(locator) {
      const page = Number(locator);

      if (Number.isFinite(page) && page >= 1 && page <= pages.length) return page - 1;

      // A path into the archive is also a locator, which is what the contents use.
      const at = pages.findIndex((item) => item.path === locator);

      return at >= 0 ? at : null;
    },

    destroy() {
      archive.destroy();
      prepared.clear();
    },
  };
}

/**
 * A book that becomes pages only when it knows how big a page is.
 *
 * Everything here answers to `layout`: nothing has a page count, a page, or a
 * position until the viewer has said what size the page is, and all three change
 * when it says something different.
 */
/**
 * The reflowing kind: the spine becomes sections of HTML with their references
 * rewritten, and the flow machinery makes pages of them.
 */
function reflowable(archive: Archive, book: EpubPackage): PageSource {
  return createFlowSource({
    kind: "epub",
    sections: book.spine.map((item) => ({
      id: item.path,
      html: () => wrap(archive, item.path),
    })),
    contents: (startOf) => pageContents(book.contents, startOf),
    close: () => archive.destroy(),
  });
}

/** One section, with its references rewritten, ready to be laid out. */
function wrap(archive: Archive, path: string): string {
  const doc = new DOMParser().parseFromString(archive.text(path), "application/xhtml+xml");

  for (const node of doc.querySelectorAll("[src], [href], [xlink\\:href]")) {
    for (const attribute of ["src", "href", "xlink:href"]) {
      const href = node.getAttribute(attribute);
      if (!href || /^(data:|https?:|blob:|#|mailto:)/i.test(href)) continue;
      if (attribute === "href" && node.tagName.toLowerCase() === "a") continue;

      const target = resolvePath(path, href);

      if (attribute === "href" && node.tagName.toLowerCase() === "link" && archive.has(target)) {
        const style = doc.createElement("style");
        style.textContent = archive.text(target);
        node.replaceWith(style);
        continue;
      }

      const url = archive.url(target);
      if (url) node.setAttribute(attribute, url);
    }
  }

  return new XMLSerializer().serializeToString(doc);
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
