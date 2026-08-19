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

Today: **PDF** (pdf.js), **images** (a folder of pictures), **EPUB** (fixed-layout
and reflowable), and **HTML pages** (a folder of files the site already serves). What follows was written before the EPUB work and is
kept as the record of it: each step says what it added and what it cost.

## What a format needs from the contract

| Need | PDF | Images | EPUB, fixed layout | EPUB, reflowable |
|---|---|---|---|---|
| A page count known up front | yes | yes | yes | **no** |
| Pages are pictures | yes | yes | no, they are documents | no |
| Every page the same shape | mostly | mostly | usually | yes |
| A page number means something | yes | yes | yes | **no** |

The last row is the one that matters. Everything else is work; that one is a change
of meaning, and it is why the steps below are in this order.

## Step 1: pages that are documents, not pictures — done

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

## Step 2: where the reader is, in the document's own terms — done

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

## Step 3: a page count that changes — done

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

## Step 4: what stops making sense — done

- **Hotspots** are regions of a page in page-relative coordinates. On reflowed text
  a page is not a stable surface, so hotspots belong to fixed-page documents. The
  host should not offer to draw them on a reflowable book rather than let someone
  draw regions that will be wrong on the next screen.
- **Search** stays, but hits are located per section and mapped to pages through
  `find`, not stored as page numbers.
- **A printed page number** in the toolbar becomes "page 7 of 213 as laid out for
  this screen", which is what every e-reader shows and what readers already expect.

## What EPUB actually cost

`src/sources/epub/` is about six hundred lines: the container and package
paperwork, the archive, the rewriting of every relative reference to a blob URL,
the fixed-layout source and the reflowable one. The only dependency is **fflate**
for the zip, an optional peer exactly as `pdfjs-dist` is: a site that never opens an
EPUB should not download a zip reader.

[foliate-js](https://github.com/johnfactotum/foliate-js) was the alternative and is
a good library; writing it ourselves kept the dependency list at one small thing and
the code where the layering check can see it. If CFIs or MOBI ever matter, that is
the moment to reach for it.

Three things this cost that are worth knowing before doing it again:

- **A frame that has just been made already has a document**, a blank one, and it is
  complete. Anything written into it goes into the document the real content is
  about to replace, so the stylesheet that makes the columns appeared to do nothing
  and every chapter measured as one page. The listener goes on before the content.
- **Two pages of one chapter cannot share an iframe.** Measuring uses one frame per
  section; showing uses one per page, and the viewer's own window keeps the number
  small.
- **Laying out changes the book, which asks for a layout.** A book that takes its
  page shape from the box it is offered will repaginate for ever, a few pages
  different every time. The page shape is the source's to state, and a re-layout for
  a page size within a pixel or two of the last one is not a re-layout.

## HTML pages

The fourth format is the one that needed no machinery: a folder of HTML files, one
per page, shown in an iframe with a `src`. There is no archive to unpack and nothing
to rewrite, because the site is already serving the pages and every relative
reference resolves the way it always would. A page may state its own size with a
viewport meta, exactly as a fixed-layout EPUB page does.

It exists because of what step 1 built. Before `mount`, a page had to be a picture,
and a book of web pages would have meant rasterising them.

## Adding some other format

Write `src/sources/<name>.ts`, export a `create<Name>Source()` that returns a
`PageSource`, and export it from `src/index.ts`. If the viewer needs to change,
the contract is wrong: say so rather than reaching through it.
