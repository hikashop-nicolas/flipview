import { t } from "./i18n";

/**
 * A region on a page, bound to something.
 *
 * Coordinates are fractions of the page, not pixels, so a hotspot stays where it
 * was put through zoom, a resize and the single-page layout. Whoever draws them
 * works in the page's own terms and never has to know how large it is shown.
 */
export interface Hotspot {
  /** 0-based page index. */
  page: number;
  /** All four are 0 to 1, measured from the top left of the page. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where it goes. A link, another page, or neither: the host may just listen. */
  href?: string;
  target?: string;
  goToPage?: number;
  /** What a reader is told it is. Without one it announces as a region of the page. */
  label?: string;
  /** Anything the host wants back when it is used, a product id for instance. */
  data?: Record<string, string>;
}

export interface HotspotTarget {
  goTo(index: number): void;
  /** Called before anything else. Returning false stops the default. */
  onUse?: (hotspot: Hotspot, event: MouseEvent) => boolean | void;
}

/** Lays the hotspots for one page over it. */
export function renderHotspots(page: HTMLElement, spots: Hotspot[], target: HotspotTarget): void {
  page.querySelector(".fv-hotspots")?.remove();

  if (spots.length === 0) return;

  const layer = document.createElement("div");
  layer.className = "fv-hotspots";

  for (const spot of spots) {
    // A link where it goes somewhere, a button where it does something: the
    // difference is what a reader is told, and whether it can be opened in a tab.
    const el = document.createElement(spot.href ? "a" : "button");
    el.className = "fv-hotspot";

    if (el instanceof HTMLAnchorElement) {
      el.href = spot.href as string;
      if (spot.target) {
        el.target = spot.target;
        el.rel = "noopener";
      }
    } else {
      (el as HTMLButtonElement).type = "button";
    }

    el.setAttribute("aria-label", spot.label ?? t("hotspot"));
    el.style.left = `${clamp(spot.x) * 100}%`;
    el.style.top = `${clamp(spot.y) * 100}%`;
    el.style.width = `${clamp(spot.width) * 100}%`;
    el.style.height = `${clamp(spot.height) * 100}%`;

    el.addEventListener("click", (event) => {
      const answer = target.onUse?.(spot, event as MouseEvent);

      if (answer === false || event.defaultPrevented) {
        event.preventDefault();
        return;
      }

      if (spot.goToPage !== undefined) {
        event.preventDefault();
        target.goTo(spot.goToPage);
      }
    });

    layer.appendChild(el);
  }

  page.appendChild(layer);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
