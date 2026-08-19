import { t } from "./i18n";
import type { OutlineEntry } from "./source";

/**
 * The side panel: a document's own contents, and its pages as thumbnails.
 *
 * One panel with two lists rather than two panels, because a reader wants the
 * same thing from both, a way to get somewhere, and a book is not wide enough to
 * give each its own furniture.
 */
export interface PanelHandle {
  el: HTMLElement;
  toggle(): void;
  /** Fills in the document's own contents, which arrive after the book is up. */
  setOutline(entries: OutlineEntry[]): void;
  /** Caps the panel to the height of the book beside it, in pixels. */
  fit(height: number): void;
  /** The book now has this many pages: a document that reflows says so often. */
  setPageCount(count: number): void;
  open(): boolean;
  /** Marks the pages the reader is looking at, and brings them into view. */
  mark(pages: number[]): void;
  destroy(): void;
}

export interface PanelTarget {
  goTo(index: number): void;
  pageCount: number;
  /** Paints a small preview of a page, or resolves to null when it cannot. */
  preview(index: number, width: number): Promise<string | null>;
}

const THUMB_WIDTH = 96;

export function createPanel(target: PanelTarget): PanelHandle {
  const el = document.createElement("div");
  el.className = "fv-panel";
  el.hidden = true;

  const tabs = document.createElement("div");
  tabs.className = "fv-panel-tabs";
  tabs.setAttribute("role", "tablist");

  const lists: Record<string, HTMLElement> = {};
  const buttons: Record<string, HTMLButtonElement> = {};
  // Both tabs are built; the contents one stays out of the way until a document
  // turns out to have any. A panel that appears late is worse than one that fills.
  const names = ["contents", "pages"];

  for (const name of names) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fv-panel-tab";
    button.textContent = t(name === "contents" ? "contents" : "pages");
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => show(name));
    tabs.appendChild(button);
    buttons[name] = button;

    const list = document.createElement("div");
    list.className = "fv-panel-list";
    list.setAttribute("role", "tabpanel");
    lists[name] = list;
    el.appendChild(list);
  }

  el.prepend(tabs);

  function show(name: string): void {
    for (const other of names) {
      lists[other].hidden = other !== name;
      buttons[other].setAttribute("aria-selected", String(other === name));
    }
  }

  function setOutline(entries: OutlineEntry[]): void {
    lists.contents.replaceChildren();

    const build = (items: OutlineEntry[], depth: number): void => {
      for (const entry of items) {
        const line = document.createElement("button");
        line.type = "button";
        line.className = "fv-panel-line";
        line.style.paddingInlineStart = `${8 + depth * 14}px`;
        line.textContent = entry.title;
        if (entry.page === null) {
          line.disabled = true;
        } else {
          line.addEventListener("click", () => target.goTo(entry.page as number));
        }
        lists.contents.appendChild(line);
        build(entry.children, depth + 1);
      }
    };

    build(entries, 0);

    // A document with no contents of its own offers only its pages.
    const has = entries.length > 0;
    buttons.contents.hidden = !has;
    if (!has && !lists.contents.hidden) show("pages");
  }

  // Pages, painted only when the panel is first opened: a hundred thumbnails
  // nobody asked for is a hundred renders nobody asked for.
  const thumbs: HTMLButtonElement[] = [];
  let painted = false;

  function buildThumbs(count: number): void {
    lists.pages.replaceChildren();
    thumbs.length = 0;

    for (let index = 0; index < count; index++) {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "fv-thumb";
      thumb.setAttribute("aria-label", t("pageOf", { page: index + 1, total: count }));

      // The picture's box exists before the picture does. Without it the list
      // grows as the thumbnails arrive, and a scroll made while it was short
      // leaves the page a reader is on somewhere far below.
      const img = new Image();
      img.className = "fv-thumb-img";
      img.alt = "";
      img.decoding = "async";
      thumb.appendChild(img);

      const number = document.createElement("span");
      number.className = "fv-thumb-number";
      number.textContent = String(index + 1);
      thumb.appendChild(number);

      thumb.addEventListener("click", () => target.goTo(index));
      lists.pages.appendChild(thumb);
      thumbs.push(thumb);
    }

    // The marker belongs to the list, and the list was just emptied.
    lists.pages.appendChild(marker);
  }

  async function paint(): Promise<void> {
    if (painted) return;
    painted = true;

    for (let index = 0; index < thumbs.length; index++) {
      const url = await target.preview(index, THUMB_WIDTH).catch(() => null);
      if (url === null) continue;

      const img = thumbs[index].querySelector<HTMLImageElement>(".fv-thumb-img");
      if (!img) continue;

      img.src = url;

      // The first page that paints says what shape this document's pages are, so
      // the boxes below it stop being a guess.
      if (index === 0) {
        img.addEventListener("load", () => {
          if (img.naturalWidth > 0) {
            el.style.setProperty("--fv-thumb-ratio", `${img.naturalWidth} / ${img.naturalHeight}`);
          }
        });
      }
    }

    // Anything that shifted while the pictures arrived is put right here.
    place();
    reveal(thumbs[here[0]]);
  }

  /**
   * Scrolls the list, and only the list, far enough to show a thumbnail. A page
   * turn that leaves the marked page somewhere out of sight is a mark nobody sees,
   * which is the same as no mark at all.
   */
  /** The pages last marked, so painting can put the scroll right afterwards. */
  let here: number[] = [];

  // One box that moves, rather than a border that appears and disappears: a
  // reader turning pages can see where the mark went, which is the difference
  // between following the book and looking for your place in it.
  const marker = document.createElement("div");
  marker.className = "fv-thumb-marker";
  marker.hidden = true;
  lists.pages.appendChild(marker);

  /** Puts the marker over the pages on show. */
  function place(): void {
    const first = thumbs[here[0]];
    const last = thumbs[here[here.length - 1]] ?? first;

    if (!first) {
      marker.hidden = true;
      return;
    }

    marker.hidden = false;
    marker.style.transform = `translateY(${first.offsetTop}px)`;
    marker.style.height = `${last.offsetTop + last.offsetHeight - first.offsetTop}px`;

    // The first placement is where the mark is, not a slide from the top of the
    // list, so the transition is only turned on afterwards.
    if (!marker.classList.contains("fv-thumb-marker-live")) {
      requestAnimationFrame(() => marker.classList.add("fv-thumb-marker-live"));
    }
  }

  function reveal(thumb: HTMLElement | undefined): void {
    if (!thumb || el.hidden || lists.pages.hidden) return;

    const list = lists.pages;
    const box = thumb.getBoundingClientRect();
    const frame = list.getBoundingClientRect();

    if (box.top >= frame.top && box.bottom <= frame.bottom) return;

    // Assigned rather than animated. scrollIntoView would take the whole page with
    // it, and a smooth scrollTo is an animation the browser is free to drop: it is
    // dropped in at least one browser, and a thumbnail that never arrives reads
    // exactly like a mark that was never made.
    list.scrollTop += box.top - frame.top - 8;
  }

  buildThumbs(target.pageCount);
  setOutline([]);
  show("pages");

  return {
    el,
    setOutline,
    fit(height) {
      el.style.maxHeight = height > 0 ? `${height}px` : "";
    },
    setPageCount(count) {
      if (count === thumbs.length) return;

      // Everything painted was painted for pages that no longer exist.
      painted = false;
      here = [];
      buildThumbs(count);

      if (!el.hidden) void paint();
    },
    toggle() {
      el.hidden = !el.hidden;
      if (!el.hidden) void paint();
    },
    open: () => !el.hidden,
    mark(pages) {
      // Both pages of a spread, not just the one the engine counts from: a reader
      // looking at pages 4 and 5 is looking at two pages.
      here = pages;
      const shown = new Set(pages);

      thumbs.forEach((thumb, at) => {
        thumb.classList.toggle("fv-thumb-here", shown.has(at));
        if (shown.has(at)) thumb.setAttribute("aria-current", "true");
        else thumb.removeAttribute("aria-current");
      });

      place();
      reveal(thumbs[pages[0]]);
    },
    destroy() {
      el.remove();
    },
  };
}
