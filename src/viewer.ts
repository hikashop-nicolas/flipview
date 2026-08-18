import { PageFlip } from "./engine/PageFlip";
// A const enum: the value cannot be imported through a per-file transpile, so the
// literal is used directly and only the type is pulled in.
import type { SizeType } from "./engine/Settings";
import type { PageSource } from "./source";
import { createToolbar, type ToolbarButtons } from "./toolbar";
import { createZoom, type ZoomOptions } from "./zoom";
import { createDeepLink } from "./deeplink";
import { createFlipSound, type FlipSound } from "./sound";

export interface FlipviewOptions {
  /** 'auto' turns into a single-page book on narrow screens. */
  mode?: "auto" | "single" | "double";
  /** Page-flip animation duration in ms. */
  flippingTime?: number;
  /** How many rendered page canvases to keep in memory. */
  cacheSize?: number;
  /** Stand page 1 alone as a cover. */
  showCover?: boolean;
  /** Make the covers rigid. Off by default: the rigid path visibly glitches. */
  hardCovers?: boolean;
  /** Lift the page corner under the pointer. */
  pageCorners?: boolean;
  /** Below this container width in px, 'auto' mode shows one page at a time. */
  breakpoint?: number;
  /**
   * Cap the book's height in px, so it fits the space a page gave it. Ignored in
   * fullscreen and in a lightbox, where the whole point is the space.
   */
  maxHeight?: number;
  /** false hides the toolbar entirely; an object turns individual buttons off. */
  toolbar?: boolean | ToolbarButtons;
  /** Arrow keys, Home and End drive the book when it has focus. */
  keyboard?: boolean;
  /** false disables zooming; an object tunes the min, max and step. */
  zoom?: boolean | ZoomOptions;
  /** Track the page in the URL hash. true uses #page=N, a string names the parameter. */
  deepLink?: boolean | string;
  /** Right-to-left reading: the spine and the page order swap sides. */
  rtl?: boolean;
  /** Page-turn recordings, one or several. Supplying them turns the sound on. */
  soundUrl?: string | string[];
  /** How loud the page turn is, 0 to 1. */
  soundVolume?: number;
  /** Offer the original document for download, from this URL. */
  downloadUrl?: string;
  /** Offer a button that copies a link to the current page. Needs deepLink. */
  share?: boolean;
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
  /** Downloads the original document, when the host gave us a URL for it. */
  download(): void;
  /** Copies a link to the current page. Resolves false when the browser refused. */
  share(): Promise<boolean>;
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
  hardCovers: false,
  breakpoint: 700,
  pageCorners: true,
  toolbar: true,
  keyboard: true,
  zoom: true,
  deepLink: false,
  rtl: false,
  soundVolume: 0.35,
  share: false,
} as const;

/** Re-render pages only once the book has grown by more than this, to avoid churn. */
const RERENDER_RATIO = 1.25;

/**
 * The engine picks portrait when its block is narrower than minWidth * 2. Since the
 * block is sized to the book, that test would depend on the page size rather than on
 * the container, so minWidth is driven to one extreme or the other and the decision
 * stays here, where it can be made on the container width.
 */
const PORTRAIT_MIN = 1e6;
const LANDSCAPE_MIN = 1;

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

  const startPortrait = wantPortrait();
  const start = fit(startPortrait);
  size(startPortrait, start);

  const flip = new PageFlip(book, {
    width: start.width,
    height: start.height,
    size: "stretch" as SizeType,
    minWidth: startPortrait ? PORTRAIT_MIN : LANDSCAPE_MIN,
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
    rtl: opt.rtl,
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

  /**
   * The element the book is filling, when it is filling one: the fullscreen root
   * or the lightbox overlay. Both have a height of their own that does not depend
   * on the book, which is what makes them safe to measure.
   */
  function filler(): HTMLElement | null {
    if (document.fullscreenElement === root) return root;
    return root.closest<HTMLElement>(".fv-lightbox");
  }

  /** Size one page for the given orientation, keeping the spread inside the room. */
  function fit(portrait: boolean): { width: number; height: number } {
    const available = stage.clientWidth || 800;
    const chrome = (root.querySelector(".fv-toolbar")?.clientHeight ?? 0) + 24;
    const filling = filler();

    // Never measure from the stage's own top. The stage is centred vertically, so
    // its top moves as the book resizes, and reading it back shrinks the book a
    // little more on every pass until it settles far too small. The container's
    // top is fixed by the page above it, and a filling element has a height of its
    // own, so both are stable to measure against.
    const room = filling
      ? filling.clientHeight - chrome
      : window.innerHeight - Math.max(container.getBoundingClientRect().top, 0) - chrome;

    // The cap exists to fit a book into a page's layout. Filling the screen is
    // the one moment it should not apply.
    const capped = opt.maxHeight && !filling ? Math.min(room, opt.maxHeight) : room;
    const maxHeight = Math.max(320, capped);
    let width = portrait ? available : Math.floor(available / 2);
    let height = Math.round(width / source.aspect);
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.round(height * source.aspect);
    }
    return { width, height };
  }

  /** One page per spread on a narrow container, or whenever the caller asked for it. */
  function wantPortrait(): boolean {
    if (opt.mode === "double") return false;
    if (opt.mode === "single") return true;
    return (stage.clientWidth || 800) < opt.breakpoint;
  }

  /**
   * Sizes the book element to exactly the book. The hard-page path positions a
   * left-hand page at x=0 of its block instead of at the book's left edge, so any
   * leftover width in the block pushes the two halves apart and leaves a gap down
   * the middle. Making the block exactly as wide as the spread removes the margin,
   * and with it the gap.
   */
  function size(portrait: boolean, box: { width: number; height: number }): void {
    book.style.width = `${portrait ? box.width : box.width * 2}px`;
    book.style.height = `${box.height}px`;
  }

  function relayout(): void {
    if (!settled) {
      pendingLayout = true;
      return;
    }
    pendingLayout = false;
    const portrait = wantPortrait();
    const next = fit(portrait);
    size(portrait, next);
    flip.getSettings().minWidth = portrait ? PORTRAIT_MIN : LANDSCAPE_MIN;
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

  const sounds = opt.soundUrl === undefined ? [] : [opt.soundUrl].flat();
  const sound: FlipSound | null = sounds.length > 0 ? createFlipSound(sounds, opt.soundVolume) : null;

  flip.on("flip", (e) => {
    const index = Number((e as { data: number }).data);
    ensureWindow(index);
    announce(index);
    sound?.play();
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
    download() {
      if (!opt.downloadUrl) return;
      const link = document.createElement("a");
      link.href = opt.downloadUrl;
      link.download = "";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    async share() {
      link?.write(flip.getCurrentPageIndex());
      try {
        await navigator.clipboard.writeText(location.href);
        return true;
      } catch {
        return false;
      }
    },
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
      sound?.destroy();
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
    ? createToolbar(handle, {
        zoom: !!opt.zoom,
        download: !!opt.downloadUrl,
        share: !!opt.share && !!opt.deepLink,
        ...buttons,
      })
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
