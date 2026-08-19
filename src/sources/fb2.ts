// FictionBook 2: one XML file holding the whole book, pictures included as
// base64. It has no pages of its own, so it is turned into sections of HTML and
// laid out by the flow machinery, the same way a reflowable EPUB is.
import type { OutlineEntry, PageSource } from "../source";
import { openArchive } from "./archive";
import { createFlowSource } from "./flow/book";
import type { FlowSection } from "./flow/frames";

export interface Fb2SourceOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array;
}

const XLINK = "http://www.w3.org/1999/xlink";

/** Where a picture is, once it has been turned into something a page can show. */
type Pictures = Map<string, string>;

export async function createFb2Source(opts: Fb2SourceOptions): Promise<PageSource> {
  const bytes = await open(opts);
  const { xml, close } = await unpack(bytes);
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  if (doc.querySelector("parsererror") || !doc.querySelector("FictionBook")) {
    close();
    throw new Error("flipview: this file is not a readable FB2");
  }

  const pictures = decodePictures(doc);
  const parts = bodies(doc);
  const sections: FlowSection[] = [];
  const titles: Array<{ id: string; label: string }> = [];

  const cover = titlePage(doc, pictures);

  if (cover) {
    sections.push({ id: "fb2-title", html: () => page(cover) });
  }

  parts.forEach((part, at) => {
    const id = `fb2-${at}`;
    const label = textOf(part.querySelector(":scope > title")) || `${at + 1}`;

    titles.push({ id, label });
    sections.push({ id, html: () => page(convert(part, pictures, 1)) });
  });

  return createFlowSource({
    kind: "fb2",
    sections,
    contents: (startOf) =>
      titles
        .map(({ id, label }): OutlineEntry | null => {
          const page = startOf(id);

          return label === "" ? null : { title: label, page, children: [] };
        })
        .filter((entry): entry is OutlineEntry => entry !== null),
    close() {
      for (const url of pictures.values()) URL.revokeObjectURL(url);
      pictures.clear();
      close();
    },
  });
}

/**
 * The pieces of the book, in reading order.
 *
 * A body holds sections, and a section can hold sections; only the top level is
 * split, because a section is a chapter and a chapter is the right size to lay
 * out in one go. A book whose body has no sections at all is one piece.
 */
function bodies(doc: Document): Element[] {
  const out: Element[] = [];

  for (const body of doc.querySelectorAll("FictionBook > body")) {
    const sections = [...body.children].filter((child) => child.localName === "section");

    out.push(...(sections.length > 0 ? sections : [body]));
  }

  return out;
}

/** The book's own first page: its cover, its title and who wrote it. */
function titlePage(doc: Document, pictures: Pictures): string | null {
  const info = doc.querySelector("description > title-info");

  if (!info) return null;

  const title = textOf(info.querySelector("book-title"));
  const authors = [...info.querySelectorAll("author")]
    .map((author) =>
      ["first-name", "middle-name", "last-name", "nickname"]
        .map((part) => textOf(author.querySelector(part)))
        .filter((part) => part !== "")
        .join(" ")
    )
    .filter((name) => name !== "");

  const url = pictures.get(reference(info.querySelector("coverpage > image")) ?? "");
  const parts = [
    url ? `<div class="fv-fb2-cover"><img src="${url}" alt=""></div>` : "",
    title ? `<h1>${escape(title)}</h1>` : "",
    authors.length > 0 ? `<p class="fv-fb2-author">${escape(authors.join(", "))}</p>` : "",
  ].filter((part) => part !== "");

  return parts.length > 0 ? parts.join("\n") : null;
}

/** Every <binary> in the book, as a blob URL a page can point at. */
function decodePictures(doc: Document): Pictures {
  const out: Pictures = new Map();

  for (const binary of doc.querySelectorAll("binary")) {
    const id = binary.getAttribute("id");

    if (!id) continue;

    try {
      const raw = atob((binary.textContent ?? "").replace(/\s+/g, ""));
      const bytes = new Uint8Array(raw.length);

      for (let at = 0; at < raw.length; at++) bytes[at] = raw.charCodeAt(at);

      const type = binary.getAttribute("content-type") || "image/jpeg";
      out.set(id, URL.createObjectURL(new Blob([bytes], { type })));
    } catch {
      // A picture that will not decode is a picture the book does without.
    }
  }

  return out;
}

/**
 * FB2 to HTML, element by element.
 *
 * FB2 is a small vocabulary and every part of it has an obvious HTML answer, so
 * this is a table rather than a transformation: the point is that the browser
 * ends up with something it can lay out, style and read aloud.
 */
