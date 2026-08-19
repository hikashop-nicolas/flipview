import { PageFlip } from "./engine/PageFlip";
// A const enum: the value cannot be imported through a per-file transpile, so the
// literal is used directly and only the type is pulled in.
import type { SizeType } from "./engine/Settings";
import type { PageSource } from "./source";
import { t } from "./i18n";
import { createToolbar, type ToolbarButtons } from "./toolbar";
import { createZoom, type ZoomOptions } from "./zoom";
import { createDeepLink } from "./deeplink";
import { createPanel, type PanelHandle } from "./panel";
import { createSearch, highlight, type SearchHit } from "./search";
import { createFlipSound, type FlipSound } from "./sound";
import { renderHotspots, type Hotspot } from "./hotspots";

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
  /** Lay the page's own text over each page, where the source has it. */
  textLayer?: boolean;
  /** Offer a search box. Needs a source that can give up its words. */
  search?: boolean;
  /** Offer a side panel with the document's contents and its pages. */
  panel?: boolean;
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
  /** Clickable regions over the pages, in page fractions. */
  hotspots?: Hotspot[];
  /**
   * Called when one is used, before anything else happens. Return false to keep
   * the viewer from following it, so a host can open its own thing instead.
   */
  onHotspot?: (hotspot: Hotspot, event: MouseEvent) => boolean | void;
  onReady?: (handle: FlipviewHandle) => void;
  onPageChange?: (index: number) => void;
  /**
   * Everything a reader does, in one place, so a host can count it: "ready",
   * "page", "search", "hotspot", "zoom", "fullscreen", "download", "share".
   */
  onEvent?: (name: FlipviewEventName, detail: Record<string, unknown>) => void;
  /** Called when a page fails to paint. The viewer keeps going. */
  onError?: (error: unknown, index: number) => void;
}

export type FlipviewEventName =
  | "ready"
  | "page"
  | "search"
  | "hotspot"
  | "zoom"
  | "fullscreen"
  | "download"
  | "share";

export interface FlipviewHandle {
  goTo(index: number): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  /** Opens or closes the contents and pages panel. */
  togglePanel(): void;
  /** Searches the document and returns a short tally for a reader. */
  search(query: string): Promise<string>;
  /** Moves to the next page holding the current query, wrapping at the end. */
  searchNext(): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  toggleFullscreen(): void;
  /** Downloads the original document, when the host gave us a URL for it. */
  download(): void;
  /** Copies a link to the current page. Resolves false when the browser refused. */
  share(): Promise<boolean>;
  /** Replaces every hotspot in the book. */
  setHotspots(hotspots: Hotspot[]): void;
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
  textLayer: true,
  search: true,
  panel: true,
  zoom: true,
  deepLink: false,
  rtl: false,
  soundVolume: 0.35,
  share: false,
} as const;

/** Re-render pages only once the book has grown by more than this, to avoid churn. */
const RERENDER_RATIO = 1.25;

