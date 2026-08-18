import { PageFlip } from "page-flip/dist/js/page-flip.module.js";
import type { PageSource } from "./source";
import { createToolbar, type ToolbarButtons } from "./toolbar";

export interface FlipviewOptions {
  /** 'auto' turns into a single-page book on narrow screens. */
  mode?: "auto" | "single" | "double";
  /** Page-flip animation duration in ms. */
  flippingTime?: number;
  /** How many rendered page canvases to keep in memory. */
  cacheSize?: number;
  /** Treat page 1 as a standalone cover. */
  showCover?: boolean;
  /** Below this container width in px, 'auto' mode shows one page at a time. */
  breakpoint?: number;
  /** false hides the toolbar entirely; an object turns individual buttons off. */
  toolbar?: boolean | ToolbarButtons;
  /** Arrow keys, Home and End drive the book when it has focus. */
  keyboard?: boolean;
  onReady?: (handle: FlipviewHandle) => void;
  onPageChange?: (index: number) => void;
}

export interface FlipviewHandle {
  goTo(index: number): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
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
  showCover: true,
  breakpoint: 700,
  toolbar: true,
  keyboard: true,
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
    // A cover and a back cover are rigid; the inner pages bend.
    if (opt.showCover && (i === 0 || i === source.pageCount - 1)) {
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
    usePortrait: opt.mode !== "double",
    mobileScrollSupport: false,
    clickEventForward: true,
  });
  flip.loadFromHTML(shells);

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
      canvas.className = "fv-canvas";
      await source.render(index, canvas, width);
      // A resize during the render would have made this canvas the wrong size.
      if (width !== renderWidth) return;
      inner.querySelector(".fv-canvas")?.remove();
      inner.appendChild(canvas);
      shells[index].classList.add("fv-rendered");
      rendered.push(index);
      evict();
    } catch (err) {
      console.error("flipview: page", index, "failed", err);
    } finally {
      pending.delete(index);
    }
  }

  function drop(index: number): void {
    shells[index].querySelector(".fv-canvas")?.remove();
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

  // The block height drives the stretch layout, so it has to follow the orientation.
  function relayout(): void {
    const next = fit(flip.getOrientation() === "portrait");
    book.style.height = `${next.height}px`;
    flip.update();
    if (next.width > renderWidth * RERENDER_RATIO) {
      renderWidth = next.width;
      for (const i of rendered.splice(0)) drop(i);
      ensureWindow(flip.getCurrentPageIndex());
    }
  }

  function announce(index: number): void {
    bar?.update(index);
    options.onPageChange?.(index);
  }

  flip.on("flip", (e) => {
    const index = Number((e as { data: number }).data);
    ensureWindow(index);
    announce(index);
  });
  flip.on("changeOrientation", () => relayout());

  ensureWindow(0);

  let frame = 0;
  const observer = new ResizeObserver(() => {
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
      flip.destroy();
      source.destroy();
      root.remove();
    },
  };

  const bar = opt.toolbar
    ? createToolbar(handle, opt.toolbar === true ? {} : opt.toolbar)
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

  options.onReady?.(handle);
  return handle;
}
