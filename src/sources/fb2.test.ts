// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { convert } from "./fb2";

const parse = (xml: string): Element =>
  new DOMParser().parseFromString(
    `<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"
       xmlns:l="http://www.w3.org/1999/xlink">${xml}</FictionBook>`,
    "text/xml"
  ).documentElement.firstElementChild as Element;

describe("convert", () => {
  it("turns a section into a section, and its title into a heading", () => {
    const html = convert(parse("<section><title><p>One</p></title><p>Text</p></section>"), new Map(), 1);

    expect(html).toBe("<section><h2><p>One</p></h2><p>Text</p></section>");
  });

  it("keeps the marks inside a paragraph", () => {
    const html = convert(parse("<p>a <emphasis>b</emphasis> <strong>c</strong></p>"), new Map(), 1);

    expect(html).toBe("<p>a <em>b</em> <strong>c</strong></p>");
  });

  it("points a picture at the binary it names", () => {
    const pictures = new Map([["cover.jpg", "blob:x"]]);
    const html = convert(parse('<p><image l:href="#cover.jpg" alt="A cover"/></p>'), pictures, 1);

    expect(html).toBe('<p><img src="blob:x" alt="A cover"></p>');
  });

  it("leaves out a picture the book does not carry", () => {
    expect(convert(parse('<p><image l:href="#gone.jpg"/></p>'), new Map(), 1)).toBe("<p></p>");
  });

  it("escapes what the text says, so a book cannot write markup", () => {
    const html = convert(parse("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>"), new Map(), 1);

    expect(html).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>");
  });

  it("keeps the children of an element it does not know", () => {
    expect(convert(parse("<whatever><p>Still here</p></whatever>"), new Map(), 1)).toBe(
      "<p>Still here</p>"
    );
  });

  it("lays a poem out line by line", () => {
    const html = convert(parse("<poem><stanza><v>One</v><v>Two</v></stanza></poem>"), new Map(), 1);

    expect(html).toBe(
      '<div class="fv-fb2-poem"><div class="fv-fb2-stanza">' +
        '<p class="fv-fb2-verse">One</p><p class="fv-fb2-verse">Two</p></div></div>'
    );
  });
});
