import { createFlipview, type FlipviewHandle, type FlipviewOptions } from "./viewer";
import type { PageSource } from "./source";
import { t } from "./i18n";

export interface LightboxOptions extends FlipviewOptions {
  /** Click the backdrop to close. */
  closeOnBackdrop?: boolean;
  onClose?: () => void;
}

export interface LightboxHandle {
  /** Resolves once the source has loaded and the book is mounted. */
  book: Promise<FlipviewHandle>;
  close(): void;
}

/**
 * Opens a book over the page in its own overlay. The overlay owns the focus while
 * it is up and gives it back to whatever opened it, so a keyboard reader is not
 * dropped at the top of the document on close.
 */
export function openLightbox(
  source: PageSource | Promise<PageSource>,
  options: LightboxOptions = {},
): LightboxHandle {
  const { closeOnBackdrop = true, onClose, ...viewer } = options;
  const opener = document.activeElement as HTMLElement | null;

  const root = document.createElement("div");
  root.className = "fv-lightbox";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");

  const stage = document.createElement("div");
  stage.className = "fv-lightbox-stage";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "fv-lightbox-close";
  close.title = t("close");
  close.setAttribute("aria-label", t("close"));
  close.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M6 6l12 12M18 6L6 18"/></svg>';

  root.append(close, stage);
  document.body.appendChild(root);

  // The overlay goes up first: a document that takes a moment to load should not
  // look like a button that did nothing.
  let mounted: FlipviewHandle | null = null;
  let dismissed = false;
  const book = Promise.resolve(source).then((loaded) => {
    if (dismissed) {
      loaded.destroy();
      throw new Error("flipview: lightbox closed before the source loaded");
    }
    mounted = createFlipview(stage, loaded, viewer);
    return mounted;
  });

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    document.removeEventListener("keydown", onKeyDown, true);
    mounted?.destroy();
    root.remove();
    opener?.focus?.();
    onClose?.();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    dismiss();
  }

  close.addEventListener("click", dismiss);
  if (closeOnBackdrop) {
    root.addEventListener("click", (e) => {
      if (e.target === root) dismiss();
    });
  }
  // Capture, so Escape closes the overlay before the page sees the key.
  document.addEventListener("keydown", onKeyDown, true);
  close.focus();

  return { book, close: dismiss };
}
