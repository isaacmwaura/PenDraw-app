import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {Brand,WindowControls,TitlebarSpace} from "../components/WindowControls";
import {AppearanceSettings} from "../appearance/Appearance";
import {usePopover} from "../components/usePopover";
import Board from "../board/Board";
import ConnectionBanner from "../components/ConnectionBanner";
import StrokeWidthSlider from "../components/StrokeWidthSlider";
import { usePeerSync } from "../sync/usePeerSync";
import { loadMirrorScene } from "../storage/persistence";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// The mirror is now editable (two-way). It still follows the presenter's view
// when "Lock to presenter" is on; switch to Free look to pan/zoom (and draw)
// independently.
export default function Mirror() {
  const [settings,setSettings]=useState(false),wrapper=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null);
  const closeSettings=useCallback(()=>setSettings(false),[]);usePopover(settings,wrapper,panel,closeSettings);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [lockToPresenter, setLockToPresenter] = useState(true);
  const mountedAt = useRef(Date.now());

  // Auto-pause following: when the viewer actually draws on a locked mirror,
  // switch to Free look so their view stops jumping to the presenter's. The time
  // gate ignores the initial load's onChange (restoring saved content).
  const onLocalEdit = () => {
    if (Date.now() - mountedAt.current < 1500) return;
    setLockToPresenter((prev) => (prev ? false : prev));
  };

  const { pushLocalChange, status, reconnectNow } = usePeerSync(
    apiRef,
    "mirror",
    lockToPresenter,
    { onLocalEdit },
  );
  const [everConnected, setEverConnected] = useState(false);

  useEffect(() => {
    if (status === "connected") setEverConnected(true);
  }, [status]);

  const initialData = useMemo(() => {
    // A new host session owns the initial board. Never merge an unrelated cached board into it.
    const saved = new URLSearchParams(window.location.search).has("session") ? null : loadMirrorScene();
    return saved ? { elements: saved.elements, files: saved.files } : undefined;
  }, []);

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const onChange = useCallback(() => {
    pushLocalChange(); // the mirror can now draw too — share its edits
  }, [pushLocalChange]);

  const dotClass = status === "connected" ? "on" : status === "connecting" ? "warn" : "off";

  return (
    <div className="pd-root">
      <div className="pd-bar">
        <Brand/>
        <span className="pd-mode mirror">Mirror · editable</span>
        <span className={"pd-dot " + dotClass} />
        <span className="pd-status">{status}</span>
        <StrokeWidthSlider apiRef={apiRef} />
        <TitlebarSpace/>
        <label
          className="pd-switch"
          title="On: follow the presenter's view. Off: free look — pan, zoom and draw independently."
        >
          <span className="pd-switch-label">Lock to presenter</span>
          <input
            type="checkbox"
            checked={lockToPresenter}
            onChange={(e) => setLockToPresenter(e.target.checked)}
          />
          <span className="track">
            <span className="thumb" />
          </span>
        </label>
        <div className="pd-settings" ref={wrapper}><button className="pd-btn ghost" aria-label="Settings" aria-expanded={settings} onClick={()=>setSettings(!settings)}>⚙ Settings</button>{settings&&<div className="pd-settings-panel" ref={panel} role="dialog" aria-label="Settings"><AppearanceSettings/></div>}</div>
        <WindowControls/>
      </div>
      <div className="pd-canvas">
        <ConnectionBanner status={status} everConnected={everConnected} onReconnect={reconnectNow} />
        {!lockToPresenter && (
          <div className="pd-freelook-badge">🔎 Free look — you are viewing independently</div>
        )}
        <Board onApi={onApi} onChange={onChange} initialData={initialData} />
      </div>
    </div>
  );
}
