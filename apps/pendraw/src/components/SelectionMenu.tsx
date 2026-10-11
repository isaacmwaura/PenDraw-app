import { useEffect, useLayoutEffect, useRef, useState } from "react";

// One unified context menu for a selection — the single menu the user asked for,
// replacing the old floating icon toolbar. It opens on demand (mouse right-click
// or a finger long-press on the selection), never automatically. Items are
// grouped (Copy / Functions) with the rarely-used ones tucked under "More", so
// the common actions stay fast to reach.

export type MenuActions = {
  onCopyPng: () => void;
  onCopySvg: () => void;
  onTurnToText?: () => void; // desktop only
  onDuplicate: () => void;
  onDelete: () => void;
  onFront: () => void;
  onBack: () => void;
  onExportPng: () => void;
};

export default function SelectionMenu({
  x,
  y,
  actions,
  bounds,
  onClose,
}: {
  x: number;
  y: number;
  bounds?: {left:number;top:number;right:number;bottom:number};
  actions: MenuActions;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep the menu fully on-screen: flip left/up when it would overflow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    let left = Math.max(pad,Math.min(x,window.innerWidth-r.width-pad));
    let top = Math.max(pad,Math.min(y,window.innerHeight-r.height-pad));
    if(bounds){const gap=20;const candidates=[{left:bounds.right+gap,top:bounds.top},{left:bounds.left-r.width-gap,top:bounds.top},{left:bounds.left,top:bounds.top-r.height-gap},{left:bounds.left,top:bounds.bottom+gap}];const chosen=candidates.map(c=>({left:Math.max(pad,Math.min(c.left,window.innerWidth-r.width-pad)),top:Math.max(pad,Math.min(c.top,window.innerHeight-r.height-pad))})).find(c=>c.left+r.width<bounds.left-gap||c.left>bounds.right+gap-1||c.top+r.height<bounds.top-gap||c.top>bounds.bottom+gap-1);if(chosen){left=chosen.left;top=chosen.top}else{left=window.innerWidth-r.width-pad;top=pad}}
    setPos({ left, top });
  }, [x, y, more, bounds]);

  // Dismiss on outside pointer or Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer binding so the very click that opened the menu doesn't close it.
    const t = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDown, true);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      ref={ref}
      className="pd-selmenu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label="Selection actions"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pd-selmenu-group">
        <div className="pd-selmenu-label">Copy / Export</div>
          <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onExportPng)}>
            <span className="pd-selmenu-ico">⭳</span> Export to PNG file
          </button>
        <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onCopyPng)}>
          <span className="pd-selmenu-ico">🖼</span> Copy to PNG
        </button>
        <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onCopySvg)}>
          <span className="pd-selmenu-ico">❮❯</span> Copy to SVG
        </button>
      </div>

      <div className="pd-selmenu-sep" />

      <div className="pd-selmenu-group">
        <div className="pd-selmenu-label">Functions</div>
        {actions.onTurnToText && (
          <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onTurnToText)}>
            <span className="pd-selmenu-ico">✎→T</span> Turn to text
          </button>
        )}
        <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onDuplicate)}>
          <span className="pd-selmenu-ico">⧉</span> Duplicate
        </button>
        <button className="pd-selmenu-item danger" role="menuitem" onClick={run(actions.onDelete)}>
          <span className="pd-selmenu-ico">🗑</span> Delete
        </button>
      </div>

      <div className="pd-selmenu-sep" />

      <button
        className="pd-selmenu-more"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
      >
        More {more ? "▴" : "▾"}
      </button>
      {more && (
        <div className="pd-selmenu-group">
          <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onFront)}>
            <span className="pd-selmenu-ico">⤒</span> Bring to front
          </button>
          <button className="pd-selmenu-item" role="menuitem" onClick={run(actions.onBack)}>
            <span className="pd-selmenu-ico">⤓</span> Send to back
          </button>

        </div>
      )}
    </div>
  );
}
