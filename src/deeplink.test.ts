// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createDeepLink } from "./deeplink";

describe("createDeepLink", () => {
  it("tracks the page it is given", () => {
    const link = createDeepLink("first", vi.fn())!;
    link.write(11);
    expect(location.hash).toContain("first=12");
    link.destroy();
  });

  it("refuses a name another book on the page already tracks", () => {
    const first = createDeepLink("shared", vi.fn());
    const second = createDeepLink("shared", vi.fn());

    // Two books both writing "page" would overwrite each other on every turn.
    expect(first).not.toBeNull();
    expect(second).toBeNull();

    first!.destroy();
  });

  it("frees the name when the book is destroyed", () => {
    createDeepLink("reusable", vi.fn())!.destroy();
    const again = createDeepLink("reusable", vi.fn());
    expect(again).not.toBeNull();
    again!.destroy();
  });

  it("lets a second book have its own name", () => {
    const one = createDeepLink("page", vi.fn());
    const two = createDeepLink("page2", vi.fn());
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    one!.destroy();
    two!.destroy();
  });
});
