import { describe, expect, it } from "vitest";
import { comicPages } from "./comic";

describe("comicPages", () => {
  it("reads the numbers the way a person does", () => {
    expect(comicPages(["p9.jpg", "p10.jpg", "p1.jpg"])).toEqual(["p1.jpg", "p9.jpg", "p10.jpg"]);
  });

  it("keeps a folder of pages in its own order", () => {
    expect(comicPages(["ch2/01.png", "ch1/02.png", "ch1/01.png"])).toEqual([
      "ch1/01.png",
      "ch1/02.png",
      "ch2/01.png",
    ]);
  });

  it("leaves out what is not a page", () => {
    expect(
      comicPages(["ComicInfo.xml", "cover.jpg", "pages/", "__MACOSX/._cover.jpg", ".DS_Store"])
    ).toEqual(["cover.jpg"]);
  });

  it("does not care how the extension is spelled", () => {
    expect(comicPages(["A.JPEG", "b.WebP"])).toEqual(["A.JPEG", "b.WebP"]);
  });
});
