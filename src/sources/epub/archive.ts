// An EPUB is a zip. This reads one in memory and hands out text, bytes and blob
// URLs for what is inside, because a browser cannot follow a path into an archive.
import type { Unzipped } from "fflate";

export interface Archive {
  /** File contents as text, or "" when the archive has no such file. */
  text(path: string): string;
  has(path: string): boolean;
  /** A blob URL for a file, made once and kept until the book is closed. */
  url(path: string, mediaType?: string): string;
  destroy(): void;
}

const TYPES: Record<string, string> = {
  xhtml: "application/xhtml+xml",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  xml: "application/xml",
};

export function typeOf(path: string): string {
  return TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** fflate is an optional peer dependency, imported only when an EPUB is opened. */
export async function openArchive(data: ArrayBuffer | Uint8Array): Promise<Archive> {
  const fflate = await import("fflate");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  let files: Unzipped;
  try {
    files = fflate.unzipSync(bytes);
  } catch (err) {
    throw new Error(`flipview: this file is not a readable EPUB (${String(err)})`);
  }

  const urls = new Map<string, string>();

  return {
    has: (path) => files[path] !== undefined,
    text(path) {
      const file = files[path];

      return file ? fflate.strFromU8(file) : "";
    },
    url(path, mediaType) {
      const known = urls.get(path);
      if (known) return known;

      const file = files[path];
      if (!file) return "";

      // A copy, because the blob keeps the buffer and fflate's view shares one.
      const made = URL.createObjectURL(new Blob([file.slice()], { type: mediaType ?? typeOf(path) }));
      urls.set(path, made);

      return made;
    },
    destroy() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  };
}
