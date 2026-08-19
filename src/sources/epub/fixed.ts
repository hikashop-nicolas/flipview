// EPUB. Fixed-layout books are pages that were drawn at a size; reflowable books
// are text that becomes pages only once it knows how big one is. Both start from
// the same paperwork, and this file decides which a book is.
import type { OutlineEntry, PageSource } from "../../source";
import { openArchive, type Archive } from "./archive";
import { prepare, textOf, type PreparedPage } from "./document";
import { pageContents, parse, type EpubPackage } from "./package";
import { createFrames, type Pagination } from "./reflow";

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
function reflowable(archive: Archive, book: EpubPackage): PageSource {
  const paths = book.spine.map((item) => item.path);

  // The frames are laid out off-screen and moved into the page when shown. They
  // are kept: laying a chapter out again on every turn is the difference between
  // a book that turns and a book that stutters.
  const hidden = document.createElement("div");
  hidden.className = "fv-flow-hidden";
  hidden.setAttribute("aria-hidden", "true");
  document.body.appendChild(hidden);

  const frames = createFrames(archive, paths, hidden);
  let pagination: Pagination = { sections: [], total: 0 };

  /** Where a page is, as its section and how far through it. */
  const locate = (index: number): string | null => {
    const section = [...pagination.sections].reverse().find((s) => index >= s.start);

    if (!section) return null;

    const through = section.pages > 1 ? (index - section.start) / section.pages : 0;

    return `${paths.indexOf(section.path)}:${through.toFixed(4)}`;
  };

  return {
    kind: "epub",
    // Nothing until the first layout: a book that reflows has no pages of its own.
    get pageCount() {
      return pagination.total || 1;
    },
    /**
     * A paperback's shape, and it does not change.
     *
     * The page size cannot be taken from the box the viewer offers: the viewer
     * works the box out from the aspect, so a source that answers with the box's
     * own shape asks for a different page every time it is asked, and the book
     * repaginates for ever.
     */
    aspect: 1 / 1.4,

    async layout(box) {
      pagination = await frames.measure(box);

      return pagination.total;
    },

    async mount(index, host) {
      frames.show(index, host, pagination);
    },

    /**
     * A section's words, reported against the page that section starts on.
     *
     * The alternative is every page of a chapter matching every word in it, which
     * turns a search for one line into a search result for forty pages. Sending a
     * reader to where the chapter begins is a smaller lie and a more useful one.
     */
    async words(index) {
      const section = pagination.sections.find((s) => s.start === index);

      return section ? frames.words(section.path) : "";
    },

    async outline(): Promise<OutlineEntry[]> {
      const startOf = new Map(pagination.sections.map((s) => [s.path, s.start]));

      return pageContents(book.contents, (path) => startOf.get(path) ?? null);
    },

    locate,

    /**
     * The page a place is on now. The pagination it was written against is gone,
     * so the section is found again and the fraction is applied to however many
     * pages that section makes today.
     */
    async find(locator) {
      const [item, through] = locator.split(":");
      const at = Number(item);

      if (!Number.isFinite(at) || at < 0 || at >= paths.length) {
        // A plain number is a page from a document that did not reflow.
        const page = Number(locator);

        return Number.isFinite(page) && page >= 1 ? page - 1 : null;
      }

      const section = pagination.sections.find((s) => s.path === paths[at]);

      if (!section) return null;

      const fraction = Math.min(0.999, Math.max(0, Number(through) || 0));

      return section.start + Math.floor(fraction * section.pages);
    },

    destroy() {
      frames.destroy();
      hidden.remove();
      archive.destroy();
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
