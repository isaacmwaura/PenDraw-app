import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediate" },
  convertToExcalidrawElements: (specs: any[]) => specs.map((e, i) => ({ ...e, id: `text${i}` })),
  newElementWith: (e: any, updates: any) => ({ ...e, ...updates, version: e.version + 1 }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
import { invoke } from "@tauri-apps/api/core";
import { analyzeSelection, applyBlocks } from "./recognize";
const stroke = (id: string) => ({ id, type: "freedraw", x: 10, y: 20, points: [[0, 0], [30, 15]], version: 1, versionNonce: 5 });
function setup() {
  let elements: any[] = [stroke("a"), stroke("b")];
  const api: any = {
    getSceneElements: () => elements.filter(e => !e.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    getAppState: () => ({ selectedElementIds: { a: true, b: true } }),
    updateScene: vi.fn((scene) => { elements = scene.elements; }),
  };
  return { api, elements };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("window", { alert: vi.fn() }); });
it("does not apply recognition to ink that changed while the engine was reading", async () => {
  const { api, elements } = setup();
  let resolve!: (value: any) => void;
  vi.mocked(invoke).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as any);
  const analysis = analyzeSelection(api);
  elements[0].x = 500; elements[0].version++;
  resolve([{ text: "Word", x: 10, y: 20, width: 30, height: 15, stroke_indices: [0] }]);
  const result = await analysis;
  expect(result!.ink[0].x).toBe(10);
  expect(applyBlocks(api, result!)).toBe(false);
  expect(api.updateScene).not.toHaveBeenCalled();
});
it("keeps unrelated and previously deleted ink when converting one block", async () => {
  const { api, elements } = setup();
  elements.push({ ...stroke("older"), isDeleted: true });
  vi.mocked(invoke).mockResolvedValueOnce([{ text: "Word", x: 10, y: 20, width: 30, height: 15, stroke_indices: [0, -1, 2, 0.5] }]);
  const result = await analyzeSelection(api);
  expect(result!.blocks[0].stroke_indices).toEqual([0]);
  expect(applyBlocks(api, result!)).toBe(true);
  const all = api.getSceneElementsIncludingDeleted();
  expect(all.find((e: any) => e.id === "a")).toMatchObject({ isDeleted: true, version: 2 });
  expect(all.find((e: any) => e.id === "b").isDeleted).toBeUndefined();
  expect(all.find((e: any) => e.id === "older").isDeleted).toBe(true);
  expect(all.filter((e: any) => e.type === "text")).toHaveLength(1);
});

it("uses one size for all blocks, unchanged when a block is excluded", async () => {
  const { api } = setup();
  vi.mocked(invoke).mockResolvedValueOnce([
    { text: "Short", x: 10, y: 20, width: 30, height: 20, stroke_indices: [0] },
    { text: "Tall", x: 10, y: 60, width: 30, height: 50, stroke_indices: [1] },
  ]);
  const result = (await analyzeSelection(api))!;
  expect(result.fontSize).toBe(28);
  expect(applyBlocks(api, result)).toBe(true);
  const converted = api.getSceneElements().filter((e: any) => e.type === "text");
  expect(converted.map((e: any) => e.fontSize)).toEqual([28, 28]);
  expect(converted.map((e: any) => [e.x, e.y])).toEqual([[10, 20], [10, 60]]);
  const second = setup();
  expect(applyBlocks(second.api, { ...result, blocks: [result.blocks[0]] })).toBe(true);
  expect(second.api.getSceneElements().find((e: any) => e.type === "text").fontSize).toBe(28);
});

it("automatically marks suspected drawings and leaves their strokes intact", async () => {
  const { api } = setup();
  vi.mocked(invoke).mockResolvedValueOnce([
    { text: "Word", x: 10, y: 20, width: 30, height: 25, stroke_indices: [0] },
    { text: "′", x: 50, y: 20, width: 30, height: 100, stroke_indices: [1] },
  ]);
  const result = (await analyzeSelection(api))!;
  expect(result.blocks.map(b => b.keepAsInk)).toEqual([false, true]);
  expect(result.fontSize).toBe(20);
  expect(applyBlocks(api, { ...result, blocks: result.blocks.filter(b => !b.keepAsInk) })).toBe(true);
  expect(api.getSceneElements().find((e: any) => e.id === "b")).toBeDefined();
});

it('sends clearly separated rows independently and remaps native stroke ownership',async()=>{
  const {api,elements}=setup();elements[1].y=120;
  vi.mocked(invoke).mockResolvedValueOnce([{text:'Top',x:10,y:20,width:30,height:15,stroke_indices:[0]}])
    .mockResolvedValueOnce([{text:'Bottom',x:10,y:120,width:30,height:15,stroke_indices:[0]}]);
  const result=(await analyzeSelection(api))!;
  expect(vi.mocked(invoke).mock.calls).toHaveLength(2);
  expect(result.blocks.map(b=>b.stroke_indices)).toEqual([[0],[1]]);
  expect(applyBlocks(api,result)).toBe(true);
  expect(api.getSceneElements().filter((e:any)=>e.type==='text').map((e:any)=>e.y)).toEqual([20,120]);
});
