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
- **The page's own text** is laid over the picture of it, transparent, so a page
  can be selected, found and read aloud. Without it a book is a stack of images
  and a screen reader gets nothing at all.
- Pages are plain DOM elements, so anything can be laid over a page later: links
  and hotspots.

`pdfjs-dist` is an **optional peer dependency**. Install it only if you load PDFs,
and pass `workerSrc` so the host app keeps control of its own asset pipeline. Image
sources need nothing.

Pass `wasmUrl` as well if your readers might open a **scanned** document. Scans are
usually JPEG 2000 or JBIG2, and pdf.js decodes both in wasm it fetches at render
time; without it those pages come out blank white, with nothing logged. Copy
`pdfjs-dist/wasm/` next to your worker and point at the folder.

## Formats

PDF, EPUB, folders of images and folders of HTML pages. The viewer knows nothing about either: everything
format-specific lives in `src/sources` behind one contract, and a layering check in
`npm test` keeps it there. [FORMATS.md](FORMATS.md) is the design, including the path
to EPUB, fixed-layout first and reflowable after.

## Options

| Option | Default | Meaning |
|---|---|---|
| `mode` | `"auto"` | `"single"`, `"double"`, or `"auto"` to switch on width |
| `breakpoint` | `700` | container width in px below which `auto` shows one page |
| `flippingTime` | `700` | flip animation duration in ms |
| `cacheSize` | `8` | how many rendered page canvases to keep |
| `maxHeight` | none | cap the book's height in px. Ignored in fullscreen and in a lightbox |
| `showCover` | `false` | stand page 1 alone as a cover instead of pairing it |
| `hardCovers` | `false` | make the covers rigid rather than bending |
| `pageCorners` | `true` | lift the page corner under the pointer |
| `deepLink` | `false` | track the page in the URL hash, `true` uses `#page=N`, a string names the parameter |
| `rtl` | `false` | right-to-left reading, spine and page order swap sides |
| `soundUrl` | none | page-turn recordings, one or several. Supplying them turns the sound on |
| `soundVolume` | `0.35` | how loud the page turn is |
| `downloadUrl` | none | offer the original document for download from this URL |
| `share` | `false` | a button that copies a link to the current page, needs `deepLink` |
| `toolbar` | `true` | `false` hides it, an object turns single buttons off |
| `zoom` | `true` | `false` disables it, an object tunes min, max and step |
| `keyboard` | `true` | arrow keys, Home and End when the stage has focus |
| `textLayer` | `true` | lay the page's own text over each page, where the source has it |
| `search` | `true` | offer a search box, where the source can give up its words |
| `panel` | `true` | offer a side panel with the document's contents and its pages |
| `hotspots` | none | clickable regions over the pages, in fractions of a page |
| `onHotspot` | none | called when one is used, return `false` to handle it yourself |
| `onEvent` | none | everything a reader does, in one place, for counting |

## Hotspots

A hotspot is a region of a page bound to something: a link, another page, or
nothing at all where the host wants to answer for it. Coordinates are fractions of
the page rather than pixels, so a hotspot stays where it was put through zoom, a
resize and the single-page layout.

```js
createFlipview(el, source, {
  hotspots: [
    { page: 0, x: 0.08, y: 0.1, width: 0.4, height: 0.12, href: "https://example.com/" },
    { page: 1, x: 0.55, y: 0.62, width: 0.34, height: 0.2, goToPage: 5, label: "Jump to page 6" },
    { page: 2, x: 0.12, y: 0.3, width: 0.3, height: 0.22, label: "Blue kettle", data: { product: "42" } },
  ],
  onHotspot(spot) {
    if (!spot.data?.product) return;      // let the viewer handle the others
    openProduct(spot.data.product);
    return false;                          // and this one is ours
  },
});
```

Each one is a real link or a real button, named for a screen reader by its `label`,
so it is reachable by keyboard and can be opened in a new tab. They are invisible
until hovered or focused; add `fv-hotspots-shown` to the root to show them all, which
is what a shoppable catalogue usually wants.

## Two books on one page

Everything is per-instance except the URL, which the page shares. Give each book
that tracks its page its own parameter:

```js
createFlipview(first, source, { deepLink: true });      // #page=N
createFlipview(second, other, { deepLink: "page2" });   // #page2=N
```

A second book asking for a name that is already tracked is refused rather than
allowed to fight over it: it warns, and simply does not track its page.

## Counting what readers do

`onEvent` reports what happened, so a host can send it wherever it sends the rest of
its analytics. The viewer never talks to a network itself.

```js
createFlipview(el, source, {
  onEvent(name, detail) {
    window.dataLayer?.push({ event: `flipbook_${name}`, ...detail });
  },
});
```

| Event | Detail |
|---|---|
| `ready` | `pages`, `kind` |
| `page` | `page` (1-based), `pages` |
| `search` | `query`, `hits` |
| `hotspot` | `page`, `label`, `href`, `data` |
| `zoom` | `scale`, on every change: debounce it before sending |
| `fullscreen` | `on` |
| `download` | `url` |
| `share` | `url`, `copied` |

A handler that throws is caught and logged: counting a page turn should never be able
to stop one.

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
`--fv-bar-fg`, `--fv-bar-hover`, `--fv-field-bg`, `--fv-field-fg`, `--fv-bar-height`,
`--fv-radius`, `--fv-gap`.

MIT.
