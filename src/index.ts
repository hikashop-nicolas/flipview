// flipview: a standalone, framework-agnostic page-flip book viewer.
//
// - source.ts   what a document has to do to become a book: the format contract
// - sources/    one file per format, reached only through that contract
// - viewer.ts   the book itself: shells, lazy rendering, flip engine
// - toolbar.ts  the optional control bar
// - zoom.ts     scale and pan, and the gesture split with the flip engine
// - deeplink.ts the page number in the URL hash
// - lightbox.ts the overlay presentation
// - sound.ts    the page-turn recordings
// - search.ts   finding words, and marking them on a page
// - i18n.ts     every user-visible string
export {
  createFlipview,
  type FlipviewOptions,
  type FlipviewHandle,
  type FlipviewEventName,
} from "./viewer";
export { type PageSource, type OutlineEntry } from "./source";
export { createPdfSource, type PdfSourceOptions } from "./sources/pdf";
export { createImageSource } from "./sources/images";
export { createEpubSource, type EpubSourceOptions } from "./sources/epub/fixed";
export { createHtmlSource, type HtmlSourceOptions } from "./sources/html";
export { createComicSource, type ComicSourceOptions } from "./sources/comic";
export { type ToolbarButtons, type ToolbarTarget } from "./toolbar";
export { type ZoomOptions, type ZoomHandle } from "./zoom";
export { createDeepLink, type DeepLink } from "./deeplink";
export { openLightbox, type LightboxOptions, type LightboxHandle } from "./lightbox";
export { createFlipSound, type FlipSound } from "./sound";
export { createSearch, highlight, type SearchHandle, type SearchHit } from "./search";
export { renderHotspots, type Hotspot, type HotspotTarget } from "./hotspots";
export { setStrings, t, type Strings } from "./i18n";