/**
 * The engine picks portrait when its block is narrower than minWidth * 2, and the
 * block is sized to the book, so setting minWidth to one page width decides it:
 * a portrait block is one page wide and goes portrait, a landscape block is two
 * and does not. It also lands on the element as a min-width, which is why it has
 * to be a real page width rather than a sentinel.
 */

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

  /**
   * Regions of a page, where a page is a stable surface. A document that reflows
   * has none: the words that are on page 12 today are on page 15 on a narrower
   * screen, so a region drawn over them is a region over something else. Saying so
   * beats putting a link somewhere arbitrary.
   */
  let hotspots: Hotspot[] = source.layout ? [] : (options.hotspots ?? []);

  if (source.layout && (options.hotspots?.length ?? 0) > 0) {
    console.warn("flipview: hotspots are not shown on a document that reflows, since its pages move");
  }
  /**
   * How many pages there are *now*. A PDF says this once; a book that reflows says
   * something different for every size of page, so nothing may hold on to the
   * number the source first reported.
   */
  let pageCount = source.pageCount;
  // Assigned once the panel is built, and used by the layout before then.
  let sidePanel: PanelHandle | null = null;

  // Page shells go in first and stay; only their canvases come and go. A book
  // that reflows builds them again when its page count changes.
  const shells: HTMLElement[] = [];

  function buildShells(count: number): void {
    book.replaceChildren();
    shells.length = 0;

    for (let i = 0; i < count; i++) {
      const page = document.createElement("div");
      page.className = "fv-page";
      // A page is a region a reader can be told they are on, rather than an
      // anonymous box holding a picture.
      page.setAttribute("role", "group");
      page.setAttribute("aria-roledescription", t("pageRole"));
      page.setAttribute("aria-label", t("pageOf", { page: i + 1, total: count }));
      // Rigid covers are opt-in. A hard page gets no temporary copy from the flip
      // engine, so the one element serves both faces through the rotation and
      // backface-visibility blanks it halfway: the first and last turn visibly
      // jump. Soft covers bend like every other page and turn cleanly.
      if (opt.hardCovers && (i === 0 || i === count - 1)) {
        page.setAttribute("data-density", "hard");
      }
      const inner = document.createElement("div");
      inner.className = "fv-page-inner";
      const num = document.createElement("span");
      num.className = "fv-page-number";
      num.textContent = String(i + 1);
      inner.appendChild(num);
      page.appendChild(inner);
      placeHotspots(inner, i);
      book.appendChild(page);
      shells.push(page);
    }
  }

  /**
   * Hotspots go on the shell, not on the render, so they are there before a page
   * is painted and survive it being evicted. Being real links and buttons, the
   * engine's click forwarding already leaves them alone, so a click on one does
   * not also start a page turn.
   */
  function placeHotspots(inner: HTMLElement, index: number): void {
    renderHotspots(
      inner,
      hotspots.filter((spot) => spot.page === index),
      {
        goTo: (i) => flip.flip(i),
        onUse: (spot, event) => {
          emit("hotspot", { page: spot.page + 1, label: spot.label, href: spot.href, data: spot.data });
          return options.onHotspot?.(spot, event);
        },
      },
    );
  }

  buildShells(pageCount);

  const startPortrait = wantPortrait();
  const start = fit(startPortrait);
  size(startPortrait, start);

  // Someone who asked their system for less motion should not be handed a page
  // that sweeps across the screen. The turn still happens, it just stops being an
  // animation: the alternative, ignoring the setting, can make a reader ill.
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const flippingTime = () => (calm?.matches ? 1 : opt.flippingTime);

  /** The page the engine last showed, so a relayout is not heard as a page turn. */
  let shown = 0;

  const sounds = opt.soundUrl === undefined ? [] : [opt.soundUrl].flat();
  const sound: FlipSound | null = sounds.length > 0 ? createFlipSound(sounds, opt.soundVolume) : null;

  /**
   * The engine, built around the shells it is given. A book that reflows gets a
   * new one when its page count changes: the engine takes its pages once, at
   * load, so a different number of pages is a different engine.
   */
  function createEngine(box: { width: number; height: number }): PageFlip {
    const engine = new PageFlip(book, {
      width: box.width,
      height: box.height,
      size: "stretch" as SizeType,
      minWidth: box.width,
      maxWidth: 2000,
      minHeight: 240,
      maxHeight: 2600,
      maxShadowOpacity: 0.5,
      drawShadow: true,
      flippingTime: flippingTime(),
      showCover: opt.showCover,
      showPageCorners: opt.pageCorners,
      usePortrait: opt.mode !== "double",
      mobileScrollSupport: false,
      clickEventForward: true,
      rtl: opt.rtl,
    });

    engine.loadFromHTML(shells);

    // The engine fires "flip" whenever it re-shows the spread, which includes
    // every relayout: entering fullscreen, leaving it, a resize. Only a change of
    // page is a page turn, and only a page turn should be heard.
    engine.on("flip", (e) => {
      const index = Number((e as { data: number }).data);
      const turned = index !== shown;
      shown = index;

      ensureWindow(index);
      announce(index);

      if (turned) sound?.play();
    });

    engine.on("changeOrientation", () => relayout());
    engine.on("changeState", (e) => {
      settled = (e as { data: string }).data === "read";
      if (settled && pendingLayout) relayout();
      // The engine has stopped moving pages about, so their widths are final.
      if (settled) scheduleRescale();
    });

    return engine;
  }

  let flip = createEngine(start);

  // Zooming transforms the book element. While zoomed, the zoom layer takes the
  // pointer in the capture phase, so a drag pans instead of starting a flip.
  const zoom = opt.zoom
    ? createZoom(stage, book, opt.zoom === true ? {} : opt.zoom, (s) => {
        root.classList.toggle("fv-zoomed", s > 1);
        emit("zoom", { scale: s });
      })
    : null;

  // Rendered canvases, most-recently-used last. Evicting one just drops the canvas.
  const rendered: number[] = [];
  const pending = new Set<number>();
  let renderWidth = start.width;

  async function renderPage(index: number): Promise<void> {
    if (index < 0 || index >= pageCount) return;
    if (rendered.includes(index) || pending.has(index)) return;
    pending.add(index);
    const width = renderWidth;
    try {
      const inner = shells[index].querySelector<HTMLElement>(".fv-page-inner")!;

      // A page that is a document rather than a picture is put in as it is. It
      // carries its own text, so there is no text layer to lay over it, and no
      // picture to put on the back of the fold.
      if (source.mount) {
        drop(index);
        // The width the page is *shown* at, not the width the book last decided to
        // render at: a mounted page is scaled to fit, so a number that is a little
        // too big pushes its own margin off the edge.
        await source.mount(index, inner, shells[index].clientWidth || width);

        if (width !== renderWidth) return;

        // The page may have been sized again while this was being built, and a
        // page drawn at one size and scaled for another loses its own margin.
        scheduleRescale();

        shells[index].classList.add("fv-rendered", "fv-page-mounted");
        rendered.push(index);
        evict();
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.className = "fv-page-canvas";
      await source.render!(index, canvas, width);
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

      // The page's own text, over the picture of it. Without this a book is a
      // stack of images: nothing to select, nothing to find, nothing to read
      // aloud. It is transparent, so it changes nothing about how the page looks.
      if (opt.textLayer && source.text) {
        const layer = document.createElement("div");
        layer.className = "fv-text-layer";
        inner.appendChild(layer);
        // The width the page is shown at, not the width it was rasterised at: the
        // picture is stretched to fill the page and the text has to match it.
        await source.text(index, layer, shells[index].clientWidth || width).catch(() => layer.remove());
      }

      // A page painted while a search is running arrives already marked.
      if (finder.query()) highlight(shells[index], finder.query());

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
    shells[index].querySelector(".fv-page-mount")?.remove();
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
      if (i >= 0 && i < pageCount) out.push(i);
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
    // The panel is told the same height. A percentage cap would resolve against a
    // flex line whose own height is what the panel is trying to be bounded by, so
    // it resolves to nothing and a long book's thumbnails push the toolbar down
    // the page.
    //
    // Through a variable rather than the panel itself: the first size is computed
    // while the panel is still being built, and naming a const before it exists
    // is a throw, not an undefined.
    sidePanel?.fit(box.height);
  }

  /**
   * A page that is a document is drawn at the size it was written for and scaled
   * to fit, so a resize means a new scale. A picture stretches on its own; this
   * does not.
   */
  /**
   * After the engine has laid out, not before. A page's width changes when the
   * engine positions it, which is after the viewer has sized the book and after a
   * page has been mounted: measuring any earlier gives the width the page had a
   * moment ago, and the frame keeps a scale that is slightly too large.
   */
  function scheduleRescale(): void {
    requestAnimationFrame(() => requestAnimationFrame(rescaleMounts));
  }

  function rescaleMounts(): void {
    for (const frame of root.querySelectorAll<HTMLElement>(".fv-page-frame[data-fv-width]")) {
      const drawn = Number(frame.dataset.fvWidth);
      const shown = (frame.closest(".fv-page") as HTMLElement | null)?.clientWidth ?? 0;

      if (drawn > 0 && shown > 0) frame.style.transform = `scale(${shown / drawn})`;
    }
  }

  /** Text follows the page: a resize changes what the picture is stretched to. */
  function rescaleText(): void {
    for (const layer of root.querySelectorAll<HTMLElement>(".fv-text-layer")) {
      const base = Number(layer.dataset.baseWidth);
      const shown = (layer.closest(".fv-page") as HTMLElement | null)?.clientWidth ?? 0;
      if (base > 0 && shown > 0) {
        layer.style.setProperty("--scale-factor", String(shown / base));
      }
    }
  }

  /** True while the book is being rebuilt, so a resize cannot start a second one. */
  let paginating = false;
  /** The page size the document was last laid out for. */
  let laidOutFor: { width: number; height: number } | null = null;

  /**
   * Asks a document that reflows how many pages it makes at this size, and
   * rebuilds the book when the answer has changed.
   *
   * The engine takes its pages once, at load, so a different number of pages means
   * a different engine. The reader is put back where they were by locator, since
   * the page they were on is not the page they are on: that is what reflow means.
   */
  async function repaginate(box: { width: number; height: number }): Promise<void> {
    if (!source.layout || paginating) return;

    // Laying out changes the book, which trips the resize watcher, which asks for
    // a layout: without this the book paginates itself for ever, a few pages
    // different every time. A page size within a pixel or two is the same page.
    if (
      laidOutFor &&
      Math.abs(laidOutFor.width - box.width) < 2 &&
      Math.abs(laidOutFor.height - box.height) < 2
    ) {
      return;
    }

    paginating = true;
    laidOutFor = box;

    const was = locatorFor(flip.getCurrentPageIndex());

    try {
      const count = await source.layout(box);

      if (count === pageCount || count < 1) return;

      pageCount = count;
      rendered.length = 0;
      pending.clear();

      // destroy() takes the book element out of the page with it.
      flip.destroy();
      stage.appendChild(book);
      buildShells(count);
      flip = createEngine(box);
      panel?.setPageCount(count);
      bar?.update(0);

      const index = (await pageFor(was)) ?? 0;

      shown = index;
      flip.turnToPage(index);
      ensureWindow(index);
      announce(index);
    } catch (err) {
      options.onError?.(err, -1);
      console.error("flipview: laying the document out again failed", err);
    } finally {
      paginating = false;
    }
  }

  function relayout(): void {
    if (!settled || paginating) {
      pendingLayout = true;
      return;
    }
    pendingLayout = false;
    const portrait = wantPortrait();
    const next = fit(portrait);
    size(portrait, next);
    void repaginate(next);
    // One page wide: this decides the engine's orientation and is also written
    // onto the element as a min-width, so it has to be a real width.
    flip.getSettings().minWidth = next.width;
    flip.update();
    rescaleText();
    scheduleRescale();
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

  /** Where a page is, in the document's own terms, falling back to its number. */
  function locatorFor(index: number): string {
    return source.locate?.(index) ?? String(index + 1);
  }

  /** The page a locator names now, which is not always the page it named before. */
  async function pageFor(locator: string): Promise<number | null> {
    if (source.find) return source.find(locator).catch(() => null);

    const page = Number(locator);

    return Number.isFinite(page) && page >= 1 && page <= pageCount ? page - 1 : null;
  }

  function announce(index: number): void {
    bar?.update(index);
    panel?.mark(spread(index));
    link?.write(locatorFor(index));
    options.onPageChange?.(index);
    emit("page", { page: index + 1, pages: pageCount });
  }

  /**
   * A host that wants to count what readers do should not have to reach into the
   * viewer for it, and should never be able to break it by throwing.
   */
  function emit(name: FlipviewEventName, detail: Record<string, unknown> = {}): void {
    try {
      options.onEvent?.(name, detail);
    } catch (err) {
      console.error("flipview: an onEvent handler threw", err);
    }
  }

  /**
   * The pages on show. The engine counts a spread by its left page, and pairs
   * them the way the book is bound: with a cover, page 1 stands alone and the
   * pairs start odd; without one they start even. The last page can stand alone
   * for the same reason.
   */
  function spread(index: number): number[] {
    if (flip.getOrientation() !== "landscape") return [index];

    const paired = opt.showCover ? index % 2 === 1 : index % 2 === 0;

    return paired && index + 1 < pageCount ? [index, index + 1] : [index];
  }

  const finder = createSearch(source);
  let hits: SearchHit[] = [];
  let at = -1;

  ensureWindow(0);

  // The setting can change while a book is open.
  const onCalmChange = (): void => {
    flip.getSettings().flippingTime = flippingTime();
  };
  calm?.addEventListener?.("change", onCalmChange);

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
    last: () => handle.goTo(pageCount - 1),
    togglePanel() {
      panel?.toggle();
      panel?.mark(spread(flip.getCurrentPageIndex()));
    },
    async search(query) {
      hits = await finder.find(query);
      at = -1;

      for (const index of rendered) highlight(shells[index], finder.query());

      emit("search", { query: finder.query(), hits: hits.length });

      if (finder.query().length < 2) return "";
      if (hits.length === 0) return t("searchNone");

      handle.searchNext();

      // One page is a page, not one pages.
      return t(hits.length === 1 ? "searchHit" : "searchHits", { count: hits.length });
    },
    searchNext() {
      if (hits.length === 0) return;
      at = (at + 1) % hits.length;
      handle.goTo(hits[at].page);
    },
    download() {
      if (!opt.downloadUrl) return;
      emit("download", { url: opt.downloadUrl });
      const link = document.createElement("a");
      link.href = opt.downloadUrl;
      link.download = "";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    async share() {
      link?.write(locatorFor(flip.getCurrentPageIndex()));
      try {
        await navigator.clipboard.writeText(location.href);
        emit("share", { url: location.href, copied: true });
        return true;
      } catch {
        emit("share", { url: location.href, copied: false });
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
    get pageCount() {
      return pageCount;
    },
    currentPage: () => flip.getCurrentPageIndex(),
    orientation: () => flip.getOrientation(),
    setHotspots(next) {
      hotspots = source.layout ? [] : next;
      for (let i = 0; i < shells.length; i++) {
        placeHotspots(shells[i].querySelector<HTMLElement>(".fv-page-inner")!, i);
      }
    },
    destroy() {
      observer.disconnect();
      calm?.removeEventListener?.("change", onCalmChange);
      document.removeEventListener("fullscreenchange", onFullscreen);
      cancelAnimationFrame(frame);
      zoom?.destroy();
      link?.destroy();
      finder.destroy();
      panel?.destroy();
      sound?.destroy();
      flip.destroy();
      source.destroy();
      root.remove();
    },
  };

  // Hash changes come from outside, so they drive the engine without writing back.
  const link = opt.deepLink
    ? createDeepLink(opt.deepLink === true ? "page" : opt.deepLink, (value) => {
        void pageFor(value).then((index) => {
          if (index !== null && index !== flip.getCurrentPageIndex()) handle.goTo(index);
        });
      })
    : null;

  // Read now, acted on later. Finding the page a locator names can take a moment,
  // and by then the first page turn has written its own place over it.
  const linked = link?.read() ?? null;

  // Built now, filled when the document gives up its contents: a panel that only
  // exists once a promise has resolved cannot be opened before then.
  const panel: PanelHandle | null = opt.panel
    ? createPanel({
        goTo: (index) => handle.goTo(index),
        get pageCount() {
          return pageCount;
        },
        async preview(index, width) {
          // A source whose pages are documents may have no picture of one. The
          // panel shows the page number alone rather than an empty box.
          if (!source.render) return null;

          const canvas = document.createElement("canvas");
          await source.render(index, canvas, width);

          return toImageUrl(canvas);
        },
      })
    : null;

  if (panel) {
    sidePanel = panel;
    stage.prepend(panel.el);
    panel.fit(book.getBoundingClientRect().height);
    panel.mark(spread(flip.getCurrentPageIndex()));

    void (source.outline ? source.outline() : Promise.resolve([]))
      .catch(() => [])
      .then((outline) => panel.setOutline(outline));
  }

  const buttons = opt.toolbar === true || opt.toolbar === false ? {} : opt.toolbar;
  const bar = opt.toolbar
    ? createToolbar(handle, {
        zoom: !!opt.zoom,
        download: !!opt.downloadUrl,
        search: !!opt.search && typeof source.words === "function",
        panel: !!opt.panel,
        share: !!opt.share && !!opt.deepLink,
        ...buttons,
      })
    : null;
  if (bar) root.appendChild(bar.el);
  bar?.update(0);

  function onFullscreen(): void {
    const on = document.fullscreenElement === root;
    root.classList.toggle("fv-fullscreen", on);
    relayout();
    emit("fullscreen", { on });
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

  if (linked != null) {
    void pageFor(linked).then((index) => {
      if (index !== null && index > 0 && index < pageCount) handle.goTo(index);
    });
  }

  options.onReady?.(handle);
  emit("ready", { pages: pageCount, kind: source.kind });
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
