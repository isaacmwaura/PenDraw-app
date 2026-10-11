// Shows, before converting, which strokes the engine grouped into each block of
// text — a dashed box (numbered) around each block, labelled with what it will
// become — plus a confirm bar. Each box is tappable to include/exclude it, so a
// mis-read block (e.g. a drawing the engine thought was text) can be left as ink
// instead of being converted. Rectangles are in viewport (client) coordinates,
// recalculated from scene coordinates whenever the viewport changes.

import { useLayoutEffect, useRef, useState } from "react";
import { sceneToClient, type CanvasViewport } from "../board/coordinates";
import type { TextBlock } from "../handwriting/recognize";

export default function TextBlockPreview({
  blocks,
  viewport,
  excluded,
  onToggle,
  onConfirm,
  onCancel,
}: {
  blocks: TextBlock[];
  viewport: CanvasViewport;
  excluded: Set<number>;
  onToggle: (i: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const rect = svg.current?.getBoundingClientRect();
    if (rect) setOrigin((prev) => prev.x === rect.left && prev.y === rect.top
      ? prev : { x: rect.left, y: rect.top });
  }, [viewport]);
  const total = blocks.length;
  const included = total - excluded.size;
  return (
    <div className="pd-textpreview">
      <svg ref={svg} className="pd-textpreview-svg">
        {blocks.map((b, i) => {
          const client = sceneToClient(b.x, b.y, viewport);
          const r = { x: client.x - origin.x, y: client.y - origin.y,
            w: b.width * viewport.zoom.value, h: b.height * viewport.zoom.value };
          const text = b.text;
          const off = excluded.has(i);
          // Short single-line label of the recognized text (so the user can spot
          // a wrong reading like a drawing turned into "′").
          const label = text.replace(/\s+/g, " ").slice(0, 28) + (text.length > 28 ? "…" : "");
          return (
            <g key={i} className="pd-tp-group" onClick={() => onToggle(i)}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                className={"pd-textpreview-box" + (off ? " excluded" : "")}
              />
              <text x={r.x + 5} y={r.y + 16} className={"pd-textpreview-num" + (off ? " excluded" : "")}>
                {off ? "✗" : i + 1}
              </text>
              <text x={r.x + 5} y={r.y - 6} className={"pd-tp-label" + (off ? " excluded" : "")}>
                {off ? (b.keepAsInk ? "possible drawing · kept as ink" : "kept as ink") : "→ " + label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="pd-textpreview-bar" role="dialog" aria-label="Convert handwriting">
        <span>
          {included} of {total} block{total === 1 ? "" : "s"} → text
          <span className="pd-tp-hint"> · tap a box to include it or keep it as ink</span>
        </span>
        <button className="pd-btn" onClick={onConfirm} disabled={included === 0}>
          Convert {included} to text
        </button>
        <button className="pd-btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
