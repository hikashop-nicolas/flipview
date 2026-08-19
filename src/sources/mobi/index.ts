// Kindle books: MOBI, and the AZW3 that replaced it.
//
// Both are a Palm database holding packed text and a run of pictures. The older
// one is a single HTML document broken up by page breaks; an AZW3 is a set of
// XHTML documents laid end to end, which is an EPUB in a different wrapper. Both
// become sections of HTML, and the flow machinery makes pages of them.
//
// Books with DRM are refused: the encryption is the point of it, and reading
// around it is not something this library does.
import type { OutlineEntry, PageSource } from "../../source";
import { createFlowSource } from "../flow/book";
import type { FlowSection } from "../flow/frames";
import { readHeader, readText, type MobiHeader } from "./headers";
import { readPalm } from "./palm";
import { unpack } from "./decompress";

export interface MobiSourceOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array;
}

const PICTURES = [
  { magic: [0xff, 0xd8, 0xff], type: "image/jpeg" },
  { magic: [0x89, 0x50, 0x4e, 0x47], type: "image/png" },
  { magic: [0x47, 0x49, 0x46], type: "image/gif" },
  { magic: [0x42, 0x4d], type: "image/bmp" },
];

export async function createMobiSource(opts: MobiSourceOptions): Promise<PageSource> {
  const palm = readPalm(await open(opts));
  const first = readHeader(palm);

  if (first.encrypted) {
    throw new Error("flipview: this Kindle book is protected, so it cannot be opened");
  }

  // A file can hold the old book and the new one, one after the other. The new
  // one is the better book, so it is the one that is read.
  const start = first.kf8Boundary ?? 0;
  const header = start === 0 ? first : readHeader(palm, start);

  if (header.encrypted) {
    throw new Error("flipview: this Kindle book is protected, so it cannot be opened");
  }

  const text = decode(readText(palm, header, start, unpack));
  const pictures = readPictures(palm, start + header.firstResource);
  const sections = header.version >= 8 ? kf8Sections(text) : mobiSections(text);

  const titles = sections.map((html, at) => ({
    id: `mobi-${at}`,
    label: headingOf(html) || `${at + 1}`,
  }));

  const flow: FlowSection[] = sections.map((html, at) => ({
    id: `mobi-${at}`,
    html: () => page(html, pictures),
  }));

  return createFlowSource({
    kind: header.version >= 8 ? "azw3" : "mobi",
    sections: flow.length > 0 ? flow : [{ id: "mobi-0", html: () => page("", pictures) }],
    contents: (startOf) =>
      titles
        .map(({ id, label }): OutlineEntry | null =>
          label === "" ? null : { title: label, page: startOf(id), children: [] }
        )
        .filter((entry): entry is OutlineEntry => entry !== null),
    close() {
      for (const url of pictures.values()) URL.revokeObjectURL(url);
      pictures.clear();
    },
  });
}

/**
 * The old MOBI: one HTML document, with page breaks where the book wants them.
 *
 * Splitting on those breaks is what makes chapters, which is what a section is.
 * A book with none of them is one long section, which still reads.
 */
export function mobiSections(text: string): string[] {
  const body = text.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");

  return body
    .split(/<mbp:pagebreak[^>]*>|<div[^>]*class="?mbp_pagebreak"?[^>]*>/i)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * An AZW3: the XHTML documents of what was an EPUB, laid end to end.
 *
 * A document is a shell with an empty body followed by the pieces that belong in
 * it, which the format keeps a table for so it can put them back exactly. That
 * table is not read: everything between one shell and the next belongs to that
 * shell, in the order it is already in, so dropping the shell's own wrapping
 * leaves the chapter. What is lost is where the pieces sat inside the body,
 * which for a book of prose is nothing.
 */
export function kf8Sections(text: string): string[] {
  const parts = text.split(/(?=<html[\s>])/i);

  return parts
    .map((part) =>
      part
        .replace(/<\?xml[^>]*\?>/gi, "")
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<head[\s>][\s\S]*?<\/head>/gi, "")
        .replace(/<\/?(html|body)[^>]*>/gi, "")
        .trim()
    )
    .filter((part) => part !== "" && stripped(part) !== "");
}

/** Every picture in the book, as a blob URL, by the number the text calls it. */
function readPictures(palm: ReturnType<typeof readPalm>, from: number): Map<number, string> {
  const out = new Map<number, string>();

  for (let at = from; at < palm.count; at++) {
    const record = palm.record(at);
    const type = pictureType(record);

    if (!type) continue;

    // The text counts pictures from one, in the order they appear here.
    out.set(at - from + 1, URL.createObjectURL(new Blob([record.slice()], { type })));
  }

  return out;
}

function pictureType(record: Uint8Array): string | null {
  for (const { magic, type } of PICTURES) {
    if (magic.every((byte, at) => record[at] === byte)) return type;
  }

  return null;
}

/**
 * One section, with what it points at made real.
 *
 * The old MOBI names a picture by its number, and an AZW3 by a scheme of its
 * own; both mean the same run of records.
 */
function page(html: string, pictures: Map<number, string>): string {
  const body = html
    .replace(/<img([^>]*?)\srecindex=["']?(\d+)["']?/gi, (whole, rest, index) => {
      const url = pictures.get(Number(index));

      return url ? `<img${rest} src="${url}"` : whole;
    })
    .replace(/(src|href)=["']kindle:embed:([0-9A-Va-v]+)[^"']*["']/gi, (whole, attribute, id) => {
      const url = pictures.get(base32(id));

      return url ? `${attribute}="${url}"` : whole;
    })
    // A second source for a sharper screen, naming a file that is not in the
    // book: a browser prefers it to the src, and gets nothing.
    .replace(/\ssrcset=["'][^"']*["']/gi, "")
    // Whatever these were for, a browser does not know them and would show them.
    .replace(/<\/?(mbp|idx|aid):[^>]*>/gi, "");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 16px/1.5 Georgia, "Times New Roman", serif; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; }
    p { margin: 0 0 0.6em; }
    img { max-width: 100%; }
    blockquote { margin: 0 0 1em 1.5em; }
  </style></head><body>${body}</body></html>`;
}

/** Kindle counts its resources in base 32, using the digits and then the letters. */
function base32(value: string): number {
  return [...value.toUpperCase()].reduce((total, letter) => {
    const digit = "0123456789ABCDEFGHIJKLMNOPQRSTUV".indexOf(letter);

    return digit < 0 ? total : total * 32 + digit;
  }, 0);
}

function headingOf(html: string): string {
  const heading = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);

  return heading ? stripped(heading[1]).slice(0, 120) : "";
}

function stripped(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The text, as text.
 *
 * A Kindle book says which encoding it used, and says it in a field that is
 * wrong often enough that it is not worth reading: UTF-8 decodes anything valid,
 * and Windows-1252 is what the rest of them are.
 */
function decode(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

async function open(opts: MobiSourceOptions): Promise<Uint8Array> {
  if (opts.data) {
    return opts.data instanceof Uint8Array ? opts.data : new Uint8Array(opts.data);
  }

  const answer = await fetch(opts.url ?? "");

  if (!answer.ok) {
    throw new Error(`flipview: cannot load ${opts.url} (${answer.status})`);
  }

  return new Uint8Array(await answer.arrayBuffer());
}

export type { MobiHeader };
