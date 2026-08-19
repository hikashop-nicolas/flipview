// Films a page turn, frame by frame, with the DOM as it was in each frame.
//
//   node tools/film.mjs <url> [outPrefix] [turnsForward]
//
// A fold lasts under a second and a screenshot through a browser-automation tool
// takes about as long, so the middle of an animation cannot be caught that way:
// every capture lands after it has finished. This drives headless Chrome itself,
// so the frames are whatever the page was actually showing, and prints what was
// drawn in each one. Point it at a page that sets a long flippingTime.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG = 9345;
const OUT = process.argv[3] || "/private/tmp/claude-501/-Users-nicolasclaverie-dev/e3c6dfb8-d4ed-4e65-a005-4a449434ecab/scratchpad/film";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = await mkdtemp(join(tmpdir(), "film-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`,
  "--window-size=1200,900", "--hide-scrollbars", "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });

let socket = null;
try {
  let list = null;
  for (let n = 0; n < 40 && !list; n++) { await wait(250); try { list = await (await fetch(`http://localhost:${DEBUG}/json/list`)).json(); } catch {} }
  const page = list.find((t) => t.type === "page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = no; });

  let id = 0; const pending = new Map();
  socket.onmessage = (e) => { const m = JSON.parse(e.data); const w = pending.get(m.id); if (!w) return; pending.delete(m.id); m.error ? w.no(new Error(m.error.message)) : w.ok(m.result); };
  const send = (method, params = {}) => new Promise((ok, no) => { const mine = ++id; pending.set(mine, { ok, no }); socket.send(JSON.stringify({ id: mine, method, params })); });
  const evaluate = async (expression) => {
    const a = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (a.exceptionDetails) throw new Error(a.exceptionDetails.text + " " + JSON.stringify(a.exceptionDetails.exception?.description ?? ""));
    return a.result.value;
  };

  await send("Page.enable");
  await send("Page.navigate", { url: process.argv[2] });
  for (let n = 0; n < 60; n++) { await wait(250); if (await evaluate("!!document.querySelector('.fv-toolbar')")) break; }
  await wait(1500);

  const click = (title) => evaluate(`[...document.querySelectorAll('.fv-toolbar button')].find(b => b.title === ${JSON.stringify(title)}).click(), 'ok'`);

  const times = Number(process.argv[4] || 1);
  for (let n = 0; n < times; n++) { await click("Next page"); await wait(7000); }
  console.log("on spread:", await evaluate("document.querySelector('.fv-page-input')?.value ?? '?'"));

  await click("Previous page");

  for (let n = 0; n < 9; n++) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(`${OUT}-${String(n).padStart(2, "0")}.png`, Buffer.from(shot.data, "base64"));
    const state = await evaluate([
      "[...document.querySelectorAll('#stage *')]",
      ".filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 4)",
      ".map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);",
      "  return el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0,2).join('.')",
      "    + ' x' + Math.round(r.x) + '-' + Math.round(r.right) + ' bg' + s.backgroundColor + ' z' + s.zIndex; })",
      ".join(' | ')",
    ].join(""));
    console.log(`--- frame ${n}\n${state}`);
    await wait(600);
  }
  console.log("frames written to", OUT);
} finally {
  socket?.close(); chrome.kill();
  await new Promise((done) => chrome.once("exit", done));
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
}
