// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderHotspots, type Hotspot } from "./hotspots";

const spot = (extra: Partial<Hotspot> = {}): Hotspot => ({
  page: 0,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.4,
  ...extra,
});

function page(): HTMLElement {
  return document.createElement("div");
}

describe("renderHotspots", () => {
  it("places a region as percentages of the page", () => {
    const el = page();
    renderHotspots(el, [spot()], { goTo: () => {} });
    const hot = el.querySelector<HTMLElement>(".fv-hotspot")!;
    expect(hot.style.left).toBe("10%");
    expect(hot.style.top).toBe("20%");
    expect(hot.style.width).toBe("30%");
    expect(hot.style.height).toBe("40%");
  });

  it("clamps coordinates that fall outside the page", () => {
    const el = page();
    renderHotspots(el, [spot({ x: -1, width: 4, y: Number.NaN })], { goTo: () => {} });
    const hot = el.querySelector<HTMLElement>(".fv-hotspot")!;
    expect(hot.style.left).toBe("0%");
    expect(hot.style.width).toBe("100%");
    expect(hot.style.top).toBe("0%");
  });

  it("is a link when it goes somewhere and a button when it does not", () => {
    const el = page();
    renderHotspots(el, [spot({ href: "https://example.com" }), spot()], { goTo: () => {} });
    const [first, second] = [...el.querySelectorAll(".fv-hotspot")];
    expect(first.tagName).toBe("A");
    expect(second.tagName).toBe("BUTTON");
  });

  it("names itself for a reader, and falls back to a generic name", () => {
    const el = page();
    renderHotspots(el, [spot({ label: "Blue kettle" }), spot()], { goTo: () => {} });
    const [first, second] = [...el.querySelectorAll(".fv-hotspot")];
    expect(first.getAttribute("aria-label")).toBe("Blue kettle");
    expect(second.getAttribute("aria-label")).toBeTruthy();
  });

  it("turns to the page it names", () => {
    const el = page();
    const goTo = vi.fn();
    renderHotspots(el, [spot({ goToPage: 5 })], { goTo });
    el.querySelector<HTMLElement>(".fv-hotspot")!.click();
    expect(goTo).toHaveBeenCalledWith(5);
  });

  it("lets the host take it over by refusing", () => {
    const el = page();
    const goTo = vi.fn();
    const onUse = vi.fn(() => false);
    renderHotspots(el, [spot({ goToPage: 5 })], { goTo, onUse });
    el.querySelector<HTMLElement>(".fv-hotspot")!.click();
    expect(onUse).toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
  });

  it("hands the host its own data back", () => {
    const el = page();
    const onUse = vi.fn();
    renderHotspots(el, [spot({ data: { product: "42" } })], { goTo: () => {}, onUse });
    el.querySelector<HTMLElement>(".fv-hotspot")!.click();
    expect(onUse.mock.calls[0][0].data).toEqual({ product: "42" });
  });

  it("replaces what was there rather than piling up", () => {
    const el = page();
    renderHotspots(el, [spot(), spot()], { goTo: () => {} });
    renderHotspots(el, [spot()], { goTo: () => {} });
    expect(el.querySelectorAll(".fv-hotspots")).toHaveLength(1);
    expect(el.querySelectorAll(".fv-hotspot")).toHaveLength(1);
  });

  it("adds nothing at all to a page without any", () => {
    const el = page();
    renderHotspots(el, [], { goTo: () => {} });
    expect(el.querySelector(".fv-hotspots")).toBeNull();
  });
});
