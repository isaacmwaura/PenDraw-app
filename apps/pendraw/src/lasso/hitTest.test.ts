import { describe, it, expect } from "vitest";
import { pointInPolygon, elementsInsideLasso, type Pt } from "./hitTest";

// A 100x100 square loop from (0,0) to (100,100).
const square: Pt[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const el = (id: string, x: number, y: number, width = 10, height = 10) => ({
  id,
  x,
  y,
  width,
  height,
});

describe("pointInPolygon", () => {
  it("detects a point inside the loop", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it("detects a point outside the loop", () => {
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
  });
});

describe("elementsInsideLasso", () => {
  it("selects elements whose centre is inside the loop", () => {
    const elements = [
      el("in", 40, 40), // centre (45,45) — inside
      el("out", 200, 200), // centre (205,205) — outside
    ];
    expect(elementsInsideLasso(elements, square)).toEqual(["in"]);
  });

  it("ignores deleted elements", () => {
    const elements = [{ ...el("gone", 40, 40), isDeleted: true }];
    expect(elementsInsideLasso(elements, square)).toEqual([]);
  });

  it("returns nothing for a degenerate loop (fewer than 3 points)", () => {
    expect(elementsInsideLasso([el("a", 40, 40)], [{ x: 0, y: 0 }])).toEqual([]);
  });

  it("selects multiple enclosed elements", () => {
    const elements = [el("a", 10, 10), el("b", 70, 70), el("c", 300, 300)];
    expect(elementsInsideLasso(elements, square).sort()).toEqual(["a", "b"]);
  });
});
