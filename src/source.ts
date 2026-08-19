/**
 * What a document has to be able to do to become a book.
 *
 * This is the whole of what the viewer knows about a format. Everything that is
 * particular to PDF, to a folder of images, or to whatever comes next, lives in
 * src/sources and is reached only through here, so adding a format never means
 * touching the viewer.
 */
export interface PageSource {
  /**
   * What kind of document this is: "pdf", "images", and later "epub". Only for a
   * host that wants to report it; the viewer never branches on it, because a
   * viewer that branches on the format is a viewer with the format inside it.
   */
  readonly kind: string;
  readonly pageCount: number;
  /** Aspect ratio (width / height) of a page, used to size the book. */
  readonly aspect: number;
  /**
   * Paint page `index` (0-based) into `canvas` at roughly `cssWidth` CSS pixels
   * wide. For documents whose pages are pictures.
   *
   * A source offers this, or `mount`, or both. Where both exist the viewer shows
   * the mounted page and uses this for thumbnails.
   */
  render?(index: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>;
  /**
   * Put page `index` into `host` as live DOM, sized to `cssWidth`. For documents
   * whose pages are documents: an EPUB page is XHTML, not a picture of one.
   */
  mount?(index: number, host: HTMLElement, cssWidth: number): Promise<void>;
  /**
   * Lay the page's text over `container`, sized to `cssWidth`.
   *
   * A source that has no text simply does not offer this, and a book made of
   * images does not. Where it exists it is what makes a page selectable, findable
   * and readable by a screen reader: a picture of a page is none of those.
   */
  text?(index: number, container: HTMLElement, cssWidth: number): Promise<void>;
  /** The page's words, in reading order, for searching. */
  words?(index: number): Promise<string>;
  /** The document's own table of contents, where it has one. */
  outline?(): Promise<OutlineEntry[]>;
  /**
   * Where page `index` begins, in the document's own terms.
   *
   * A page number is a place only while the pages hold still. As soon as a
   * document can be laid out differently, page 40 on one screen is page 55 on
   * another, and a link to "page 40" is a link to nowhere in particular. A
   * locator is whatever that document uses instead: a page number for a PDF, a
   * position in the text for a book that reflows.
   *
   * The string is the source's own business; nothing else reads into it.
   */
  locate?(index: number): string | null;
  /** Which page a locator is on now, or null when it cannot be found. */
  find?(locator: string): Promise<number | null>;
  destroy(): void;
}

/** One line of a document's table of contents. */
export interface OutlineEntry {
  title: string;
  /** 0-based page index, or null when the destination cannot be resolved. */
  page: number | null;
  children: OutlineEntry[];
}
