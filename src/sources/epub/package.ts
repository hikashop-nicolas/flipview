// Reading an EPUB's own description of itself: the container, the package
// document, the spine, and the table of contents.
//
// No rendering happens here and no DOM is built: this is the paperwork, and both
// the fixed-layout and the reflowable sources start from it.
import type { OutlineEntry } from "../../source";

export interface SpineItem {
  /** Path inside the archive, already resolved against the package document. */
  path: string;
  mediaType: string;
  /** A pre-paginated item is one page; a reflowable one is as many as it needs. */
  prePaginated: boolean;
}

export interface EpubPackage {
  title: string;
  language: string;
  /** The whole book is pre-paginated unless an item says otherwise. */
  prePaginated: boolean;
  /** Right to left, from the spine's page progression. */
  rtl: boolean;
  spine: SpineItem[];
  /** Table of contents, with hrefs rather than page numbers: pages come later. */
  contents: RawOutline[];
}

/** A contents entry before anything knows which page it lands on. */
export interface RawOutline {
  title: string;
  /** Path inside the archive, without a fragment, or null when it has none. */
  path: string | null;
  children: RawOutline[];
}

const XML = "application/xml";

/** Resolves `href` against the folder holding `base`, both archive paths. */
export function resolvePath(base: string, href: string): string {
  const parts = base.split("/").slice(0, -1);

  for (const part of decodeURIComponent(href.split("#")[0]).split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }

  return parts.join("/");
}

export function parse(read: (path: string) => string, container: string): EpubPackage {
  const doc = new DOMParser().parseFromString(container, XML);
  const rootfile = doc.querySelector("rootfile")?.getAttribute("full-path");

  if (!rootfile) throw new Error("flipview: this EPUB names no package document");

  const opf = new DOMParser().parseFromString(read(rootfile), XML);
  const layout = meta(opf, "rendition:layout");

  const manifest = new Map<string, { path: string; mediaType: string; properties: string }>();

  for (const item of opf.querySelectorAll("manifest > item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;

    manifest.set(id, {
      path: resolvePath(rootfile, href),
      mediaType: item.getAttribute("media-type") ?? "",
      properties: item.getAttribute("properties") ?? "",
    });
  }

  const prePaginated = layout === "pre-paginated";
  const spine: SpineItem[] = [];

  for (const ref of opf.querySelectorAll("spine > itemref")) {
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    // linear="no" is material a reader may skip: notes, adverts. It is still in
    // the book, and a flipbook shows the book.
    if (!item) continue;

    const properties = ref.getAttribute("properties") ?? "";

    spine.push({
      path: item.path,
      mediaType: item.mediaType,
      prePaginated: properties.includes("rendition:layout-pre-paginated")
        ? true
        : properties.includes("rendition:layout-reflowable")
          ? false
          : prePaginated,
    });
  }

  if (spine.length === 0) throw new Error("flipview: this EPUB has no pages");

  return {
    title: opf.querySelector("metadata > title")?.textContent?.trim() ?? "",
    language: opf.querySelector("metadata > language")?.textContent?.trim() ?? "",
    prePaginated,
    rtl: opf.querySelector("spine")?.getAttribute("page-progression-direction") === "rtl",
    spine,
    contents: contents(read, opf, manifest),
  };
}

function meta(opf: Document, property: string): string {
  for (const node of opf.querySelectorAll("metadata > meta")) {
    if (node.getAttribute("property") === property) return node.textContent?.trim() ?? "";
  }

  return "";
}

/** EPUB 3 keeps its contents in a nav document; EPUB 2 in an NCX. Both are read. */
function contents(
  read: (path: string) => string,
  opf: Document,
  manifest: Map<string, { path: string; mediaType: string; properties: string }>,
): RawOutline[] {
  for (const item of manifest.values()) {
    if (!item.properties.split(/\s+/).includes("nav")) continue;

    try {
      const nav = new DOMParser().parseFromString(read(item.path), "application/xhtml+xml");
      const list = [...nav.querySelectorAll("nav")].find(
        (n) => n.getAttributeNS("http://www.idpf.org/2007/ops", "type") === "toc",
      );

      if (list) return fromNav(list, item.path);
    } catch {
      // A nav document that will not parse is not worth losing the book over.
    }
  }

  const ncxId = opf.querySelector("spine")?.getAttribute("toc");
  const ncx = ncxId ? manifest.get(ncxId) : undefined;

  if (ncx) {
    try {
      return fromNcx(new DOMParser().parseFromString(read(ncx.path), XML), ncx.path);
    } catch {
      /* same */
    }
  }

  return [];
}

function fromNav(root: Element, base: string): RawOutline[] {
  const list = root.querySelector("ol");

  const walk = (ol: Element | null): RawOutline[] => {
    if (!ol) return [];
    const out: RawOutline[] = [];

    for (const li of [...ol.children].filter((c) => c.tagName.toLowerCase() === "li")) {
      const link = li.querySelector(":scope > a, :scope > span");
      const href = link?.getAttribute("href");

      out.push({
        title: link?.textContent?.trim() ?? "",
        path: href ? resolvePath(base, href) : null,
        children: walk(li.querySelector(":scope > ol")),
      });
    }

    return out;
  };

  return walk(list);
}

function fromNcx(ncx: Document, base: string): RawOutline[] {
  const walk = (parent: Element): RawOutline[] => {
    const out: RawOutline[] = [];

    for (const point of [...parent.children].filter((c) => c.tagName === "navPoint")) {
      const href = point.querySelector("content")?.getAttribute("src");

      out.push({
        title: point.querySelector("navLabel > text")?.textContent?.trim() ?? "",
        path: href ? resolvePath(base, href) : null,
        children: walk(point),
      });
    }

    return out;
  };

  const map = ncx.querySelector("navMap");

  return map ? walk(map) : [];
}

/** Turns contents with paths into contents with page numbers. */
export function pageContents(raw: RawOutline[], pageOf: (path: string) => number | null): OutlineEntry[] {
  return raw.map((entry) => ({
    title: entry.title,
    page: entry.path === null ? null : pageOf(entry.path),
    children: pageContents(entry.children, pageOf),
  }));
}
