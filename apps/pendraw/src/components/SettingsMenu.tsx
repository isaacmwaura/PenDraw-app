import {useRef,useState} from "react";
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
  sharing,sharingBusy,sharingError,onStartSharing,onStopSharing,
}: {
  open:boolean; onClose:()=>void; onQuality:()=>void;
  prefs: SyncPrefs;
  onChange: (p: SyncPrefs) => void;
  desktop: boolean;
  penMode: boolean;
  onPenMode: (b: boolean) => void;
  sharing: {links:string[]}|null;
  sharingBusy:boolean;sharingError:string;
  onStartSharing:()=>Promise<void>;onStopSharing:()=>Promise<void>;
}) {
  const [copied,setCopied]=useState('');
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
          {desktop&&<section aria-label="Share this board">
            <p className="pd-settings-note">Open this live board in another device's browser on the same Wi-Fi. No Node.js or server installation needed.</p>
            <button className="pd-btn" disabled={sharingBusy} onClick={()=>void(sharing?onStopSharing():onStartSharing())}>{sharingBusy?'Please wait…':sharing?'Stop sharing':'Start sharing'}</button>
            {!sharing&&<p className="pd-settings-note">Windows may ask to allow network access. Allow Private networks on trusted Wi-Fi. Anyone with the link can view and edit.</p>}
            {sharing&&sharing.links.map((link,i)=><div key={link} className="pd-sharing-link"><label className="pd-settings-row col"><span>{i===0?'Sharing link':'Computer-name link (if your network supports it)'}</span><input className="pd-settings-input" readOnly value={link} aria-label={i===0?'Sharing link':'Computer-name sharing link'}/></label><button className="pd-btn" onClick={async()=>{try{await navigator.clipboard.writeText(link);setCopied(link);}catch{setCopied('Select the link and press Ctrl+C.')}}}>{copied===link?'Copied':'Copy link'}</button></div>)}
            {sharing&&<p className="pd-settings-note">Bookmark the link on the other device. Keep PenDraw open and sharing on. Sharing is off each time you start the app.</p>}
            {sharingError&&<p role="alert">{sharingError}</p>}
            {copied.startsWith('Select')&&<p role="status">{copied}</p>}
          </section>}
          {!sharing&&<details><summary>Advanced: connect to a developer-hosted relay</summary>
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
          </details>}
        </div>
      </div>)}
    </>
  );
}
