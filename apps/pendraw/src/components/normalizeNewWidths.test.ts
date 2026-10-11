import { describe, it, expect, vi } from "vitest";
import { normalizeNewWidths, FREEDRAW_FACTOR } from "./StrokeWidthSlider";

// A minimal ExcalidrawImperativeAPI stand-in: we only exercise updateScene.
function fakeApi() {
  const updateScene = vi.fn();
  return { api: { updateScene } as any, updateScene };
}

const rect = (id: string, sw: number, extra: any = {}) => ({
  id,
  type: "rectangle",
  strokeWidth: sw,
  version: 1,
  isDeleted: false,
  width: 100,
  height: 80,
  ...extra,
});

const VISUAL = 0.5;

describe("normalizeNewWidths", () => {
  it("scales a finished line/shape up to pen-equivalent thickness", () => {
    const { api, updateScene } = fakeApi();
    const els = [rect("r1", VISUAL)];
    normalizeNewWidths(api, els, VISUAL, new Set(), {});
    expect(updateScene).toHaveBeenCalledTimes(1);
    const next = updateScene.mock.calls[0][0].elements;
    expect(next[0].strokeWidth).toBeCloseTo(VISUAL * FREEDRAW_FACTOR);
  });

  it("leaves the element being drawn untouched (the shape-becomes-a-dot bug)", () => {
    const { api, updateScene } = fakeApi();
    const drawing = rect("r1", VISUAL, { width: 2, height: 1 }); // still tiny, mid-drag
    const seen = new Set<string>();
    normalizeNewWidths(api, [drawing], VISUAL, seen, { newElement: { id: "r1" } });
    // Not rewritten mid-gesture...
    expect(updateScene).not.toHaveBeenCalled();
    // ...and NOT marked seen, so it can still be normalized once finalized.
    expect(seen.has("r1")).toBe(false);
  });

  it("normalizes the shape once the gesture ends", () => {
    const { api, updateScene } = fakeApi();
    const seen = new Set<string>();
    const el = rect("r1", VISUAL, { width: 2, height: 1 });
    // 1st onChange: still being drawn -> skipped.
    normalizeNewWidths(api, [el], VISUAL, seen, { newElement: { id: "r1" } });
    // 2nd onChange: released (newElement cleared), now at full size.
    const finished = rect("r1", VISUAL, { width: 220, height: 150 });
    normalizeNewWidths(api, [finished], VISUAL, seen, { newElement: null });
    expect(updateScene).toHaveBeenCalledTimes(1);
    expect(updateScene.mock.calls[0][0].elements[0].strokeWidth).toBeCloseTo(VISUAL * FREEDRAW_FACTOR);
  });

  it("never scales freedraw (pen) strokes", () => {
    const { api, updateScene } = fakeApi();
    const pen = { id: "p1", type: "freedraw", strokeWidth: VISUAL, version: 1, isDeleted: false };
    normalizeNewWidths(api, [pen], VISUAL, new Set(), {});
    expect(updateScene).not.toHaveBeenCalled();
  });

  it("does not re-scale an already-seen element", () => {
    const { api, updateScene } = fakeApi();
    const seen = new Set<string>(["r1"]);
    normalizeNewWidths(api, [rect("r1", VISUAL)], VISUAL, seen, {});
    expect(updateScene).not.toHaveBeenCalled();
  });
});
