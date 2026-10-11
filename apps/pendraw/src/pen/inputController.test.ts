import { describe, expect, it, vi } from "vitest";
import { installPenInput } from "./inputController";

function setup(type = "freedraw", penMode = true) {
  const target = new EventTarget();
  const state = { activeTool: { type, locked: true }, selectedElementIds: { chosen: true },
    scrollX: 120, scrollY: -35, zoom: { value: 2 }, offsetLeft: 17, offsetTop: 48 };
  const api = {
    getAppState: () => state,
    setActiveTool: vi.fn((tool) => { state.activeTool = tool; }),
    getSceneElements: () => [{ id: "chosen", x: 25, y: 60, width: 10, height: 10 }],
    updateScene: vi.fn(),
  };
  const onLoop = vi.fn();
  const onLongPress = vi.fn();
  const dispose = installPenInput(target as unknown as Window, {
    getApi: () => api as any, penMode, onLoop, onLongPress,
    changeTool: (apply) => apply(), isCanvasTarget: () => true,
  });
  const emit = (kind: string, fields: Record<string, unknown> = {}) => {
    const event = new Event(kind, { cancelable: true });
    for (const [key, value] of Object.entries({ pointerId: 1, pointerType: "touch",
      buttons: 1, clientX: 317, clientY: 108, timeStamp: 0, ...fields })) {
      Object.defineProperty(event, key, { value });
    }
    target.dispatchEvent(event);
    return event;
  };
  return { target, state, api, onLoop, onLongPress, emit, dispose };
}

describe("pen-first native touch routing", () => {
  it('a hold on an unselected object deliberately enters Select after normal drawing',async()=>{
    const s=setup();s.emit('pointerdown');s.emit('pointerup',{timeStamp:500});await Promise.resolve();
    expect(s.state.activeTool.type).toBe('selection');
    expect(s.onLongPress).toHaveBeenCalledExactlyOnceWith(317,108);
    expect(s.api.updateScene).toHaveBeenCalledWith({appState:{selectedElementIds:{chosen:true}}});s.dispose();
  });
  it("uses hand before native pointerdown, forwards both fingers, and restores the pen after both lift", async () => {
    const s = setup();
    const nativeTools: string[] = [];
    s.target.addEventListener("pointerdown", () => nativeTools.push(s.state.activeTool.type));
    expect(s.emit("pointerdown").defaultPrevented).toBe(false);
    s.emit("pointerdown", { pointerId: 2 });
    expect(nativeTools).toEqual(["hand", "hand"]);
    s.emit("pointerup");
    await Promise.resolve();
    expect(s.state.activeTool.type).toBe("hand");
    s.emit("pointerup", { pointerId: 2 });
    await Promise.resolve();
    expect(s.state.activeTool).toEqual({ type: "freedraw", locked: true });
    s.dispose();
  });

  it("respects explicit Select and leaves selection movement to the engine", () => {
    const s = setup("selection");
    expect(s.emit("pointerdown").defaultPrevented).toBe(false);
    s.emit("pointermove", { clientX: 350, timeStamp: 500 });
    s.emit("pointerup", { clientX: 350, timeStamp: 700 });
    expect(s.api.setActiveTool).not.toHaveBeenCalled();
    expect(s.api.updateScene).not.toHaveBeenCalled();
    expect(s.onLongPress).not.toHaveBeenCalled();
    s.dispose();
  });

  it("opens a selection menu only on a genuine hold and release", () => {
    const s = setup("selection");
    s.emit("pointerdown");
    expect(s.emit("contextmenu", { timeStamp: 460 }).defaultPrevented).toBe(true);
    expect(s.onLongPress).not.toHaveBeenCalled();
    s.emit("pointerup", { timeStamp: 500 });
    expect(s.onLongPress).toHaveBeenCalledExactlyOnceWith(317, 108);
    s.dispose();
  });

  it("does not open the hold menu after cancellation or a second finger", () => {
    const s = setup("selection");
    s.emit("pointerdown");
    s.emit("pointercancel", { timeStamp: 500 });
    s.emit("pointerdown");
    s.emit("pointerdown", { pointerId: 2 });
    s.emit("pointerup", { timeStamp: 500 });
    expect(s.onLongPress).not.toHaveBeenCalled();
    s.dispose();
  });

  it("does not replace a tool deliberately chosen during touch navigation", async () => {
    const s = setup();
    s.emit("pointerdown");
    s.state.activeTool = { type: "rectangle", locked: false };
    s.emit("pointerup");
    await Promise.resolve();
    expect(s.state.activeTool.type).toBe("rectangle");
    s.dispose();
  });

  it("blocks a resting palm during pen contact without intercepting the pen", () => {
    const s = setup();
    expect(s.emit("pointerdown", { pointerType: "pen" }).defaultPrevented).toBe(false);
    expect(s.emit("pointerdown", { pointerId: 2 }).defaultPrevented).toBe(true);
    expect(s.api.setActiveTool).not.toHaveBeenCalled();
    s.dispose();
  });

  it("does not take navigation away from finger drawing when pen mode is off", () => {
    const s = setup("freedraw", false);
    expect(s.emit("pointerdown").defaultPrevented).toBe(false);
    expect(s.api.setActiveTool).not.toHaveBeenCalled();
    s.dispose();
  });

  it("keeps eraser contact native even after a barrel hover", () => {
    const s = setup();
    s.emit("pointermove", { pointerType: "pen", buttons: 2 });
    expect(s.emit("pointerdown", { pointerType: "pen", buttons: 32 }).defaultPrevented).toBe(false);
    expect(s.onLoop).not.toHaveBeenCalled();
    s.dispose();
  });

  it("barrel-lassoes the circled element after pan/zoom and blocks menu interruption", () => {
    const s = setup();
    s.emit("pointermove", { pointerType: "pen", buttons: 2 });
    s.emit("pointerdown", { pointerType: "pen", buttons: 1, clientX: 277, clientY: 68 });
    expect(s.emit("contextmenu").defaultPrevented).toBe(true);
    for (const [clientX, clientY] of [[357, 68], [357, 148], [277, 148]]) {
      s.emit("pointermove", { pointerType: "pen", clientX, clientY });
    }
    s.emit("pointerup", { pointerType: "pen", buttons: 0 });
    expect(s.api.updateScene).toHaveBeenCalledExactlyOnceWith({ appState: { selectedElementIds: { chosen: true } } });
    expect(s.state.activeTool.type).toBe("selection");
    s.dispose();
  });

  it("cancels an interrupted lasso rather than applying partial selection", () => {
    const s = setup();
    s.emit("pointerdown", { pointerType: "pen", buttons: 2 });
    s.emit("pointermove", { pointerType: "pen", clientX: 350 });
    s.emit("pointermove", { pointerType: "pen", clientY: 140 });
    s.emit("pointercancel", { pointerType: "pen" });
    expect(s.api.updateScene).not.toHaveBeenCalled();
    expect(s.onLoop).toHaveBeenLastCalledWith(null);
    s.dispose();
  });
});

