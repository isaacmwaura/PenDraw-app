import type { Pt } from "../lasso/hitTest";

export type CanvasViewport = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
};

// Scroll is a translation applied TO the scene, not the top-left scene point.
export function clientToScene(x: number, y: number, view: CanvasViewport): Pt {
  return {
    x: (x - view.offsetLeft) / view.zoom.value - view.scrollX,
    y: (y - view.offsetTop) / view.zoom.value - view.scrollY,
  };
}

export function sceneToClient(x: number, y: number, view: CanvasViewport): Pt {
  return {
    x: (x + view.scrollX) * view.zoom.value + view.offsetLeft,
    y: (y + view.scrollY) * view.zoom.value + view.offsetTop,
  };
}

export function sameViewport(a: CanvasViewport, b: CanvasViewport): boolean {
  return a.scrollX === b.scrollX && a.scrollY === b.scrollY &&
    a.zoom.value === b.zoom.value && a.offsetLeft === b.offsetLeft && a.offsetTop === b.offsetTop;
}
