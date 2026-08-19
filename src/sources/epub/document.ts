// Turning one file out of the archive into something a browser will display.
//
// A page in an EPUB refers to its pictures, its stylesheets and its fonts by
// relative path, and a browser handed the file on its own cannot follow any of
// them: there is no archive to be relative to. So every reference is rewritten to
// a blob URL before the page is shown.
import type { Archive } from "../archive";
import { resolvePath } from "./package";

/** A page that is one picture and nothing else, which most comics and manga are. */
export interface PicturePage {
  kind: "picture";
  url: string;
  width: number;
  height: number;
}

/** Anything else: a document, shown in an iframe of its own. */
export interface DocumentPage {
  kind: "document";
  html: string;
  width: number;
  height: number;
}

export type PreparedPage = PicturePage | DocumentPage;

const XHTML = "application/xhtml+xml";

/** The size a fixed-layout page was drawn for, from its viewport meta. */
function viewport(doc: Document): { width: number; height: number } | null {
  for (const meta of doc.querySelectorAll("meta[name=viewport]")) {
    const content = meta.getAttribute("content") ?? "";
    const width = Number(/width=([\d.]+)/.exec(content)?.[1]);
    const height = Number(/height=([\d.]+)/.exec(content)?.[1]);

    if (width > 0 && height > 0) return { width, height };
  }

  // An SVG page carries its size in the SVG instead.
  const svg = doc.querySelector("svg[viewBox]");
  const box = svg?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);

  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) {
    return { width: box[2], height: box[3] };
  }

  return null;
}

/** url(...) inside a stylesheet points at the archive too. */
function rewriteCss(css: string, base: string, archive: Archive): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _quote, href: string) => {
    if (/^(data:|https?:|blob:|#)/i.test(href)) return whole;

    const url = archive.url(resolvePath(base, href));

    return url ? `url("${url}")` : whole;
  });
}

/**
 * Reads one spine item and prepares it for display.
 *
 * @param fallback The book's page size, for a page that does not state its own.
 */
export function prepare(
  archive: Archive,
  path: string,
  fallback: { width: number; height: number },
): PreparedPage {
  const doc = new DOMParser().parseFromString(archive.text(path), XHTML);
  const box = viewport(doc) ?? fallback;

  // A page whose whole body is one image is that image: shown directly rather than
  // through an iframe, so it can be cloned for the fold, drawn as a thumbnail, and
  // costs nothing to display.
  const images = doc.querySelectorAll("img");
  const text = (doc.body?.textContent ?? "").trim();

  if (images.length === 1 && text === "" && doc.querySelectorAll("svg, video, audio").length === 0) {
    const src = images[0].getAttribute("src");

    if (src && !/^(data:|https?:)/i.test(src)) {
      const url = archive.url(resolvePath(path, src));

      if (url) return { kind: "picture", url, width: box.width, height: box.height };
    }
  }

  for (const node of doc.querySelectorAll("[src], [href], [xlink\\:href]")) {
    for (const attribute of ["src", "href", "xlink:href"]) {
      const href = node.getAttribute(attribute);
      if (!href || /^(data:|https?:|blob:|#|mailto:)/i.test(href)) continue;

      // A link to another page in the book cannot be followed inside an iframe, so
      // it is left alone: the panel and the hash are how a reader moves about.
      const target = resolvePath(path, href);

      if (attribute === "href" && node.tagName.toLowerCase() === "a") continue;

      if (attribute === "href" && node.tagName.toLowerCase() === "link" && archive.has(target)) {
        // Stylesheets are inlined, so that what is inside them can be rewritten too.
        const style = doc.createElement("style");
        style.textContent = rewriteCss(archive.text(target), target, archive);
        node.replaceWith(style);
        continue;
      }

      const url = archive.url(target);
      if (url) node.setAttribute(attribute, url);
    }
  }

  for (const style of doc.querySelectorAll("style")) {
    style.textContent = rewriteCss(style.textContent ?? "", path, archive);
  }

  for (const node of doc.querySelectorAll("[style]")) {
    node.setAttribute("style", rewriteCss(node.getAttribute("style") ?? "", path, archive));
  }

  return {
    kind: "document",
    html: new XMLSerializer().serializeToString(doc),
    width: box.width,
    height: box.height,
  };
}

/** The words on a page, for searching and for a screen reader. */
export function textOf(archive: Archive, path: string): string {
  const doc = new DOMParser().parseFromString(archive.text(path), XHTML);

  return (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();
}
