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
  open(): boolean;
  /** Marks which page the reader is on. */
  mark(index: number): void;
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

  for (let index = 0; index < target.pageCount; index++) {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "fv-thumb";
    thumb.setAttribute("aria-label", t("pageOf", { page: index + 1, total: target.pageCount }));
    thumb.innerHTML = `<span class="fv-thumb-number">${index + 1}</span>`;
    thumb.addEventListener("click", () => target.goTo(index));
    lists.pages.appendChild(thumb);
    thumbs.push(thumb);
  }

  async function paint(): Promise<void> {
    if (painted) return;
    painted = true;

    for (let index = 0; index < thumbs.length; index++) {
      const url = await target.preview(index, THUMB_WIDTH).catch(() => null);
      if (url === null) continue;

      const img = new Image();
      img.src = url;
      img.alt = "";
      img.decoding = "async";
      thumbs[index].prepend(img);
    }
  }

  setOutline([]);
  show("pages");

  return {
    el,
    setOutline,
    toggle() {
      el.hidden = !el.hidden;
      if (!el.hidden) void paint();
    },
    open: () => !el.hidden,
    mark(index) {
      thumbs.forEach((thumb, at) => {
        thumb.classList.toggle("fv-thumb-here", at === index);
        if (at === index) thumb.setAttribute("aria-current", "true");
        else thumb.removeAttribute("aria-current");
      });
    },
    destroy() {
      el.remove();
    },
  };
}
