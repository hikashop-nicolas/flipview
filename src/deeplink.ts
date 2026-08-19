/**
 * Keeps a place in the URL hash, so a reader can link to where they are and
 * someone else can land there. Other hash parameters are preserved, which matters
 * when a host already uses the hash for something else.
 *
 * What the place *is* stays the document's business: this stores a string. For a
 * PDF it is a page number, for a book that reflows it is something the pagination
 * cannot invalidate.
 */
export interface DeepLink {
  read(): string | null;
  write(value: string): void;
  destroy(): void;
}

/**
 * Which parameters are already spoken for on this page. Two books both writing
 * "page" would overwrite each other's number on every turn, and both would jump
 * to the same page when the link is opened: whoever asks second is refused, and
 * says so, rather than the two of them fighting silently.
 */
const claimed = new Set<string>();

export function createDeepLink(
  param: string,
  onNavigate: (value: string) => void,
): DeepLink | null {
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

  function read(): string | null {
    return params().get(param);
  }

  function write(value: string): void {
    const next = params();
    next.set(param, value);
    const hash = `#${decodeURIComponent(next.toString())}`;
    if (hash !== location.hash) history.replaceState(null, "", hash);
  }

  function onHashChange(): void {
    const value = read();
    if (value !== null) onNavigate(value);
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
