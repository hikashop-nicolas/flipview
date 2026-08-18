# flipview

A standalone, framework-agnostic, client-side **page-flip book viewer**. It turns a
**PDF** or a **list of images** into a book with real turning pages, in the browser.
No server, no upload, no account.

**Status: early.** The rendering pipeline, lazy page loading and the single/double
page layout work. The toolbar, zoom, search, outline and accessibility passes are
not written yet.

```ts
import { createFlipview, createPdfSource } from "flipview";
import "flipview/flipview.css";

const source = await createPdfSource({ url: "/catalogue.pdf", workerSrc });
const book = createFlipview(containerEl, source, {
  mode: "auto",              // one page on narrow screens, a spread on wide ones
  onPageChange: (i) => console.log("page", i + 1),
});

book.next();
book.goTo(6);
book.destroy();
```

## How it works

- **pdf.js** renders each page to a canvas, on demand. Only a small window of pages
  around the current one is ever painted, and a small LRU drops the rest, so a
  300-page PDF costs about the same memory as a 10-page one.
- **StPageFlip** (MIT) drives the fold geometry and the drag interaction.
- Pages are plain DOM elements, so anything can be laid over a page later: links,
  hotspots, a text layer for selection and search.

`pdfjs-dist` is an **optional peer dependency**. Install it only if you load PDFs,
and pass `workerSrc` so the host app keeps control of its own asset pipeline. Image
sources need nothing.

## Options

| Option | Default | Meaning |
|---|---|---|
| `mode` | `"auto"` | `"single"`, `"double"`, or `"auto"` to switch on width |
| `breakpoint` | `700` | container width in px below which `auto` shows one page |
| `flippingTime` | `700` | flip animation duration in ms |
| `cacheSize` | `8` | how many rendered page canvases to keep |
| `showCover` | `true` | treat the first and last page as rigid covers |

## Development

```sh
npm install
npm run dev          # demo on localhost:5173
npm run build        # library to dist/
npm run build:demo   # demo to demo-dist/ for GitHub Pages
sh build/make-sample.sh   # regenerate the demo's sample PDF
```

MIT.
