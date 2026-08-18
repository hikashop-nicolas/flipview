import { t } from "./i18n";

/** What the toolbar is allowed to drive. Kept narrow so the viewer stays in charge. */
export interface ToolbarTarget {
  first(): void;
  prev(): void;
  next(): void;
  last(): void;
  goTo(index: number): void;
  zoomIn(): void;
  zoomOut(): void;
  toggleFullscreen(): void;
  download(): void;
  share(): Promise<boolean>;
  search(query: string): Promise<string>;
  searchNext(): void;
  pageCount: number;
}

export interface ToolbarButtons {
  nav?: boolean;
  ends?: boolean;
  pageInput?: boolean;
  search?: boolean;
  zoom?: boolean;
  fullscreen?: boolean;
  download?: boolean;
  share?: boolean;
}

const ALL: Required<ToolbarButtons> = {
  nav: true,
  ends: true,
  pageInput: true,
  search: false,
  zoom: true,
  fullscreen: true,
  download: false,
  share: false,
};

// 24x24 icons on a 0 0 24 24 grid, stroked with currentColor so theming is free.
const ICONS = {
  first: "M18 6 9 12l9 6zM6 6h2v12H6z",
  prev: "M15 6 7 12l8 6z",
  next: "M9 6l8 6-8 6z",
  last: "M6 6l9 6-9 6zM16 6h2v12h-2z",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3.5v7m-3.5-3.5h7M16.5 16.5 21 21",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM7.5 11h7M16.5 16.5 21 21",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  done: "M5 12.5l5 5L19 7",
  download: "M12 3v11m0 0 4-4m-4 4-4-4M5 19h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21",
  share: "M9 13a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm12-6a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm0 12a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM8.6 11.6l6.8-3.2m0 7.2-6.8-3.2",
};

type IconName = keyof typeof ICONS;

export function createToolbar(target: ToolbarTarget, buttons: ToolbarButtons = {}): {
  el: HTMLElement;
  update(index: number): void;
} {
  const show = { ...ALL, ...buttons };
  const el = document.createElement("div");
  el.className = "fv-toolbar";
  el.setAttribute("role", "toolbar");

  const input = document.createElement("input");
  const label = document.createElement("span");

  if (show.ends) el.appendChild(button("first", t("first"), () => target.first()));
  if (show.nav) el.appendChild(button("prev", t("prev"), () => target.prev()));

  if (show.pageInput) {
    const group = document.createElement("span");
    group.className = "fv-toolbar-pages";
    input.type = "text";
    input.inputMode = "numeric";
    input.className = "fv-page-input";
    // Chrome restores field values across a reload and fires change, which would
    // silently jump the book to whatever page was last typed.
    input.autocomplete = "off";
    input.setAttribute("aria-label", t("goToPage"));
    input.addEventListener("change", () => {
      const wanted = Number(input.value.trim());
      if (Number.isFinite(wanted)) target.goTo(clamp(wanted - 1, 0, target.pageCount - 1));
    });
    label.className = "fv-page-total";
    label.textContent = `/ ${target.pageCount}`;
    group.append(input, label);
    el.appendChild(group);
  }

  if (show.nav) el.appendChild(button("next", t("next"), () => target.next()));
  if (show.ends) el.appendChild(button("last", t("last"), () => target.last()));

  if (show.search) {
    el.appendChild(spacer());

    const field = document.createElement("input");
    field.type = "search";
    field.className = "fv-search";
    field.placeholder = t("searchIn");
    field.setAttribute("aria-label", t("search"));

    const count = document.createElement("span");
    count.className = "fv-search-count";
    // Politely: a reader typing should hear the tally when they pause, not on
    // every keystroke.
    count.setAttribute("role", "status");

    let running = 0;
    field.addEventListener("input", () => {
      const mine = ++running;
      void target.search(field.value).then((said) => {
        if (mine === running) count.textContent = said;
      });
    });
    field.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      target.searchNext();
    });

    el.append(field, count);
  }

  if (show.zoom) {
    el.appendChild(spacer());
    el.appendChild(button("zoomOut", t("zoomOut"), () => target.zoomOut()));
    el.appendChild(button("zoomIn", t("zoomIn"), () => target.zoomIn()));
  }

  if (show.download) {
    el.appendChild(button("download", t("download"), () => target.download()));
  }

  if (show.share) {
    const shared = button("share", t("share"), () => {
      void target.share().then((ok) => {
        // A copy leaves no trace on the page, so it has to say so itself. Silence
        // here is indistinguishable from a button that does nothing.
        if (ok) {
          say(el, t("shared"));
          const icon = shared.innerHTML;
          shared.innerHTML = svg("done");
          shared.classList.add("fv-btn-done");
          window.setTimeout(() => {
            shared.innerHTML = icon;
            shared.classList.remove("fv-btn-done");
          }, 1600);
          return;
        }
        // Refused, which browsers do when the page is not the focused document
        // or the origin is not secure. Offer the link to copy by hand instead.
        say(el, t("shareFailed"), location.href);
      });
    });
    el.appendChild(shared);
  }

  if (show.fullscreen) {
    if (!show.zoom) el.appendChild(spacer());
    el.appendChild(button("fullscreen", t("fullscreen"), () => target.toggleFullscreen()));
  }

  return {
    el,
    update(index) {
      if (show.pageInput && document.activeElement !== input) {
        input.value = String(index + 1);
      }
    },
  };
}

/**
 * A short message above the toolbar. Announced politely, so a screen reader hears
 * the outcome of a copy as well as a sighted reader sees it.
 */
function say(bar: HTMLElement, message: string, link?: string): void {
  bar.querySelector(".fv-toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "fv-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;

  if (link !== undefined) {
    const field = document.createElement("input");
    field.type = "text";
    field.readOnly = true;
    field.value = link;
    field.className = "fv-toast-link";
    toast.appendChild(field);
    bar.appendChild(toast);
    field.focus();
    field.select();
    return;
  }

  bar.appendChild(toast);
  window.setTimeout(() => toast.remove(), 1800);
}

function svg(icon: IconName): string {
  return (
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="${ICONS[icon]}"/></svg>`
  );
}

function button(icon: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `fv-btn fv-btn-${icon}`;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = svg(icon);
  b.addEventListener("click", onClick);
  return b;
}

function spacer(): HTMLElement {
  const s = document.createElement("span");
  s.className = "fv-toolbar-spacer";
  return s;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