export function convert(node: Element, pictures: Pictures, depth: number): string {
  const inside = (): string =>
    [...node.childNodes]
      .map((child) => {
        if (child.nodeType === 3) return escape(child.nodeValue ?? "");

        return child.nodeType === 1 ? convert(child as Element, pictures, depth + 1) : "";
      })
      .join("");

  switch (node.localName) {
    case "section":
      return `<section>${inside()}</section>`;
    case "title": {
      // A chapter's title is an h2: h1 is the book, and a section inside a
      // section is one level further down.
      const level = Math.max(2, Math.min(6, depth));

      return `<h${level}>${inside()}</h${level}>`;
    }
    case "subtitle":
      return `<h6 class="fv-fb2-subtitle">${inside()}</h6>`;
    case "p":
      return `<p>${inside()}</p>`;
    case "empty-line":
      return "<p class=\"fv-fb2-space\">&#160;</p>";
    case "emphasis":
      return `<em>${inside()}</em>`;
    case "strong":
      return `<strong>${inside()}</strong>`;
    case "strikethrough":
      return `<s>${inside()}</s>`;
    case "sub":
      return `<sub>${inside()}</sub>`;
    case "sup":
      return `<sup>${inside()}</sup>`;
    case "code":
      return `<code>${inside()}</code>`;
    case "style":
      return `<span>${inside()}</span>`;
    case "epigraph":
    case "cite":
    case "annotation":
      return `<blockquote>${inside()}</blockquote>`;
    case "text-author":
      return `<p class="fv-fb2-author">${inside()}</p>`;
    case "poem":
      return `<div class="fv-fb2-poem">${inside()}</div>`;
    case "stanza":
      return `<div class="fv-fb2-stanza">${inside()}</div>`;
    case "v":
      return `<p class="fv-fb2-verse">${inside()}</p>`;
    case "table":
      return `<table>${inside()}</table>`;
    case "tr":
      return `<tr>${inside()}</tr>`;
    case "td":
      return `<td>${inside()}</td>`;
    case "th":
      return `<th>${inside()}</th>`;
    case "a": {
      const href = reference(node);

      return `<a href="#${escape(href ?? "")}">${inside()}</a>`;
    }
    case "image": {
      const url = pictures.get(reference(node) ?? "");
      const alt = escape(node.getAttribute("alt") ?? "");

      return url ? `<img src="${url}" alt="${alt}">` : "";
    }
    // A body, a binary, or anything a newer FB2 invents: its children still are
    // the book, so they are kept and the element itself is not.
    case "binary":
      return "";
    default:
      return inside();
  }
}

/** The id an <image> or an <a> points at, without the # that names it. */
function reference(node: Element | null): string | null {
  if (!node) return null;

  const href =
    node.getAttributeNS(XLINK, "href") ?? node.getAttribute("l:href") ?? node.getAttribute("href");

  return href === null ? null : href.replace(/^#/, "");
}

/** One section, as a document the flow machinery can lay out. */
function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 16px/1.5 Georgia, "Times New Roman", serif; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
    p { margin: 0 0 0.6em; text-indent: 1.2em; }
    p:first-of-type, .fv-fb2-space + p, h1 + p, h2 + p, h3 + p { text-indent: 0; }
    .fv-fb2-author { font-style: italic; text-align: right; text-indent: 0; }
    .fv-fb2-verse { text-indent: 0; margin: 0; }
    .fv-fb2-stanza { margin: 0 0 1em; }
    .fv-fb2-subtitle { text-align: center; }
    .fv-fb2-cover { text-align: center; }
    .fv-fb2-cover img { max-width: 100%; }
    blockquote { margin: 0 0 1em 1.5em; font-style: italic; }
    img { max-width: 100%; }
  </style></head><body>${body}</body></html>`;
}

function textOf(node: Element | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function open(opts: Fb2SourceOptions): Promise<Uint8Array> {
  if (opts.data) {
    return opts.data instanceof Uint8Array ? opts.data : new Uint8Array(opts.data);
  }

  const answer = await fetch(opts.url ?? "");

  if (!answer.ok) {
    throw new Error(`flipview: cannot load ${opts.url} (${answer.status})`);
  }

  return new Uint8Array(await answer.arrayBuffer());
}

/**
 * The XML itself. An FB2 is often shipped zipped, as .fb2.zip or .fbz, because
 * the format is verbose and compresses to nothing.
 */
async function unpack(bytes: Uint8Array): Promise<{ xml: string; close: () => void }> {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { xml: new TextDecoder().decode(bytes), close: () => {} };
  }

  const archive = await openArchive(bytes);
  const inside = archive.list().find((path) => path.toLowerCase().endsWith(".fb2"));

  if (!inside) {
    archive.destroy();
    throw new Error("flipview: this archive holds no FB2");
  }

  return { xml: archive.text(inside), close: () => archive.destroy() };
}
