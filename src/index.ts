// flipview: a standalone, framework-agnostic page-flip book viewer.
//
// - source.ts   page sources (PDF via pdf.js, or a list of images)
// - viewer.ts   the book itself: shells, lazy rendering, flip engine
// - toolbar.ts  the optional control bar
// - zoom.ts     scale and pan, and the gesture split with the flip engine
// - i18n.ts     every user-visible string
export { createFlipview, type FlipviewOptions, type FlipviewHandle } from "./viewer";
export {
  createPdfSource,
  createImageSource,
  type PageSource,
  type PdfSourceOptions,
} from "./source";
export { type ToolbarButtons, type ToolbarTarget } from "./toolbar";
export { type ZoomOptions, type ZoomHandle } from "./zoom";
export { setStrings, t, type Strings } from "./i18n";
