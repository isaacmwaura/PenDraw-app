import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { elementsInsideLasso, type Pt } from "./hitTest";
import { clientToScene } from "../board/coordinates";

type Props = {
  /** When true the overlay captures pen/pointer input and draws the loop. */
  active: boolean;
  apiRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
  /** Fires when a loop finishes (or is cancelled), with how many were selected. */
  onDone: (count: number) => void;
};

// A transparent SVG that sits on top of the Excalidraw canvas while lasso mode
// is on. It records the freehand loop, then converts it to scene coordinates,
// selects every element enclosed, and hands control back to the editor.
// Excalidraw 0.18 only has a rectangular marquee — this is the free-form tool.
export default function LassoOverlay({ active, apiRef, onDone }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawing = useRef(false);
  // Viewport (client) points are kept for the scene conversion; local points
  // (relative to the overlay) are what we actually draw.
  const clientPts = useRef<Pt[]>([]);
  const [localPts, setLocalPts] = useState<Pt[]>([]);

  const reset = useCallback(() => {
    drawing.current = false;
    clientPts.current = [];
    setLocalPts([]);
  }, []);

  const finish = useCallback(() => {
    const api = apiRef.current;
    const pts = clientPts.current;
    let count = 0;
    if (api && pts.length >= 3) {
      const appState = api.getAppState();
      const scene: Pt[] = pts.map((p) => clientToScene(p.x, p.y, appState));
      const ids = elementsInsideLasso(api.getSceneElements(), scene);
      const selectedElementIds: Record<string, true> = {};
      for (const id of ids) selectedElementIds[id] = true;
      api.setActiveTool({ type: "selection" });
      api.updateScene({ appState: { selectedElementIds } });
      count = ids.length;
    }
    reset();
    onDone(count);
  }, [apiRef, onDone, reset]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      // Prevent the pen/touch from starting a browser pan/gesture instead.
      e.preventDefault();
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer capture is best-effort; lassoing still works without it */
      }
      drawing.current = true;
      const rect = svgRef.current!.getBoundingClientRect();
      clientPts.current = [{ x: e.clientX, y: e.clientY }];
      setLocalPts([{ x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    },
    [active],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    clientPts.current.push({ x: e.clientX, y: e.clientY });
    setLocalPts((prev) => [
      ...prev,
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
    ]);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    finish();
  }, [finish]);

  // Pen/touch can be cancelled by the system (palm rejection, gesture start).
  // Discard an interrupted loop rather than selecting from an incomplete path.
  const onPointerCancel = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    reset();
    onDone(0);
  }, [onDone, reset]);

  // Escape cancels the current loop and leaves lasso mode.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        reset();
        onDone(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, reset, onDone]);

  if (!active) return null;

  const d =
    localPts.length > 0
      ? "M " +
        localPts.map((p) => `${p.x} ${p.y}`).join(" L ") +
        (localPts.length > 2 ? " Z" : "")
      : "";

  return (
    <svg
      ref={svgRef}
      className="pd-lasso"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {d && <path d={d} className="pd-lasso-path" />}
    </svg>
  );
}
