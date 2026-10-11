import { useCallback, useRef, useState } from "react";
import type { FileManager } from "../desktop/useFileManager";
import { usePopover } from "./usePopover";
type Props = {
    fm: FileManager;
    desktop: boolean;
    onSettings: () => void;
    onLibrary: () => void;
    onAbout: () => void;
    onExport: () => void;
    onOpenBackup: () => void | Promise<void>;
    onBackup: () => void;
};
export default function FileMenu(p: Props) {
    const [open, setOpen] = useState(false), wrapper = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
    const close = useCallback(() => setOpen(false), []);
    usePopover(open, wrapper, panel, close);
    const run = (fn: () => void | Promise<unknown>) => () => { setOpen(false); void fn(); };
    return <div className="pd-filemenu" ref={wrapper}><button className="pd-btn ghost" aria-label="PenDraw menu" aria-expanded={open} aria-controls="pd-app-menu" onClick={() => setOpen(!open)} title="Menu">☰ <span>Menu</span></button>{open && <div id="pd-app-menu" className="pd-filemenu-panel" ref={panel} role="dialog" aria-label="PenDraw menu"><div className="pd-menu-heading">Drawing</div>{p.desktop ? <><button className="pd-menu-item" disabled={p.fm.busy} onClick={run(p.fm.onNew)}>New</button><button className="pd-menu-item" disabled={p.fm.busy} onClick={run(p.fm.onOpen)}>Open…</button><button className="pd-menu-item" disabled={p.fm.busy} onClick={run(p.fm.onSave)}>Save</button><button className="pd-menu-item" disabled={p.fm.busy} onClick={run(p.fm.onSaveAs)}>Save As…</button></> : <><button className="pd-menu-item" onClick={run(p.onOpenBackup)}>Open backup</button><button className="pd-menu-item" onClick={run(p.onBackup)}>Save backup</button></>}<div className="pd-menu-sep"/><button className="pd-menu-item" onClick={run(p.onLibrary)}>Library</button><button className="pd-menu-item" onClick={run(p.onExport)}>Export selection → PNG</button><div className="pd-menu-sep"/><button className="pd-menu-item" aria-label="Settings" onClick={run(p.onSettings)}>Settings</button><button className="pd-menu-item pd-about-button" onClick={run(p.onAbout)}>About PenDraw</button></div>}</div>;
}
