// Reflowable EPUB: a book with no pages until it is told how big a page is.
//
// Each spine item is laid out in a hidden iframe as CSS columns the width of a
// page, which turns its content into as many pages as it needs. A page is then a
// column offset, and the whole book is the sum of them. This is how every EPUB
// reader in a browser does it, because the browser is the only thing that knows
// how the text will break.
import type { Archive } from "./archive";
import { resolvePath } from "./package";

export interface Section {
  path: string;
  /** How many pages this section makes at the current page size. */
  pages: number;
  /** The page index the section starts at. */
  start: number;
}

export interface Pagination {
  sections: Section[];
  total: number;
}

/** Space between the text and the edge of the page, in CSS pixels. */
const MARGIN = 28;

/**
 * The frame a section is laid out in. One per section, kept while the book is
 * open: laying a chapter out again on every page turn is the difference between
 * a book that turns and a book that stutters.
 */
export interface Frames {
  /** Lays every section out for a page this size and reports the pagination. */
  measure(box: { width: number; height: number }): Promise<Pagination>;
  /** Puts the page at `index` into `host`, as its section scrolled to that column. */
  show(index: number, host: HTMLElement, pagination: Pagination): Promise<void>;
  /** The words of one section, for searching. */
  words(path: string): string;
  destroy(): void;
}

export function createFrames(archive: Archive, paths: string[], hidden: HTMLElement): Frames {
  const frames = new Map<string, { frame: HTMLIFrameElement; ready: Promise<Document> }>();
  let box = { width: 600, height: 800 };

  /**
   * A frame, and the promise of the document it will hold.
   *
   * The listener goes on before the content does. A frame that has just been made
   * already has a document, a blank one, and it is complete: anything written into
   * it is written into the document the real one is about to replace, which is a
   * stylesheet that appears to do nothing at all.
   */
  function load(frame: HTMLIFrameElement, path: string): Promise<Document> {
    const ready = new Promise<Document>((resolve) => {
      frame.addEventListener("load", () => resolve(frame.contentDocument as Document), {
        once: true,
      });
    });

    frame.srcdoc = wrap(archive, path);

    return ready;
  }

  function frameFor(path: string): { frame: HTMLIFrameElement; ready: Promise<Document> } {
    const known = frames.get(path);
    if (known) return known;

    const frame = document.createElement("iframe");
    frame.className = "fv-flow-frame";
    frame.setAttribute("scrolling", "no");
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.style.width = `${box.width}px`;
    frame.style.height = `${box.height}px`;
    hidden.appendChild(frame);

    const made = { frame, ready: load(frame, path) };
    frames.set(path, made);

    return made;
  }

  function columns(doc: Document): number {
    const body = doc.body;
    if (!body) return 1;

    // scrollWidth is every column together; one page is one column and the gap
    // that follows it, which is the width of the page.
    const total = Math.max(body.scrollWidth, doc.documentElement.scrollWidth);

    return Math.max(1, Math.ceil((total - MARGIN) / box.width));
  }

  /**
   * Lays a section out as columns the width of a page, and slides them so that the
   * column this page shows is the one in the frame.
   *
   * The sliding is a transform rather than a scroll: an element with hidden
   * overflow can be given a scrollLeft and quietly keep showing the first column,
   * which looks exactly like every page being page one.
   */
  function style(doc: Document, offset = 0): void {
    const inner = box.width - MARGIN * 2;
    let css = doc.querySelector<HTMLStyleElement>("style[data-fv]");

    if (!css) {
      css = doc.createElement("style");
      css.setAttribute("data-fv", "");
      doc.head?.appendChild(css);
    }

    css.textContent = `
      html {
        height: ${box.height}px;
        overflow: hidden;
        -webkit-text-size-adjust: none;
      }
      body {
        margin: 0;
        padding: ${MARGIN}px;
        height: ${box.height}px;
        box-sizing: border-box;
        column-width: ${inner}px;
        column-gap: ${MARGIN * 2}px;
        column-fill: auto;
        overflow: visible;
        transform: translateX(-${offset}px);
      }
      img, svg, video { max-width: 100%; max-height: ${box.height - MARGIN * 2}px; }
      table { max-width: 100%; }
    `;
  }

  return {
    async measure(next) {
      box = next;
      const sections: Section[] = [];
      let start = 0;

      for (const path of paths) {
        const { frame, ready } = frameFor(path);
        frame.style.width = `${box.width}px`;
        frame.style.height = `${box.height}px`;

        const doc = await ready;

        // Laid out again for this page size: the column width is the page width.
        style(doc);

        const pages = columns(doc);
        sections.push({ path, pages, start });
        start += pages;
      }

      return { sections, total: start };
    },

    async show(index, host, pagination) {
      const section =
        [...pagination.sections].reverse().find((s) => index >= s.start) ?? pagination.sections[0];

      if (!section) return;

      // A frame of its own, not the one the measuring used: a spread shows two
      // pages, and two pages of the same chapter cannot share one element. The
      // viewer only keeps a handful of pages, so only a handful exist.
      const frame = document.createElement("iframe");
      frame.className = "fv-flow-frame";
      frame.setAttribute("scrolling", "no");
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.style.width = `${box.width}px`;
      frame.style.height = `${box.height}px`;
      host.appendChild(frame);

      const doc = await load(frame, section.path);

      // The columns are slid past the frame until the one this page is showing.
      style(doc, (index - section.start) * box.width);
    },

    words(path) {
      const doc = frames.get(path)?.frame.contentDocument;

      return (doc?.body?.textContent ?? "").replace(/\s+/g, " ").trim();
    },

    destroy() {
      for (const { frame } of frames.values()) frame.remove();
      frames.clear();
    },
  };
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
