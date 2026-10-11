import { describe, expect, it } from "vitest";
import { clientToScene, sceneToClient } from "./coordinates";
import { elementsInsideLasso } from "../lasso/hitTest";

describe("canvas coordinates after pan and zoom", () => {
  const view = { scrollX: 120, scrollY: -35, zoom: { value: 2 }, offsetLeft: 17, offsetTop: 48 };
  it("puts a known scene point under the corresponding physical pointer", () => {
    expect(sceneToClient(30, 65, view)).toEqual({ x: 317, y: 108 });
    expect(clientToScene(317, 108, view)).toEqual({ x: 30, y: 65 });
  });
  it("selects the element circled on a panned and zoomed canvas", () => {
    const loop = [[277, 68], [357, 68], [357, 148], [277, 148]]
      .map(([x, y]) => clientToScene(x, y, view));
    expect(elementsInsideLasso([
      { id: "circled", x: 25, y: 60, width: 10, height: 10 },
      { id: "outside", x: -215, y: 130, width: 10, height: 10 },
    ], loop)).toEqual(["circled"]);
  });
  it("moves the displayed scene right when grab-pan scroll increases", () => {
    const before = sceneToClient(30, 65, view);
    const after = sceneToClient(30, 65, { ...view, scrollX: view.scrollX + 20 / view.zoom.value });
    expect(after.x - before.x).toBe(20);
  });
});
