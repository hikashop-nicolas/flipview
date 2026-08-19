// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createPanel } from "./panel";

const target = () => ({ goTo: vi.fn(), pageCount: 12, preview: vi.fn(async () => null) });

describe("createPanel", () => {
  it("starts hidden, so a book does not open with a panel over it", () => {
    expect(createPanel(target()).el.hidden).toBe(true);
  });

  it("caps itself to the height it is given", () => {
    const panel = createPanel(target());
    panel.fit(420);
    // Without a real cap the thumbnails grow the flex line and push the toolbar
    // down the page, which is what a percentage cap did.
    expect(panel.el.style.maxHeight).toBe("420px");
  });

  it("drops the cap rather than collapsing when there is no height yet", () => {
    const panel = createPanel(target());
    panel.fit(420);
    panel.fit(0);
    expect(panel.el.style.maxHeight).toBe("");
  });

  it("scrolls the list rather than the panel", () => {
    const panel = createPanel(target());
    expect(panel.el.querySelector(".fv-panel-list")).not.toBeNull();
  });
});
