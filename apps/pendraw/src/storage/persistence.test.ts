import { afterEach, expect, it, vi } from "vitest";
vi.mock("@excalidraw/excalidraw", () => ({ serializeAsJSON: vi.fn(), loadFromBlob: vi.fn() }));
import { saveEditorScene } from "./persistence";
afterEach(() => vi.unstubAllGlobals());
it("reports failed recovery rather than pretending storage succeeded", () => {
  vi.stubGlobal("localStorage", { setItem: () => { throw new Error("Storage denied"); } });
  expect(saveEditorScene([], {}, {})).toBe("failed");
});
it("reports partial recovery and retains the previous image cache if images exceed storage", () => {
  const saved = new Map([['pendraw:editor-files', '{"oldImage":{}}']]);
  vi.stubGlobal("localStorage", { setItem: (key: string, value: string) => {
    if (key.endsWith("files")) throw new Error("Quota exceeded");
    saved.set(key, value);
  } });
  expect(saveEditorScene([{ id: "ink" }], {}, { newImage: {} })).toBe("partial");
  expect(saved.get("pendraw:editor-files")).toBe('{"oldImage":{}}');
  expect(saved.get("pendraw:editor-scene")).toContain('"ink"');
});
