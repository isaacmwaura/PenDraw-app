import {flushSync} from 'react-dom';
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktopApp } from "../handwriting/recognize";
import { Context, useAppearance, type Appearance, type ThemeMode } from "./context";
const KEY = 'pendraw:appearance';
const load = () => { try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { mode: (['light', 'dark', 'system'].includes(p.mode) ? p.mode : 'system') as ThemeMode, startFullscreen: p.startFullscreen === true };
}
catch {
    return { mode: 'system' as ThemeMode, startFullscreen: false };
} };
export function AppearanceProvider({ children }: {
    children: ReactNode;
}) {
    const desktop = isDesktopApp(), [prefs, setPrefs] = useState(load), [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
    const [fullscreen, setFullscreen] = useState(false), [error, setError] = useState('');
    const theme = prefs.mode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.mode;
    const startup = useRef(prefs.startFullscreen), busy = useRef(false);
    const persist = (next: ReturnType<typeof load>) => { setPrefs(next); try {
        localStorage.setItem(KEY, JSON.stringify(next));
    }
    catch {
        setError('Settings could not be remembered. They still apply until you close PenDraw.');
    } };
    const syncWindow = useCallback(async () => { if (desktop) {
        const w = getCurrentWindow();
        const f = await w.isFullscreen();
        setFullscreen(f);
    }
    else
        setFullscreen(!!document.fullscreenElement); }, [desktop]);
    const action = useCallback((fn: () => Promise<unknown>) => { void fn().catch(e => setError('Window action failed: ' + String(e))); }, []);
    const toggleFullscreen = useCallback(() => { if (busy.current)
        return; busy.current = true; action(async () => { try {
        if (desktop) {
            const w = getCurrentWindow();
            const next=!await w.isFullscreen();flushSync(()=>setFullscreen(next));try{await w.setFullscreen(next)}catch(e){await syncWindow();throw e}
        }
        else if (document.fullscreenElement)
            await document.exitFullscreen();
        else
            await document.documentElement.requestFullscreen();
        await syncWindow();
    }
    finally {
        busy.current = false;
    } }); }, [action, desktop, syncWindow]);
    useEffect(() => { const query = matchMedia('(prefers-color-scheme: dark)'), change = () => setSystemDark(query.matches); query.addEventListener('change', change); const storage = (e: StorageEvent) => { if (e.key === KEY)
        setPrefs(load()); }; window.addEventListener('storage', storage); return () => { query.removeEventListener('change', change); window.removeEventListener('storage', storage); }; }, []);
    useEffect(()=>{if(desktop)action(()=>getCurrentWindow().setTheme(theme));},[desktop,theme,action]);
    useEffect(()=>{if(!desktop)return;let disposed=false;let unlisten:(()=>void)|undefined;
      getCurrentWindow().onCloseRequested(async event=>{event.preventDefault();window.dispatchEvent(new Event('pagehide'));try{await getCurrentWindow().destroy()}catch(e){setError('Close failed: '+String(e))}}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(e=>setError('Close handler failed: '+String(e)));
      return()=>{disposed=true;unlisten?.()};},[desktop]);
    useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, [theme]);
    useEffect(() => { action(async () => { if (desktop && startup.current)
        await getCurrentWindow().setFullscreen(true); await syncWindow(); }); const resize = () => action(syncWindow); window.addEventListener('resize', resize); document.addEventListener('fullscreenchange', resize); return () => { window.removeEventListener('resize', resize); document.removeEventListener('fullscreenchange', resize); }; }, [action, desktop, syncWindow]);
    useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'F11') {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleFullscreen();
    } }; window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }, [toggleFullscreen]);
    const value: Appearance = { mode: prefs.mode, theme, setMode: mode => persist({ ...prefs, mode }), startFullscreen: prefs.startFullscreen, setStartFullscreen: startFullscreen => persist({ ...prefs, startFullscreen }), fullscreen, toggleFullscreen, desktop };
    return <Context.Provider value={value}>{children}{error && <div className="pd-window-error" role="alert">{error}<button className="pd-btn" onClick={() => setError('')}>Dismiss</button></div>}</Context.Provider>;
}
export function AppearanceSettings() { const a = useAppearance(); return <section className="pd-appearance-settings"><div className="pd-settings-title">Appearance</div><label className="pd-settings-row col">Theme<select aria-label="Theme" value={a.mode} onChange={e => a.setMode(e.target.value as ThemeMode)}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>{a.desktop && <label className="pd-settings-row"><input type="checkbox" aria-label="Open in full screen" checked={a.startFullscreen} onChange={e => a.setStartFullscreen(e.target.checked)}/>Open in full screen</label>}<p className="pd-settings-note">Use the full-screen button or F11 to enter or leave full screen.</p></section>; }
