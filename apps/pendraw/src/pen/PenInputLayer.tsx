import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Pt } from "../lasso/hitTest";
import { installPenInput } from "./inputController";

export default function PenInputLayer({ apiRef, enabled, penMode, suppressDrawing, onLongPress }: {
  apiRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
  enabled: boolean;
  penMode: boolean;
  suppressDrawing?: boolean;
  onLongPress?: (x: number, y: number) => void;
}) {
  const [loop, setLoop] = useState<Pt[] | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    return installPenInput(window, {
      getApi: () => apiRef.current,
      penMode,
      suppressDrawing,
      onLoop: setLoop,
      onLongPress,
      changeTool: (apply) => flushSync(apply),
    });
  }, [enabled, penMode, apiRef, onLongPress, suppressDrawing]);
  if (!loop?.length) return null;
  const d = "M " + loop.map((p) => `${p.x} ${p.y}`).join(" L ") + (loop.length > 2 ? " Z" : "");
  return <svg className="pd-pen-lasso"><path d={d} className="pd-lasso-path" /></svg>;
}
