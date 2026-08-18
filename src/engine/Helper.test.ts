import { describe, expect, it } from "vitest";
import { Helper } from "./Helper";

// These cover the geometry helpers whose signatures we corrected while making the
// fork type-check: several of them return null, which upstream's types denied.

describe("distance and length", () => {
  it("measures between two points", () => {
    expect(Helper.GetDistanceBetweenTwoPoint({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("measures a segment", () => {
    expect(Helper.GetSegmentLength([{ x: 1, y: 1 }, { x: 4, y: 5 }])).toBe(5);
  });
});

describe("PointInRect", () => {
  const rect = { left: 10, top: 10, width: 100, height: 50 };

  it("returns the point when it is inside", () => {
    expect(Helper.PointInRect(rect, { x: 20, y: 20 })).toEqual({ x: 20, y: 20 });
  });

  it("returns null when it is outside", () => {
    expect(Helper.PointInRect(rect, { x: 200, y: 20 })).toBeNull();
  });

  it("passes a null point straight through", () => {
    expect(Helper.PointInRect(rect, null)).toBeNull();
  });
});

// Despite the name, startPoint is not a pivot: the point is rotated clockwise
// about the origin and startPoint is then added as a translation. Worth pinning
// down, because the name reads the other way round.
describe("GetRotatedPoint", () => {
  it("rotates clockwise about the origin", () => {
    const p = Helper.GetRotatedPoint({ x: 1, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-1);
  });

  it("adds startPoint as a translation, it is not a pivot", () => {
    const p = Helper.GetRotatedPoint({ x: 1, y: 0 }, { x: 5, y: 5 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(4);
  });

  it("leaves a point alone at angle zero", () => {
    expect(Helper.GetRotatedPoint({ x: 2, y: 3 }, { x: 0, y: 0 }, 0)).toEqual({ x: 2, y: 3 });
  });
});

describe("segment intersection", () => {
  const border = { left: 0, top: 0, width: 100, height: 100 };
  const horizontal: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ];

  it("finds a crossing inside the border", () => {
    const hit = Helper.GetIntersectBetweenTwoSegment(border, horizontal, [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    expect(hit).toEqual({ x: 50, y: 50 });
  });

  it("returns null when the segments miss", () => {
    const miss = Helper.GetIntersectBetweenTwoSegment(border, horizontal, [
      { x: 0, y: 80 },
      { x: 100, y: 80 },
    ]);
    expect(miss).toBeNull();
  });

  it("returns null when the crossing falls outside the border", () => {
    const outside = Helper.GetIntersectBetweenTwoSegment(border, horizontal, [
      { x: 300, y: 0 },
      { x: 300, y: 100 },
    ]);
    expect(outside).toBeNull();
  });
});

describe("GetCordsFromTwoPoint", () => {
  it("walks from one point to the other, ends included", () => {
    const path = Helper.GetCordsFromTwoPoint({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 10, y: 0 });
    expect(path.length).toBeGreaterThan(2);
  });
});
