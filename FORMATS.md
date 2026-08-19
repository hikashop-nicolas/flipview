# Formats

The viewer does not know what a document is made of. It knows that something can
report a page count, paint page N, and sometimes hand over text, words and a table
of contents. That is `PageSource` in [src/source.ts](src/source.ts), and it is the
whole of the contract.

```
src/source.ts     the contract, and nothing else: no imports at all
src/sources/      one file per format, the only place a format library may appear
src/viewer.ts     the book: shells, layout, the flip engine. Format-blind.
```

`npm test` runs a layering check that fails if a format library or a format's name
appears outside `src/sources`. The drift is gradual and every single import looks
reasonable on its own, so it is checked rather than trusted.

Today: **PDF** (pdf.js) and **images** (a folder of pictures). What follows is the
path to EPUB, written before the work so the contract grows in one direction rather
than being bent to fit each format as it arrives.

## What a format needs from the contract

| Need | PDF | Images | EPUB, fixed layout | EPUB, reflowable |
|---|---|---|---|---|
| A page count known up front | yes | yes | yes | **no** |
| Pages are pictures | yes | yes | no, they are documents | no |
| Every page the same shape | mostly | mostly | usually | yes |
| A page number means something | yes | yes | yes | **no** |

The last row is the one that matters. Everything else is work; that one is a change
of meaning, and it is why the steps below are in this order.

## Step 1: pages that are documents, not pictures

A fixed-layout EPUB page is an XHTML document with a declared viewport. It has to be
rendered by the browser, in an iframe, with its resources rewritten to blob URLs out
of the zip. So a source gains a second way to paint:

```ts
/** Paint page `index` into `canvas`. Sources whose pages are pictures. */
render?(index: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>;

/** Put page `index` into `host` as live DOM. Sources whose pages are documents. */
mount?(index: number, host: HTMLElement, cssWidth: number): Promise<void>;
```

A source implements one or both; the viewer prefers `mount` for the page itself and
uses `render` for thumbnails. The panel already copes with a preview it cannot get:
it shows the page number alone. That is the honest degradation, not a stub.

**What this costs.** The flip engine draws the underside of a fold by cloning the
page element, which is why a rendered page is also set as a background image: a
cloned canvas is blank. A cloned iframe is worse than blank. So a mounted page folds
without its own picture on the back until the source can also produce a raster. For
the common fixed-layout case, where the page is one image with text over it, the
source can hand that image over and the fold looks right; for the rest it does not,
and a fold that shows the page's background colour for 700 ms is a fair price.

## Step 2: where the reader is, in the document's own terms

Before any reflow work, the viewer stops assuming that a page number is a place:

```ts
/** Where page `index` begins, in the document's own terms. */
locate?(index: number): string | null;

/** Which page a locator is on, now, after whatever has changed. */
find?(locator: string): Promise<number | null>;
```

For PDF a locator is a page number and both are trivial. For EPUB it is a CFI. The
deep link stores whichever the source offers, so a link to a place in a reflowable
book survives a different screen, a different font size, and a reader who has never
seen the same pagination as the person who sent it.

This step is worth doing while only fixed-layout EPUB exists, because it is small
there and impossible to retrofit quietly later: every feature that remembers a page
(the deep link, the panel, search results, the extension's stored hotspots) has to
go through it.

## Step 3: a page count that changes

Reflowable EPUB has no pages until it is given a page size. Two additions:

```ts
/** Lay the document out for a page this size. Resolves to the new page count. */
layout?(box: { width: number; height: number }): Promise<number>;

/** The count changed for a reason of the source's own, for instance a font change. */
onRelayout?(handler: () => void): void;
```

The viewer's `relayout()` already runs on every resize and orientation change; it
gains a step: if the source can `layout`, tell it the page box, and if the count
came back different, rebuild the shells and restore the reader's position through
`find(locate(...))`. The engine has to be reloaded with the new page elements, which
is the one piece of real surgery in the whole path, and it is confined to one
function.

Pagination itself is the source's business: a hidden iframe per spine item, CSS
multi-column at the page width, count = scrollWidth / pageWidth, and a page is a
column offset. This is how every EPUB reader in a browser does it.

## Step 4: what stops making sense

- **Hotspots** are regions of a page in page-relative coordinates. On reflowed text
  a page is not a stable surface, so hotspots belong to fixed-page documents. The
  host should not offer to draw them on a reflowable book rather than let someone
  draw regions that will be wrong on the next screen.
- **Search** stays, but hits are located per section and mapped to pages through
  `find`, not stored as page numbers.
- **A printed page number** in the toolbar becomes "page 7 of 213 as laid out for
  this screen", which is what every e-reader shows and what readers already expect.

## Which library

[foliate-js](https://github.com/johnfactotum/foliate-js) is MIT, has no hard
dependencies, reads EPUB, MOBI, AZW3, FB2 and CBZ, and hands over the spine, the
table of contents and CFIs without rendering anything. It would come in as an
optional peer dependency, exactly as `pdfjs-dist` does now: a site that never opens
an EPUB should not download an EPUB reader.

Its own paginator solves step 3 and could be used or read; either way it stays
inside `src/sources/epub/`, where the layering check can see it.

## Adding some other format

Write `src/sources/<name>.ts`, export a `create<Name>Source()` that returns a
`PageSource`, and export it from `src/index.ts`. If the viewer needs to change,
the contract is wrong: say so rather than reaching through it.
