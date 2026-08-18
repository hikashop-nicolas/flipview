import { PageFlip } from "page-flip/dist/js/page-flip.module.js";
import type { PageSource } from "./source";
import { createToolbar, type ToolbarButtons } from "./toolbar";
import { createZoom, type ZoomOptions } from "./zoom";
import { createDeepLink } from "./deeplink";

export interface FlipviewOptions {
  /** 'auto' turns into a single-page book on narrow screens. */
  mode?: "auto" | "single" | "double";
  /** Page-flip animation duration in ms. */
  flippingTime?: number;
  /** How many rendered page canvases to keep in memory. */
  cacheSize?: number;
  /** Stand page 1 alone as a cover. Off by default: it makes the first and last
   *  spreads hold a single page while the book rect still spans both halves, so
   *  those two turns behave differently from every other one. */
  showCover?: boolean;
  /** Make the covers rigid. Off by default: the rigid path visibly glitches. */
  hardCovers?: boolean;
  /** Lift the page corner under the pointer. */
  pageCorners?: boolean;
  /** Below this container width in px, 'auto' mode shows one page at a time. */
  breakpoint?: number;
  /** false hides the toolbar entirely; an object turns individual buttons off. */
  toolbar?: boolean | ToolbarButtons;
  /** Arrow keys, Home and End drive the book when it has focus. */
  keyboard?: boolean;
  /** false disables zooming; an object tunes the min, max and step. */
  zoom?: boolean | ZoomOptions;
  /** Track the page in the URL hash. true uses #page=N, a string names the parameter. */
  deepLink?: boolean | string;
  onReady?: (handle: FlipviewHandle) => void;
  onPageChange?: (index: number) => void;
  /** Called when a page fails to paint. The viewer keeps going. */
  onError?: (error: unknown, index: number) => void;
}

export interface FlipviewHandle {
  goTo(index: number): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  toggleFullscreen(): void;
  readonly pageCount: number;
  currentPage(): number;
  orientation(): "portrait" | "landscape";
  destroy(): void;
}

const DEFAULTS = {
  mode: "auto",
  flippingTime: 700,
  cacheSize: 8,
  showCover: false,
  hardCovers: false,
  breakpoint: 700,
  pageCorners: true,
  toolbar: true,
  keyboard: true,
  zoom: true,
  deepLink: false,
} as const;

/** Re-render pages only once the book has grown by more than this, to avoid churn. */
const RERENDER_RATIO = 1.25;

