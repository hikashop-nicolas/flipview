// Emits the HTML for demo/sample.pdf: a 12-page neutral sample document.
const PALETTE = ["#1976D2", "#0D5AA7", "#42A5F5", "#64B5F6", "#1F8EEB", "#155FA0"];
const TITLES = [
  "Spring collection", "Materials", "Care and washing", "Size guide",
  "The workshop", "Colour range", "Accessories", "Packaging",
  "Shipping", "Returns", "Contact",
];
const body = (n) => `
  <p>This is page ${n} of a generated sample document. It exists so the viewer has
  something multi-page to render, and carries no real content.</p>
  <p>Each page has a heading, a block of text and a colour panel, which makes a page
  turn easy to see while the animation is running.</p>`;

let out = `<!doctype html><meta charset="utf-8"><style>
  @page { size: 210mm 297mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.7 Helvetica, Arial, sans-serif; color: #223; }
  section { width: 210mm; height: 297mm; padding: 28mm 24mm; page-break-after: always;
            position: relative; overflow: hidden; }
  h2 { font-size: 34px; margin: 0 0 6mm; color: #0D5AA7; letter-spacing: -.5px; }
  .panel { height: 70mm; border-radius: 6mm; margin: 10mm 0; }
  .num { position: absolute; bottom: 16mm; right: 24mm; color: #9aa4b1; font-weight: 700; }
  .cover { background: #1976D2; color: #fff; display: flex; flex-direction: column;
           justify-content: center; }
  .cover h1 { font-size: 62px; margin: 0; letter-spacing: -2px; }
  .cover p { font-size: 22px; opacity: .9; }
</style>
<section class="cover"><h1>Sample catalogue</h1><p>A generated document for the flipview demo</p></section>`;

for (let i = 0; i < TITLES.length; i++) {
  out += `<section><h2>${TITLES[i]}</h2>${body(i + 2)}
  <div class="panel" style="background:${PALETTE[i % PALETTE.length]}"></div>
  <span class="num">${i + 2}</span></section>`;
}
console.log(out);
