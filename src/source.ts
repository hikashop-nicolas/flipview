// A page source is anything that can report a page count and paint page N into a canvas.
// PDF and image sources both implement it, so the viewer never knows which it has.
export interface PageSource {
  readonly pageCount: number;
  /** Aspect ratio (width / height) of a page, used to size the book. */
  readonly aspect: number;
  /** Paint page `index` (0-based) into `canvas` at roughly `cssWidth` CSS pixels wide. */
  render(index: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>;
  destroy(): void;
}

export interface PdfSourceOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array;
  /** URL of the pdf.js worker. Required, since the host app owns its asset pipeline. */
  workerSrc?: string;
}

/** Loads a PDF through pdf.js. pdfjs-dist is an optional peer dep, so it is imported lazily. */
export async function createPdfSource(opts: PdfSourceOptions): Promise<PageSource> {
  const pdfjs = await import("pdfjs-dist");
  if (opts.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc;

  const doc = await pdfjs.getDocument(
    opts.data ? { data: opts.data } : { url: opts.url! },
  ).promise;

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
