import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// A single continuous "Thickness" control. The slider value is the *visual*
// thickness. Excalidraw renders a freehand (pen) stroke at strokeWidth * 4.25
// but a line/shape at exactly strokeWidth, so the two diverge. We keep the pen
// as the reference: the slider sets strokeWidth for the pen directly, and new
// line/shape elements are scaled up to match in the editor's onChange (see
// FREEDRAW_FACTOR / normalizeNewWidths). Pen pressure still varies the line.
export const DEFAULT_WIDTH = 0.5;
export const FREEDRAW_FACTOR = 4.25;

// strokeWidth needed for a given element type to render at `visual` thickness.
export function widthForType(visual: number, type: string): number {
  return type === "freedraw" ? visual : visual * FREEDRAW_FACTOR;
}

export default function StrokeWidthSlider({
  apiRef,
  onWidthChange,
}: {
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  /** Notifies the parent of the current visual thickness (for onChange parity). */
  onWidthChange?: (v: number) => void;
}) {
  const [w, setW] = useState(DEFAULT_WIDTH);
  const appliedDefault = useRef(false);

  // Apply the thin default once Excalidraw is ready, and announce it.
  useEffect(() => {
    onWidthChange?.(DEFAULT_WIDTH);
    const id = window.setInterval(() => {
      const api = apiRef.current;
      if (api && !appliedDefault.current) {
        api.updateScene({ appState: { currentItemStrokeWidth: DEFAULT_WIDTH } });
        appliedDefault.current = true;
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [apiRef, onWidthChange]);

  const apply = (val: number) => {
    setW(val);
    onWidthChange?.(val);
    const api = apiRef.current;
    if (!api) return;
    // New pen strokes use the value directly; new lines/shapes get scaled in
    // the editor's onChange so they render at the same visual thickness.
    api.updateScene({ appState: { currentItemStrokeWidth: val } });
    // Currently-selected shapes: set each per its type so they match visually.
    const appState = api.getAppState();
    const selected = appState.selectedElementIds || {};
    const els = api.getSceneElementsIncludingDeleted();
    let changed = false;
    const next = els.map((e: any) => {
      if (selected[e.id] && !e.isDeleted) {
        changed = true;
        return {
          ...e,
          strokeWidth: widthForType(val, e.type),
          version: (e.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 1e9),
        };
      }
      return e;
    });
    if (changed) api.updateScene({ elements: next });
  };

  return (
    <label className="pd-stroke" title="Thickness (thin → thick), consistent across pen and lines. Pen pressure also varies the line.">
      <span>Thickness</span>
      <input
        type="range"
        min="0.3"
        max="6"
        step="0.1"
        value={w}
        onChange={(e) => apply(parseFloat(e.target.value))}
      />
    </label>
  );
}

// Ids of elements currently mid-gesture (being drawn, resized, or point-edited).
// Rewriting these via updateScene during the gesture makes Excalidraw drop the
// live element and finalize it at its initial near-zero size — a shape collapses
// to a "dot" on release. So we must leave them alone until the gesture ends.
function activeGestureIds(appState: any): Set<string> {
  const ids = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === "string" && id) ids.add(id);
  };
  if (appState) {
    add(appState.newElement?.id); // shape/line being drawn right now
    add(appState.resizingElement?.id);
    add(appState.multiElement?.id); // multi-point linear in progress
    add(appState.editingLinearElement?.elementId);
    add(appState.editingTextElement?.id);
    add(appState.croppingElementId);
    // A selection being dragged across the canvas: don't rewrite it mid-move.
    if (appState.selectedElementsAreBeingDragged) {
      for (const id of Object.keys(appState.selectedElementIds || {})) add(id);
    }
  }
  return ids;
}

// Scales the strokeWidth of newly-created line/shape elements up by
// FREEDRAW_FACTOR so they render at the same visual thickness as pen strokes.
// Called from the editor's onChange with the elements payload (not lagged state).
// `seen` tracks which ids have already been handled to avoid loops/re-scaling.
// `appState` lets us skip any element still under an active gesture (see above);
// such elements are intentionally NOT marked seen, so they get normalized once,
// cleanly, on the next onChange after the gesture finishes.
export function normalizeNewWidths(
  api: ExcalidrawImperativeAPI,
  elements: readonly any[],
  visual: number,
  seen: Set<string>,
  appState?: any,
): void {
  const active = activeGestureIds(appState);
  const fix = new Set<string>();
  for (const e of elements) {
    if (seen.has(e.id)) continue;
    if (active.has(e.id)) continue; // still being drawn/resized — wait for finalize
    seen.add(e.id);
    const scalable =
      !e.isDeleted &&
      e.type !== "freedraw" &&
      e.type !== "text" &&
      e.type !== "image" &&
      e.type !== "frame" &&
      typeof e.strokeWidth === "number" &&
      Math.abs(e.strokeWidth - visual) < 1e-6; // was created at the raw value
    if (scalable) fix.add(e.id);
  }
  if (fix.size === 0) return;
  const next = elements.map((e: any) =>
    fix.has(e.id)
      ? {
          ...e,
          strokeWidth: widthForType(visual, e.type),
          version: (e.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 1e9),
        }
      : e,
  );
  api.updateScene({ elements: next });
}
