import { describe, expect, it } from "vitest";
import { renderRustle } from "./sound";

// What separates paper from wind is that paper is made of many discrete
// transients. These tests pin that down, so a future "simplification" of the
// synthesis into a smooth noise burst fails rather than quietly sounding wrong.

const RATE = 48000;
const LENGTH = Math.floor(RATE * 0.36);

function render(): Float32Array {
  const data = new Float32Array(LENGTH);
  renderRustle(data, RATE);
  return data;
}

/** Counts sharp rises: the attack of a grain, not a smooth swell. */
function transients(data: Float32Array): number {
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (Math.abs(data[i]) - Math.abs(data[i - 1]) > 0.08) count++;
  }
  return count;
}

function energy(data: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let i = Math.floor(from * data.length); i < Math.floor(to * data.length); i++) {
    sum += data[i] * data[i];
  }
  return sum;
}

describe("the page turn", () => {
  it("is made of many transients, not one burst", () => {
    expect(transients(render())).toBeGreaterThan(40);
  });

  it("stays within range", () => {
    const data = render();
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.5);
  });

  it("carries most of its energy through the middle, where the page moves", () => {
    const data = render();
    expect(energy(data, 0.25, 0.75)).toBeGreaterThan(energy(data, 0, 0.15) + energy(data, 0.9, 1));
  });

  it("sounds different every time, as two real turns do", () => {
    const a = render();
    const b = render();
    let same = 0;
    for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
    expect(same).toBeLessThan(a.length * 0.5);
  });

  it("is deterministic when the randomness is", () => {
    const seeded = () => {
      let n = 1;
      return () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
    };
    const a = new Float32Array(LENGTH);
    const b = new Float32Array(LENGTH);
    renderRustle(a, RATE, seeded());
    renderRustle(b, RATE, seeded());
    expect(Array.from(a.slice(0, 500))).toEqual(Array.from(b.slice(0, 500)));
  });
});
