// A comic archive: a zip of pictures, one per page, which is what CBZ is. The
// pages are read out of the archive as blob URLs and shown the way any other
// folder of pictures is.
import { openArchive, type Archive } from "./archive";
import { createImageSource } from "./images";
import type { PageSource } from "../source";

export interface ComicSourceOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array;
}

const PICTURES = ["jpg", "jpeg", "png", "gif", "webp", "avif"];

export async function createComicSource(opts: ComicSourceOptions): Promise<PageSource> {
  const data = opts.data ?? (await fetchComic(opts.url ?? ""));
  const archive = await openArchive(data);
  const pages = pictures(archive);

  if (pages.length === 0) {
    archive.destroy();
    throw new Error("flipview: this archive holds no pictures");
  }

  const source = await createImageSource(pages.map((path) => archive.url(path)));

  return {
    ...source,
    kind: "cbz",
    destroy() {
      source.destroy();
      archive.destroy();
    },
  };
}

/**
 * The pages, in reading order.
 *
 * A comic archive has no manifest: the order is the order of the names, which is
 * why they are numbered. Sorted the way a person reads numbers, so that page 10
 * comes after page 9 rather than after page 1.
 *
 * Exported for its own test: everything else here needs a zip and a browser.
 */
export function comicPages(names: string[]): string[] {
  return names
    .filter((path) => {
      // Zip folder entries, and the sidecar folder a Mac puts in an archive.
      if (path.endsWith("/") || path.includes("__MACOSX/") || (path.split("/").pop() ?? "").startsWith(".")) {
        return false;
      }

      return PICTURES.includes(path.split(".").pop()?.toLowerCase() ?? "");
    })
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

function pictures(archive: Archive): string[] {
  return comicPages(archive.list());
}

async function fetchComic(url: string): Promise<ArrayBuffer> {
  const answer = await fetch(url);

  if (!answer.ok) {
    throw new Error(`flipview: cannot load ${url} (${answer.status})`);
  }

  return answer.arrayBuffer();
}