export function createFlipview(
  container: HTMLElement,
  source: PageSource,
  options: FlipviewOptions = {},
): FlipviewHandle {
  const opt = { ...DEFAULTS, ...options };

  const root = document.createElement("div");
  root.className = "fv-root";
  const stage = document.createElement("div");
  stage.className = "fv-stage";
  const book = document.createElement("div");
  book.className = "fv-book";
  stage.appendChild(book);
  root.appendChild(stage);
  container.appendChild(root);

  // Page shells go in first and stay; only their canvases come and go.
  const shells: HTMLElement[] = [];
  for (let i = 0; i < source.pageCount; i++) {
    const page = document.createElement("div");
    page.className = "fv-page";
    // Rigid covers are opt-in. A hard page gets no temporary copy from the flip
    // engine, so the one element serves both faces through the rotation and
    // backface-visibility blanks it halfway: the first and last turn visibly jump.
    // Soft covers bend like every other page and turn cleanly.
    if (opt.hardCovers && (i === 0 || i === source.pageCount - 1)) {
      page.setAttribute("data-density", "hard");
    }
    const inner = document.createElement("div");
    inner.className = "fv-page-inner";
    const num = document.createElement("span");
    num.className = "fv-page-number";
    num.textContent = String(i + 1);
    inner.appendChild(num);
    page.appendChild(inner);
    book.appendChild(page);
    shells.push(page);
  }

  // Stretch mode goes portrait as soon as the block is narrower than minWidth * 2,
  // so the single-page breakpoint is expressed there rather than by rebuilding.
  const minWidth =
    opt.mode === "single" ? 10000 : opt.mode === "double" ? 180 : Math.round(opt.breakpoint / 2);

  const startPortrait = opt.mode !== "double" && (stage.clientWidth || 800) < opt.breakpoint;
  const start = fit(startPortrait);
  book.style.height = `${start.height}px`;

  const flip = new PageFlip(book, {
    width: start.width,
    height: start.height,
    size: "stretch",
    minWidth,
    maxWidth: 2000,
    minHeight: 240,
    maxHeight: 2600,
    maxShadowOpacity: 0.5,
    drawShadow: true,
    flippingTime: opt.flippingTime,
    showCover: opt.showCover,
    showPageCorners: opt.pageCorners,
    usePortrait: opt.mode !== "double",
    mobileScrollSupport: false,
    clickEventForward: true,
  });
  flip.loadFromHTML(shells);

  // Zooming transforms the book element. While zoomed, the zoom layer takes the
  // pointer in the capture phase, so a drag pans instead of starting a flip.
  const zoom = opt.zoom
    ? createZoom(stage, book, opt.zoom === true ? {} : opt.zoom, (s) => {
        root.classList.toggle("fv-zoomed", s > 1);
      })
    : null;

  // Rendered canvases, most-recently-used last. Evicting one just drops the canvas.
  const rendered: number[] = [];
  const pending = new Set<number>();
  let renderWidth = start.width;

  async function renderPage(index: number): Promise<void> {
    if (index < 0 || index >= source.pageCount) return;
    if (rendered.includes(index) || pending.has(index)) return;
    pending.add(index);
    const width = renderWidth;
    try {
      const inner = shells[index].querySelector<HTMLElement>(".fv-page-inner")!;
      const canvas = document.createElement("canvas");
      canvas.className = "fv-page-canvas";
      await source.render(index, canvas, width);
      // A resize during the render would have made this canvas the wrong size.
      if (width !== renderWidth) return;

      drop(index);
      inner.appendChild(canvas);

      // The flip engine clones a page element to draw the underside of a fold, and
      // cloneNode never carries a canvas bitmap, so the folding page came out blank.
      // The same picture therefore also goes on as a background image, which does
      // survive cloning. The canvas stays on top for the normal, sharper display,
      // and if the readback fails the page still shows: only the fold falls back.
      const url = toImageUrl(canvas);
      if (url.length > 512) inner.style.backgroundImage = `url("${url}")`;

      shells[index].classList.add("fv-rendered");
      rendered.push(index);
      evict();
    } catch (err) {
      options.onError?.(err, index);
      console.error("flipview: page", index, "failed", err);
    } finally {
      pending.delete(index);
    }
  }

  function drop(index: number): void {
    shells[index].querySelector(".fv-page-canvas")?.remove();
    const inner = shells[index].querySelector<HTMLElement>(".fv-page-inner");
    if (inner) inner.style.backgroundImage = "";
    shells[index].classList.remove("fv-rendered");
  }

  function evict(): void {
    const keep = new Set(windowAround(flip.getCurrentPageIndex()));
    while (rendered.length > opt.cacheSize) {
      const victim = rendered.findIndex((i) => !keep.has(i));
      if (victim === -1) break;
      const [index] = rendered.splice(victim, 1);
      drop(index);
    }
  }

  function windowAround(index: number): number[] {
    const out: number[] = [];
    for (let i = index - 2; i <= index + 3; i++) {
      if (i >= 0 && i < source.pageCount) out.push(i);
    }
    return out;
  }

  function ensureWindow(index: number): void {
    for (const i of windowAround(index)) void renderPage(i);
  }

  /** Size one page for the given orientation, keeping the spread inside the viewport. */
  function fit(portrait: boolean): { width: number; height: number } {
    const available = stage.clientWidth || 800;
    const top = stage.getBoundingClientRect().top;
    const chrome = (root.querySelector(".fv-toolbar")?.clientHeight ?? 0) + 24;
    const maxHeight = Math.max(320, window.innerHeight - Math.max(top, 0) - chrome);
    let width = portrait ? available : Math.floor(available / 2);
    let height = Math.round(width / source.aspect);
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.round(height * source.aspect);
    }
    return { width, height };
  }

  function relayout(): void {
    if (!settled) {
      pendingLayout = true;
      return;
    }
    pendingLayout = false;
    const next = fit(flip.getOrientation() === "portrait");
    book.style.height = `${next.height}px`;
    flip.update();
    zoom?.refresh();
    if (next.width > renderWidth * RERENDER_RATIO) {
      renderWidth = next.width;
      for (const i of rendered.splice(0)) drop(i);
      ensureWindow(flip.getCurrentPageIndex());
    }
  }

  // A flip changes the book's height, which trips the ResizeObserver, and calling
  // update() mid-animation snaps the page to its end state. So layout work waits
  // for the engine to settle, and only a real width change counts as a resize.
  let settled = true;
  let pendingLayout = false;
  let lastWidth = container.clientWidth;

  function announce(index: number): void {
    bar?.update(index);
    link?.write(index);
    options.onPageChange?.(index);
  }

  flip.on("flip", (e) => {
    const index = Number((e as { data: number }).data);
    ensureWindow(index);
    announce(index);
  });
  flip.on("changeOrientation", () => relayout());
  flip.on("changeState", (e) => {
    settled = (e as { data: string }).data === "read";
    if (settled && pendingLayout) relayout();
  });

  ensureWindow(0);

  let frame = 0;
  const observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width ?? 0;
    if (Math.abs(width - lastWidth) < 1) return;
    lastWidth = width;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(relayout);
  });
  observer.observe(container);

  const handle: FlipviewHandle = {
    goTo(index) {
      flip.turnToPage(index);
      ensureWindow(index);
      announce(index);
    },
    next: () => flip.flipNext(),
    prev: () => flip.flipPrev(),
    first: () => handle.goTo(0),
    last: () => handle.goTo(source.pageCount - 1),
    zoomIn: () => zoom?.in(),
    zoomOut: () => zoom?.out(),
    zoomReset: () => zoom?.reset(),
    toggleFullscreen() {
      if (document.fullscreenElement === root) void document.exitFullscreen();
      else void root.requestFullscreen?.();
    },
    pageCount: source.pageCount,
    currentPage: () => flip.getCurrentPageIndex(),
    orientation: () => flip.getOrientation(),
    destroy() {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreen);
      cancelAnimationFrame(frame);
      zoom?.destroy();
      link?.destroy();
      flip.destroy();
      source.destroy();
      root.remove();
    },
  };

  // Hash changes come from outside, so they drive the engine without writing back.
  const link = opt.deepLink
    ? createDeepLink(opt.deepLink === true ? "page" : opt.deepLink, (index) => {
        if (index !== flip.getCurrentPageIndex()) handle.goTo(index);
      })
    : null;

  const buttons = opt.toolbar === true || opt.toolbar === false ? {} : opt.toolbar;
  const bar = opt.toolbar
    ? createToolbar(handle, { zoom: !!opt.zoom, ...buttons })
    : null;
  if (bar) root.appendChild(bar.el);
  bar?.update(0);

  function onFullscreen(): void {
    root.classList.toggle("fv-fullscreen", document.fullscreenElement === root);
    relayout();
  }
  document.addEventListener("fullscreenchange", onFullscreen);

  if (opt.keyboard) {
    stage.tabIndex = 0;
    stage.addEventListener("keydown", (e) => {
      const rtlAware = { ArrowLeft: handle.prev, ArrowRight: handle.next };
      const action =
        e.key in rtlAware
          ? rtlAware[e.key as keyof typeof rtlAware]
          : e.key === "Home"
            ? handle.first
            : e.key === "End"
              ? handle.last
              : null;
      if (!action) return;
      e.preventDefault();
      action();
    });
  }

  // The toolbar was not in the DOM when the first size was computed.
  relayout();

  const linked = link?.read();
  if (linked != null && linked > 0 && linked < source.pageCount) handle.goTo(linked);

  options.onReady?.(handle);
  return handle;
}

/**
 * WebP where it is supported, PNG otherwise. Deliberately the synchronous encode:
 * toBlob defers its callback to a task the compositor can starve, and a page that
 * never finishes encoding never appears at all.
 */
function toImageUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/webp", 0.92);
}