it("rechecks navigation on a second contact after a tool change", () => {
  const s = setup();
  s.emit("pointerdown");
  s.state.activeTool = { type: "freedraw", locked: true };
  const tools: string[] = [];
  s.target.addEventListener("pointerdown", () => tools.push(s.state.activeTool.type));
  s.emit("pointerdown", { pointerId: 2 });
  expect(tools).toEqual(["hand"]);
  s.dispose();
});

it("a palm rejected during pen contact stays rejected until it lifts", async () => {
  const s = setup();
  s.emit("pointerdown", { pointerType: "pen", pointerId: 10 });
  s.emit("pointerdown", { pointerId: 2 });
  s.emit("pointerup", { pointerType: "pen", pointerId: 10 });
  expect(s.emit("pointermove", { pointerId: 2 }).defaultPrevented).toBe(true);
  expect(s.emit("pointerup", { pointerId: 2 }).defaultPrevented).toBe(true);
  expect(s.emit("pointerdown", { pointerId: 2 }).defaultPrevented).toBe(false);
  expect(s.state.activeTool.type).toBe("hand");
  s.emit("pointerup", { pointerId: 2 });
  await Promise.resolve();
  expect(s.state.activeTool.type).toBe("freedraw");
  s.dispose();
});

it("pen interrupts navigation without leaving a phantom finger or bypassing the next pan", async () => {
  const s = setup();
  s.emit("pointerdown", { pointerId: 1 });
  s.emit("pointerdown", { pointerType: "pen", pointerId: 10 });
  expect(s.state.activeTool.type).toBe("freedraw");
  s.emit("pointerup", { pointerType: "pen", pointerId: 10 });
  s.emit("pointerdown", { pointerId: 2 });
  expect(s.state.activeTool.type).toBe("hand");
  expect(s.emit("pointermove", { pointerId: 1 }).defaultPrevented).toBe(true);
  expect(s.emit("pointerup", { pointerId: 1 }).defaultPrevented).toBe(false);
  s.emit("pointerup", { pointerId: 2 });
  await Promise.resolve();
  expect(s.state.activeTool.type).toBe("freedraw");
  s.dispose();
});

it("finishes a barrel lasso on button release while the tip stays down and suppresses the remaining stroke", () => {
  const s=setup();
  s.emit("pointerdown",{pointerType:"pen",buttons:3,clientX:277,clientY:68});
  for (const [clientX,clientY] of [[357,68],[357,148],[277,148]]) s.emit("pointermove",{pointerType:"pen",buttons:3,clientX,clientY});
  expect(s.emit("pointermove",{pointerType:"pen",buttons:1,clientX:277,clientY:68}).defaultPrevented).toBe(true);
  expect(s.api.updateScene).toHaveBeenCalledExactlyOnceWith({appState:{selectedElementIds:{chosen:true}}});
  expect(s.emit("pointermove",{pointerType:"pen",buttons:1}).defaultPrevented).toBe(true);
  expect(s.emit("contextmenu").defaultPrevented).toBe(true);
  s.emit("pointerup",{pointerType:"pen",buttons:0});
  expect(s.emit("pointerdown",{pointerType:"pen",buttons:1}).defaultPrevented).toBe(false);
  s.dispose();
});

it('an empty barrel loop keeps the writing tool instead of switching to Select',()=>{
  const s=setup();s.emit('pointerdown',{pointerType:'pen',buttons:3,clientX:500,clientY:500});
  for(const [clientX,clientY] of [[550,500],[550,550],[500,550]])s.emit('pointermove',{pointerType:'pen',buttons:3,clientX,clientY});
  s.emit('pointerup',{pointerType:'pen',buttons:0});
  expect(s.state.activeTool.type).toBe('freedraw');expect(s.api.updateScene).not.toHaveBeenCalled();s.dispose();
});
