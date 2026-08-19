// A page source is anything that can report a page count and paint page N into a canvas.
// PDF and image sources both implement it, so the viewer never knows which it has.
export interface PageSource {
  readonly pageCount: number;
  /** Aspect ratio (width / height) of a page, used to size the book. */
  readonly aspect: number;
  /** Paint page `index` (0-based) into `canvas` at roughly `cssWidth` CSS pixels wide. */
  render(index: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>;
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
  destroy(): void;
}

/** One line of a document's table of contents. */
export interface OutlineEntry {
  title: string;
  /** 0-based page index, or null when the destination cannot be resolved. */
  page: number | null;
  children: OutlineEntry[];
}

export interface PdfSourceOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array;
  /** URL of the pdf.js worker. Required, since the host app owns its asset pipeline. */
  workerSrc?: string;
  /**
   * Folder holding pdf.js's wasm decoders, from `pdfjs-dist/wasm/`.
   *
   * Scanned documents are usually JPEG 2000 or JBIG2, and pdf.js decodes both in
   * wasm that it fetches at render time. Without this a scan renders as blank
   * white pages, with nothing logged: the pages are there, the pictures are not.
   */
  wasmUrl?: string;
  /** Folder holding pdf.js's character maps, for documents with CJK text. */
  cMapUrl?: string;
}

/** Loads a PDF through pdf.js. pdfjs-dist is an optional peer dep, so it is imported lazily. */
export async function createPdfSource(opts: PdfSourceOptions): Promise<PageSource> {
  const pdfjs = await import("pdfjs-dist");
  if (opts.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc;

  // pdf.js insists these end in a slash and throws "Invalid factory url" if they
  // do not, which kills the whole document rather than one picture in it. A host
  // naming a folder should not have to know that.
  const folder = (url: string | undefined): string | undefined =>
    url === undefined ? undefined : url.endsWith("/") ? url : `${url}/`;

  const wasmUrl = folder(opts.wasmUrl);
  const cMapUrl = folder(opts.cMapUrl);

  const doc = await pdfjs.getDocument({
    ...(opts.data ? { data: opts.data } : { url: opts.url! }),
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(cMapUrl ? { cMapUrl, cMapPacked: true } : {}),
  }).promise;

  const first = await doc.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  const aspect = vp.width / vp.height;

  return {
    pageCount: doc.numPages,
    aspect,
    async render(index, canvas, cssWidth) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = (cssWidth / base.width) * dpr;
      const viewport = page.getViewport({ scale });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      // Pass the context as well as the canvas. Given only `canvas`, pdf.js takes
      // ownership of it (control goes offscreen) and the element can no longer be
      // read back: toBlob simply never calls back.
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("flipview: 2d context unavailable");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      page.cleanup();
    },
    async text(index, container, cssWidth) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });

      // The page's own width in points is recorded on the element so the scale can
      // be recomputed later: the picture is stretched to whatever size the page is
      // shown at, and the text has to be stretched by exactly the same amount.
      container.dataset.baseWidth = String(base.width);
      container.style.setProperty('--scale-factor', String(cssWidth / base.width));

      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport: page.getViewport({ scale: cssWidth / base.width }),
      });

      await layer.render();
    },

    async outline() {
      const raw = await doc.getOutline().catch(() => null);

      if (!raw) return [];

      // A destination is a reference into the document, not a page number, so each
      // one has to be resolved. An entry whose destination cannot be resolved is
      // kept as a heading rather than dropped: the reader still sees the shape of
      // the document.
      const resolve = async (dest: unknown): Promise<number | null> => {
        try {
          const target = typeof dest === "string" ? await doc.getDestination(dest) : dest;
          const ref = Array.isArray(target) ? target[0] : null;
          if (ref === null || typeof ref !== "object") return null;

          return await doc.getPageIndex(ref as never);
        } catch {
          return null;
        }
      };

      const walk = async (items: typeof raw): Promise<OutlineEntry[]> => {
        const out: OutlineEntry[] = [];

        for (const item of items) {
          out.push({
            title: item.title,
            page: await resolve(item.dest),
            children: item.items?.length ? await walk(item.items) : [],
          });
        }

        return out;
      };

      return walk(raw);
    },

    async words(index) {
      const page = await doc.getPage(index + 1);
      const content = await page.getTextContent();

      return content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    },

    destroy() {
      void doc.destroy();
    },
  };
}

/** Plain list of image URLs, one per page. */
export async function createImageSource(urls: string[]): Promise<PageSource> {
  const probe = await loadImage(urls[0]);
  const aspect = probe.naturalWidth / probe.naturalHeight;
  return {
    pageCount: urls.length,
    aspect,
    async render(index, canvas) {
      const img = await loadImage(urls[index]);
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.getContext("2d")?.drawImage(img, 0, 0);
    },
    destroy() {},
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`flipview: cannot load ${src}`));
    img.src = src;
  });
}
