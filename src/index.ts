// flipview: a standalone, framework-agnostic page-flip book viewer.
//
// - source.ts  page sources (PDF via pdf.js, or a list of images)
// - viewer.ts  the book itself: shells, lazy rendering, flip engine
export { createFlipview, type FlipviewOptions, type FlipviewHandle } from "./viewer";
export {
  createPdfSource,
  createImageSource,
  type PageSource,
  type PdfSourceOptions,
} from "./source";
