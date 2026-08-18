import { t } from "./i18n";

/** What the toolbar is allowed to drive. Kept narrow so the viewer stays in charge. */
export interface ToolbarTarget {
  first(): void;
  prev(): void;
  next(): void;
  last(): void;
  goTo(index: number): void;
  toggleFullscreen(): void;
  pageCount: number;
}

export interface ToolbarButtons {
  nav?: boolean;
  ends?: boolean;
  pageInput?: boolean;
  fullscreen?: boolean;
}

const ALL: Required<ToolbarButtons> = {
  nav: true,
  ends: true,
  pageInput: true,
  fullscreen: true,
};

// 24x24 icons on a 0 0 24 24 grid, stroked with currentColor so theming is free.
const ICONS = {
  first: "M18 6 9 12l9 6zM6 6h2v12H6z",
  prev: "M15 6 7 12l8 6z",
  next: "M9 6l8 6-8 6z",
  last: "M6 6l9 6-9 6zM16 6h2v12h-2z",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
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

  if (show.fullscreen) {
    el.appendChild(spacer());
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

function button(icon: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `fv-btn fv-btn-${icon}`;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML =
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="${ICONS[icon]}"/></svg>`;
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
