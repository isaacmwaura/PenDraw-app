import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { clientToScene, type CanvasViewport } from "../board/coordinates";
import { elementsInsideLasso, type Pt } from "../lasso/hitTest";

type Tool = ReturnType<ExcalidrawImperativeAPI["getAppState"]>["activeTool"];
type Options = {
  getApi: () => ExcalidrawImperativeAPI | null;
  penMode: boolean;
  onLoop: (points: Pt[] | null) => void;
  onLongPress?: (x: number, y: number) => void;
  changeTool: (apply: () => void) => void;
  suppressDrawing?: boolean;
  isCanvasTarget?: (target: EventTarget | null) => boolean;
};

// Temporarily use the real hand tool for touch navigation. Native
// freedraw+penMode disables pinch scaling. Flush the tool change before the
// canvas receives pointerdown; restore after its last pointerup finishes.
export function installPenInput(target: Window, options: Options): () => void {
  const touches = new Set<number>();
  const palms = new Set<number>();
  const forwardedPalms = new Set<number>();
  const isCanvas = options.isCanvasTarget ?? ((t) =>
    t instanceof Element && !!t.closest(".excalidraw canvas"));
  let pen: number | null = null;
  let armed = false;
  let previousTool: Tool | null = null;
  let generation = 0;
  let disposed = false;
  let hold: { id: number; x: number; y: number; time: number; moved: boolean; ids?: string[] } | null = null;
  let lasso: { id: number; points: Pt[]; view: CanvasViewport; barrelSeen: boolean } | null = null;
  let releasedLasso: number | null = null;

  const restoreTool = () => {
    const api = options.getApi();
    const tool = previousTool;
    previousTool = null;
    if (api && tool && api.getAppState().activeTool.type === "hand") {
      if (disposed) api.setActiveTool(tool);
      else options.changeTool(() => api.setActiveTool(tool));
    }
  };
  const finishLasso = (cancelled: boolean) => {
    const loop = lasso;
    lasso = null;
    armed = false;
    options.onLoop(null);
    const api = options.getApi();
    if (cancelled || !loop || !api || loop.points.length < 3) return;
    const polygon = loop.points.map((p) => clientToScene(p.x, p.y, loop.view));
    const ids = elementsInsideLasso(api.getSceneElements(), polygon);
    if (!ids.length) return;
    api.setActiveTool({ type: "selection" });
    api.updateScene({ appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])) } });
  };

  const onDown = (e: PointerEvent) => {
    const api = options.getApi();
    if (!api || !isCanvas(e.target)) return;
    if (e.pointerType === "pen") {
      pen = e.pointerId;
      hold = null;
      // Native pointerdown cleans up the previous hand gesture. Contacts
      // already resting on the screen become palms until they lift; they must
      // not count as a second finger on the next navigation gesture.
      for (const id of touches) { palms.add(id); forwardedPalms.add(id); }
      touches.clear();
      generation++;
      restoreTool();
      if (options.suppressDrawing) return;
      if (!(e.buttons & 32) && ((e.buttons & 2) || armed)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        armed = false;
        lasso = { id: e.pointerId, points: [{ x: e.clientX, y: e.clientY }], view: api.getAppState(), barrelSeen: !!(e.buttons & 2) };
        options.onLoop([...lasso.points]);
      }
      return;
    }
    if (e.pointerType !== "touch") return;
    // A resting palm must not start another gesture during an active pen stroke.
    if (palms.has(e.pointerId) || (options.penMode && pen !== null)) {
      palms.add(e.pointerId);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    generation++;
    touches.add(e.pointerId);
    if (options.suppressDrawing) return;
    const state = api.getAppState();
    // Enforce routing on EVERY contact, even if a pen or a toolbar action
    // changed the tool while another finger was down. Counting two contacts
    // must never bypass the switch and let touch reach the drawing tool.
    if (options.penMode && !["selection", "hand", "text", "image"].includes(state.activeTool.type)) {
      previousTool ??= state.activeTool;
      options.changeTool(() => api.setActiveTool({ type: "hand" }));
    }
    if (touches.size > 1) {
      hold = null;
      return; // both genuine fingers reach native pinch handling
    }
    if (state.activeTool.type === "selection") {
      const p = clientToScene(e.clientX, e.clientY, state);
      const selected = api.getSceneElements().filter((el) => state.selectedElementIds[el.id]);
      // Movement is native, preserving linked elements and a single undo step.
      if (selected.some((el) => p.x >= el.x && p.x <= el.x + el.width && p.y >= el.y && p.y <= el.y + el.height)) {
        hold = { id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, moved: false };
      }
      return; // deliberately choosing Select still allows native selection
    }
    if (options.penMode && !['selection', 'text', 'image'].includes(state.activeTool.type)) {
      const p = clientToScene(e.clientX, e.clientY, state);
      const hit = [...api.getSceneElements()].reverse().find(el => !el.isDeleted &&
        p.x >= el.x && p.x <= el.x + el.width && p.y >= el.y && p.y <= el.y + el.height);
      if (hit) {
        const group = hit.groupIds?.at(-1);
        const ids = api.getSceneElements().filter(el => !el.isDeleted &&
          (el.id === hit.id || (group && el.groupIds.includes(group)))).map(el => el.id);
        hold = { id:e.pointerId, x:e.clientX, y:e.clientY, time:e.timeStamp, moved:false, ids };
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" && palms.has(e.pointerId)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (releasedLasso === e.pointerId) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (lasso?.id === e.pointerId) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.buttons & 2) lasso.barrelSeen = true;
      if (lasso.barrelSeen && !(e.buttons & 2)) {
        lasso.points.push({ x: e.clientX, y: e.clientY });
        releasedLasso = e.pointerId;
        finishLasso(false);
        return;
      }
      lasso.points.push({ x: e.clientX, y: e.clientY });
      options.onLoop([...lasso.points]);
      return;
    }
    if (e.pointerType === "pen" && pen === null) {
      armed = isCanvas(e.target) && !(e.buttons & 32) && !!(e.buttons & 2);
    }
    if (hold?.id === e.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) hold.moved = true;
  };
  const onUp = (e: PointerEvent) => {
    const cancelled = e.type === "pointercancel";
    if (releasedLasso === e.pointerId) { releasedLasso = null; e.preventDefault(); e.stopImmediatePropagation(); }
    if (lasso?.id === e.pointerId) {
      e.preventDefault();
      e.stopImmediatePropagation();
      finishLasso(cancelled);
    }
    if (pen === e.pointerId) { pen = null; armed = false; }
    if (e.pointerType !== "touch") return;
    if (palms.delete(e.pointerId)) {
      // Contacts that reached native pointerdown must also reach pointerup,
      // otherwise the engine retains a phantom finger in its pinch state.
      if (!forwardedPalms.delete(e.pointerId)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (!touches.delete(e.pointerId)) return;
    if (hold?.id === e.pointerId) {
      if (!cancelled && !hold.moved && e.timeStamp - hold.time >= 450) {
        const api = options.getApi();
        if (api && hold.ids) {
          previousTool = null;
          options.changeTool(() => api.setActiveTool({type:'selection'}));
          api.updateScene({appState:{selectedElementIds:Object.fromEntries(hold.ids.map(id=>[id,true]))}});
        }
        options.onLongPress?.(hold.x, hold.y);
      }
      hold = null;
    }
    const token = generation;
    queueMicrotask(() => {
      if (!disposed && touches.size === 0 && token === generation) restoreTool();
    });
  };
  const onContext = (e: Event) => {
    if (lasso || releasedLasso !== null || armed || hold) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onBlur = () => {
    hold = null;
    releasedLasso = null;
    pen = null;
    touches.clear();
    palms.clear();
    forwardedPalms.clear();
    finishLasso(true);
    restoreTool();
  };
  target.addEventListener("pointerdown", onDown, true);
  target.addEventListener("pointermove", onMove, true);
  target.addEventListener("pointerup", onUp, true);
  target.addEventListener("pointercancel", onUp, true);
  target.addEventListener("contextmenu", onContext, true);
  target.addEventListener("blur", onBlur);
  return () => {
    disposed = true;
    target.removeEventListener("pointerdown", onDown, true);
    target.removeEventListener("pointermove", onMove, true);
    target.removeEventListener("pointerup", onUp, true);
    target.removeEventListener("pointercancel", onUp, true);
    target.removeEventListener("contextmenu", onContext, true);
    target.removeEventListener("blur", onBlur);
    restoreTool();
  };
}
