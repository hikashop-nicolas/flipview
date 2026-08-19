// A book that reflows, whatever it was before.
//
// Given its sections as HTML, this is the whole of a PageSource: the pagination,
// the page a place is on, the words on a page, and the contents. An EPUB, an FB2
// and a Kindle file differ in how they are read, not in how they are shown, so
// they differ in the file that produces the sections and in nothing here.
import type { OutlineEntry, PageSource } from "../../source";
import { createFrames, type FlowSection, type Pagination } from "./frames";

export interface FlowBook {
  /** What the document was, for whoever is counting. */
  kind: string;
  sections: FlowSection[];
  /**
   * The book's own table of contents, resolved against where each section
   * turned out to start. Called after a layout, never before.
   */
  contents?: (startOf: (id: string) => number | null) => OutlineEntry[];
  /** Whatever the format is holding on to: an archive, blob URLs. */
  close?: () => void;
}

export function createFlowSource(book: FlowBook): PageSource {
  const ids = book.sections.map((section) => section.id);

  // The frames are laid out off-screen and moved into the page when shown. They
  // are kept: laying a chapter out again on every turn is the difference between
  // a book that turns and a book that stutters.
  const hidden = document.createElement("div");
  hidden.className = "fv-flow-hidden";
  hidden.setAttribute("aria-hidden", "true");
  document.body.appendChild(hidden);

  const frames = createFrames(book.sections, hidden);
  let pagination: Pagination = { sections: [], total: 0 };

  /** Where a page is, as its section and how far through it. */
  const locate = (index: number): string | null => {
    const section = [...pagination.sections].reverse().find((s) => index >= s.start);

    if (!section) return null;

    const through = section.pages > 1 ? (index - section.start) / section.pages : 0;

    return `${ids.indexOf(section.id)}:${through.toFixed(4)}`;
  };

  return {
    kind: book.kind,
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

      return section ? frames.words(section.id) : "";
    },

    async outline(): Promise<OutlineEntry[]> {
      if (!book.contents) return [];

      const startOf = new Map(pagination.sections.map((s) => [s.id, s.start]));

      return book.contents((id) => startOf.get(id) ?? null);
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

      if (!Number.isFinite(at) || at < 0 || at >= ids.length) {
        // A plain number is a page from a document that did not reflow.
        const page = Number(locator);

        return Number.isFinite(page) && page >= 1 ? page - 1 : null;
      }

      const section = pagination.sections.find((s) => s.id === ids[at]);

      if (!section) return null;

      const fraction = Math.min(0.999, Math.max(0, Number(through) || 0));

      return section.start + Math.floor(fraction * section.pages);
    },

    destroy() {
      frames.destroy();
      hidden.remove();
      book.close?.();
    },
  };
}
