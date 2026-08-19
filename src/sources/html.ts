// A folder of HTML pages, one file per page.
//
// The pages are documents the site already serves, so unlike an EPUB there is no
// archive to unpack and no reference to rewrite: an iframe with a src resolves the
// page's own stylesheets, pictures and fonts exactly as a browser always would.
//
// What this buys over a PDF is that the pages are alive: real links, real text, and
// a page a site can edit without regenerating anything.
import type { PageSource } from "../source";

export interface HtmlSourceOptions {
  /** One URL per page, in reading order. */
  urls: string[];
  /**
   * The shape of a page, where the pages do not say. A page may state its own with
   * `<meta name="viewport" content="width=800, height=1130">`, which is also how a
   * fixed-layout EPUB says it.
   */
  width?: number;
  height?: number;
}

const FALLBACK = { width: 800, height: 1131 };

export async function createHtmlSource(opts: HtmlSourceOptions | string[]): Promise<PageSource> {
  const options: HtmlSourceOptions = Array.isArray(opts) ? { urls: opts } : opts;
  const urls = options.urls;

  if (urls.length === 0) throw new Error("flipview: a book of HTML pages needs at least one page");

  const declared = await viewportOf(urls[0]);
  const box = {
    width: options.width ?? declared?.width ?? FALLBACK.width,
    height: options.height ?? declared?.height ?? FALLBACK.height,
  };

  // Fetched once each, for searching. A page is small and the browser has it
  // cached by the time anyone searches.
  const text = new Map<number, string>();

  return {
    kind: "html",
    pageCount: urls.length,
    aspect: box.width / box.height,

    async mount(index, host, cssWidth) {
      const wrap = document.createElement("div");
      wrap.className = "fv-page-mount";

      const frame = document.createElement("iframe");
      frame.className = "fv-page-frame";
      frame.setAttribute("scrolling", "no");
      frame.setAttribute("loading", "lazy");
      frame.title = `Page ${index + 1}`;
      frame.src = urls[index];
      // Drawn at the size the page was written for and scaled as a whole, so a
      // page looks the same on a phone as it does on a desktop.
      frame.style.width = `${box.width}px`;
      frame.style.height = `${box.height}px`;
      frame.style.transform = `scale(${cssWidth / box.width})`;
      frame.style.transformOrigin = "0 0";

      wrap.appendChild(frame);
      host.appendChild(wrap);
    },

    async words(index) {
      const known = text.get(index);
      if (known !== undefined) return known;

      const words = await fetchText(urls[index]);
      text.set(index, words);

      return words;
    },

    locate: (index) => String(index + 1),
    async find(locator) {
      const page = Number(locator);

      return Number.isFinite(page) && page >= 1 && page <= urls.length ? page - 1 : null;
    },

    destroy() {
      text.clear();
    },
  };
}

/** The size a page says it was written for, where it says. */
async function viewportOf(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const doc = await fetchDocument(url);
    const content = doc?.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "";
    const width = Number(/width=([\d.]+)/.exec(content)?.[1]);
    const height = Number(/height=([\d.]+)/.exec(content)?.[1]);

    return width > 0 && height > 0 ? { width, height } : null;
  } catch {
    // A page that cannot be read ahead of time is still a page the iframe can
    // show: this only decides the shape of the book.
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const doc = await fetchDocument(url).catch(() => null);

  return (doc?.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function fetchDocument(url: string): Promise<Document | null> {
  const response = await fetch(url);

  if (!response.ok) return null;

  return new DOMParser().parseFromString(await response.text(), "text/html");
}
