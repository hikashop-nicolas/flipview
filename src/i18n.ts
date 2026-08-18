// Every user-visible string in one place. Hosts override what they need:
// setStrings({ next: "Page suivante" }). Keys stay English.
const EN = {
  first: "First page",
  prev: "Previous page",
  next: "Next page",
  last: "Last page",
  pageOf: "Page {page} of {total}",
  goToPage: "Go to page",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  close: "Close",
  download: "Download",
  share: "Copy a link to this page",
  shared: "Link copied",
  shareFailed: "Copy this link",
};

export type Strings = typeof EN;

let current: Strings = { ...EN };

export function setStrings(partial: Partial<Strings>): void {
  current = { ...current, ...partial };
}

export function t(key: keyof Strings, vars?: Record<string, string | number>): string {
  const raw = current[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => String(vars[name] ?? m));
}
