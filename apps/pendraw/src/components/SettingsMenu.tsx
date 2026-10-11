import {useRef} from "react";
import {AppearanceSettings} from "../appearance/Appearance";
import {useDialogFocus} from "./useDialogFocus";
import type { SyncPrefs } from "../sync/prefs";

// A small dropdown for app/network settings. For now it holds the mirror
// connection: the desktop app is offline-first, so sharing is opt-in here.
export default function SettingsMenu({
  open, onClose, onQuality,
  prefs,
  onChange,
  desktop,
  penMode,
  onPenMode,
}: {
  open:boolean; onClose:()=>void; onQuality:()=>void;
  prefs: SyncPrefs;
  onChange: (p: SyncPrefs) => void;
  desktop: boolean;
  penMode: boolean;
  onPenMode: (b: boolean) => void;
}) {
  const panel=useRef<HTMLDivElement>(null);
  useDialogFocus(open,panel,onClose);
  return (
    <>{open && (<div className="pd-modal-shade">
        <div id="pd-settings-panel" ref={panel} className="pd-settings-panel pd-settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
          <div className="pd-settings-heading"><h2>Settings</h2><button className="pd-btn" aria-label="Close settings" onClick={onClose}>×</button></div>
          <AppearanceSettings/>
          <div className="pd-settings-title">Drawing</div>
          <label className="pd-settings-row">
            <input
              type="checkbox"
              aria-label="Pen mode" checked={penMode}
              onChange={(e) => onPenMode(e.target.checked)}
            />
            <span>Pen mode — only the pen draws</span>
          </label>
          <p className="pd-settings-note">
            On a pen + touch device, this ignores finger touches for drawing (rest your palm),
            so you draw with the pen and use fingers to pan/zoom. No effect with a mouse.
          </p>
          {desktop&&<button className="pd-btn" onClick={()=>{onClose();onQuality()}}>Handwriting quality</button>}
          <div className="pd-settings-title" style={{ marginTop: 14 }}>Network</div>
          <label className="pd-settings-row">
            <input
              type="checkbox"
              aria-label="Connect to a contributor mirror" checked={prefs.enabled}
              onChange={(e) => onChange({ ...prefs, enabled: e.target.checked })}
            />
            <span>Connect to a contributor mirror</span>
          </label>
          {prefs.enabled && (
            <label className="pd-settings-row col">
              <span className="pd-settings-label">Mirror address</span>
              <input
                type="text"
                className="pd-settings-input"
                placeholder={desktop ? "e.g. 192.168.1.50:4000" : "leave blank for this device"}
                value={prefs.address}
                onChange={(e) => onChange({ ...prefs, address: e.target.value })}
              />
            </label>
          )}
          <p className="pd-settings-note">
            {desktop
              ? "PenDraw works offline. Turn this on to share a live board with a collaborator running a PenDraw mirror on your network."
              : "Leave the address blank to use this computer's own mirror."}
          </p>
        </div>
      </div>)}
    </>
  );
}
