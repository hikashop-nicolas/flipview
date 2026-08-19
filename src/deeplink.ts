/**
 * Keeps a page number in the URL hash, so a reader can link to page 12 and land
 * on it. Other hash parameters are preserved, which matters when a host already
 * uses the hash for something else.
 */
export interface DeepLink {
  read(): number | null;
  write(index: number): void;
  destroy(): void;
}

/**
 * Which parameters are already spoken for on this page. Two books both writing
 * "page" would overwrite each other's number on every turn, and both would jump
 * to the same page when the link is opened: whoever asks second is refused, and
 * says so, rather than the two of them fighting silently.
 */
const claimed = new Set<string>();

export function createDeepLink(param: string, onNavigate: (index: number) => void): DeepLink | null {
  if (claimed.has(param)) {
    console.warn(
      `flipview: "${param}" is already tracked by another book on this page. ` +
        "Give this one its own name, for example deepLink: \"page2\".",
    );

    return null;
  }

  claimed.add(param);

  function params(): URLSearchParams {
    return new URLSearchParams(location.hash.replace(/^#/, ""));
  }

  function read(): number | null {
    const raw = params().get(param);
    if (raw === null) return null;
    const page = Number(raw);
    return Number.isFinite(page) && page >= 1 ? Math.floor(page) - 1 : null;
  }

  function write(index: number): void {
    const next = params();
    next.set(param, String(index + 1));
    const hash = `#${decodeURIComponent(next.toString())}`;
    if (hash !== location.hash) history.replaceState(null, "", hash);
  }

  function onHashChange(): void {
    const index = read();
    if (index !== null) onNavigate(index);
  }

  window.addEventListener("hashchange", onHashChange);

  return {
    read,
    write,
    destroy() {
      window.removeEventListener("hashchange", onHashChange);
      claimed.delete(param);
    },
  };
}
