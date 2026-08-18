import type { PageSource } from "./source";

export interface SearchHit {
  /** 0-based page index. */
  page: number;
  /** How many times the query appears on that page. */
  count: number;
}

export interface SearchHandle {
  /** Runs a query and returns the pages it appears on, in order. */
  find(query: string): Promise<SearchHit[]>;
  /** The query the results belong to, empty when nothing has been searched. */
  query(): string;
  destroy(): void;
}

/**
 * Finding words in a document, one page at a time.
 *
 * The pages are read on demand and kept, so the first search of a long document
 * costs one pass and later ones cost nothing. A source that cannot give up its
 * words, a book made of images, simply never finds anything.
 */
export function createSearch(source: PageSource): SearchHandle {
  const words = new Map<number, string>();
  let current = "";

  async function wordsOf(index: number): Promise<string> {
    const had = words.get(index);
    if (had !== undefined) return had;

    const text = source.words ? await source.words(index).catch(() => "") : "";
    words.set(index, text.toLowerCase());

    return words.get(index) ?? "";
  }

  return {
    async find(query) {
      current = query.trim();

      if (current.length < 2 || !source.words) return [];

      const needle = current.toLowerCase();
      const hits: SearchHit[] = [];

      for (let page = 0; page < source.pageCount; page++) {
        const text = await wordsOf(page);
        let count = 0;
        let at = text.indexOf(needle);

        while (at !== -1) {
          count++;
          at = text.indexOf(needle, at + needle.length);
        }

        if (count > 0) hits.push({ page, count });
      }

      return hits;
    },
    query: () => current,
    destroy() {
      words.clear();
      current = "";
    },
  };
}

/**
 * Marks the query inside a rendered page.
 *
 * The text layer is pdf.js's, one span per run of text, so a hit is marked by
 * colouring the span that holds it rather than by splitting it. That is coarser
 * than a per-word highlight and it is honest about where a match is, which is
 * what a reader needs from it.
 */
export function highlight(page: HTMLElement, query: string): void {
  const needle = query.trim().toLowerCase();

  for (const span of page.querySelectorAll<HTMLElement>(".fv-text-layer span")) {
    const hit = needle.length > 1 && (span.textContent ?? "").toLowerCase().includes(needle);
    span.classList.toggle("fv-hit", hit);
  }
}
