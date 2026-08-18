# flipview

**[▶ Live demo](https://hikashop-nicolas.github.io/flipview/)** — open a PDF and turn its pages.

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

Or over the page, in its own overlay:

```ts
import { openLightbox } from "flipview";

const light = openLightbox(createPdfSource({ url: "/catalogue.pdf", workerSrc }));
// light.book resolves once the document has loaded; light.close() dismisses it
```

## How it works

- **pdf.js** renders each page to a canvas, on demand. Only a small window of pages
  around the current one is ever painted, and a small LRU drops the rest, so a
  300-page PDF costs about the same memory as a 10-page one.
The library ships no audio. Give it `soundUrl` and it plays yours, picking between
several at random; give it none and pages turn silently.

- **StPageFlip** (MIT) drives the fold geometry and the drag interaction. It is
  vendored in `src/engine` rather than depended on, because upstream stopped in
  January 2024. Our patches to it are ordinary commits: `git log src/engine`.
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
| `maxHeight` | none | cap the book's height in px, otherwise it fills the viewport |
| `showCover` | `false` | stand page 1 alone as a cover instead of pairing it |
| `hardCovers` | `false` | make the covers rigid rather than bending |
| `pageCorners` | `true` | lift the page corner under the pointer |
| `deepLink` | `false` | track the page in the URL hash, `true` uses `#page=N` |
| `rtl` | `false` | right-to-left reading, spine and page order swap sides |
| `soundUrl` | none | page-turn recordings, one or several. Supplying them turns the sound on |
| `soundVolume` | `0.35` | how loud the page turn is |
| `downloadUrl` | none | offer the original document for download from this URL |
| `share` | `false` | a button that copies a link to the current page, needs `deepLink` |
| `toolbar` | `true` | `false` hides it, an object turns single buttons off |
| `zoom` | `true` | `false` disables it, an object tunes min, max and step |
| `keyboard` | `true` | arrow keys, Home and End when the stage has focus |

## Development

```sh
npm install
npm test             # unit tests for the geometry helpers
npm run dev          # demo on localhost:5173
npm run build        # library to dist/
npm run build:demo   # demo to demo-dist/ for GitHub Pages
sh build/make-sample.sh   # regenerate the demo's sample PDF
```

## Theming

Every colour and size is a custom property with its default in the `var()` call,
not declared on the root element, so a page can set them on any ancestor:

```css
.my-page { --fv-bar-bg: #8e24aa; --fv-page-bg: #fffdf7; }
```

Tokens: `--fv-page-bg`, `--fv-page-fg`, `--fv-cover-bg`, `--fv-bar-bg`,
`--fv-bar-fg`, `--fv-bar-hover`, `--fv-bar-height`, `--fv-radius`, `--fv-gap`.

MIT.
