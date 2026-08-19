import { describe, expect, it } from "vitest";
import { palmdoc } from "./decompress";
import { kf8Sections, mobiSections } from "./index";

/** The packer is Amazon's; these are the shapes it produces, by hand. */
describe("palmdoc", () => {
  it("passes plain bytes through", () => {
    expect([...palmdoc(Uint8Array.from([65, 66, 67]))]).toEqual([65, 66, 67]);
  });

  it("copies a run of literals", () => {
    // 3 means "the next three bytes are themselves", which is how a byte over
    // 0x7f is written when it means itself.
    expect([...palmdoc(Uint8Array.from([3, 200, 201, 202]))]).toEqual([200, 201, 202]);
  });

  it("reads a space and a letter out of one byte", () => {
    expect([...palmdoc(Uint8Array.from([0xc1 + 0x20]))]).toEqual([0x20, 0x41 + 0x20]);
  });

  it("copies from what it has already written", () => {
    // "ab", then: go back 2, take 3. Overlapping on purpose, which is how a
    // repeated pair is packed.
    const pair = 0x8000 | (2 << 3) | (3 - 3);
    const out = palmdoc(Uint8Array.from([97, 98, pair >> 8, pair & 0xff]));

    expect(String.fromCharCode(...out)).toBe("ababa");
  });
});

describe("mobiSections", () => {
  it("makes a section of each page break", () => {
    const text = "<html><body>One<mbp:pagebreak/>Two<mbp:pagebreak/>Three</body></html>";

    expect(mobiSections(text)).toEqual(["One", "Two", "Three"]);
  });

  it("keeps a book with no breaks in one piece", () => {
    expect(mobiSections("<html><body>All of it</body></html>")).toEqual(["All of it"]);
  });
});

describe("kf8Sections", () => {
  const book =
    '<?xml version="1.0"?><html><head><title>One</title></head><body></body></html>' +
    "<p>The first chapter</p>" +
    '<html><head><title>Two</title></head><body></body></html>' +
    "<p>The second chapter</p>";

  it("splits where one document ends and the next begins", () => {
    expect(kf8Sections(book)).toEqual(["<p>The first chapter</p>", "<p>The second chapter</p>"]);
  });

  it("keeps what a document holds after its own body, which is where it is", () => {
    expect(kf8Sections(book)[0]).toContain("first chapter");
  });

  it("leaves out a document that says nothing", () => {
    expect(kf8Sections("<html><head><title>Empty</title></head><body></body></html>")).toEqual([]);
  });
});
