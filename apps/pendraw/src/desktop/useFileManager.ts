import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { contentSignature } from "../board/content";
import {FONT_FAMILY} from '@excalidraw/excalidraw';
import {loadPens} from '../components/penPresets';
import { applySceneJSON, baseName, pickOpenPath, pickSavePath, readFile, serializeScene, writeFile } from "./files";

const PATH_KEY = "pendraw:current-file";
const DIRTY_KEY = "pendraw:current-dirty";
function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
const signature = (api: ExcalidrawImperativeAPI) => contentSignature(api.getSceneElements(), api.getFiles());

export type FileManager = {
  fileName: string | null;
  onRename: (name:string)=>Promise<boolean>;
  dirty: boolean;
  busy: boolean;
  onSceneChange: (elements: readonly any[], files: Record<string, unknown>) => void;
  onNew: () => void;
  onOpen: () => Promise<void>;
  onSave: () => Promise<void>;
  onSaveAs: () => Promise<void>;
};

// Named-file state sits above local recovery. A completed disk write establishes
// a baseline for exactly the snapshot written, not for later edits on the canvas.
export function useFileManager(
  apiRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>,
  enabled: boolean,
  beforeReplace: () => void = () => {},
): FileManager {
  const [title,setTitle]=useState(()=>stored('pendraw:drawing-title')??'');
  const [path, setPath] = useState<string | null>(() => enabled ? stored(PATH_KEY) : null);
  const [dirty, setDirty] = useState(() => enabled && stored(DIRTY_KEY) === "1");
  const [busy, setBusy] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;
  const dirtyRef = useRef(dirty);
  const busyRef = useRef(false);
  // Unknown baseline for recovered unsaved work: keep it dirty until a save.
  const cleanSignature = useRef<string | null>(null);

  const recordDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
    if (enabled) {
      try { localStorage.setItem(DIRTY_KEY, value ? "1" : "0"); } catch { /* recovery may be unavailable */ }
    }
  }, [enabled]);
  const bind = useCallback((next: string | null) => {
    pathRef.current = next;
    setPath(next);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    try {
      if (path) localStorage.setItem(PATH_KEY, path);
      else localStorage.removeItem(PATH_KEY);
    } catch { /* do not interrupt drawing if browser storage is unavailable */ }
  }, [enabled, path]);

  const onSceneChange = useCallback((elements: readonly any[], files: Record<string, unknown>) => {
    if (!enabled) return;
    const next = contentSignature(elements, files);
    if (cleanSignature.current === null && !dirtyRef.current) cleanSignature.current = next;
    recordDirty(next !== cleanSignature.current);
  }, [enabled, recordDirty]);
  const confirmDiscard = useCallback(() => !dirtyRef.current || window.confirm("You have unsaved changes. Discard them?"), []);
  const setBusyState = (value: boolean) => { busyRef.current = value; setBusy(value); };

  const onNew = useCallback(() => {
    const api = apiRef.current;
    if (!enabled || busyRef.current || !api || !confirmDiscard()) return;
    beforeReplace();
    const penMode = api.getAppState().penMode;
    api.resetScene();
    const pen=loadPens()[0];
    api.updateScene({ appState: { penMode, zoom:{value:1} as any, currentItemFontFamily:FONT_FAMILY.Helvetica as any,
      currentItemFontSize:20,currentItemStrokeColor:pen.color,currentItemStrokeWidth:pen.width,currentItemOpacity:pen.opacity } });
    api.setActiveTool({ type: "freedraw" });
    cleanSignature.current = signature(api);
    bind(null);setTitle('');try{localStorage.removeItem('pendraw:drawing-title')}catch{};
    recordDirty(false);
  }, [apiRef, enabled, confirmDiscard, bind, recordDirty, beforeReplace]);

  const onOpen = useCallback(async () => {
    const api = apiRef.current;
    if (!enabled || busyRef.current || !api || !confirmDiscard()) return;
    const before = signature(api);
    setBusyState(true);
    try {
      const picked = await pickOpenPath();
      if (!picked) return;
      const text = await readFile(picked);
      // Ask again only if new edits arrived during the picker/read/parse.
      const applied = await applySceneJSON(api, text, () => signature(api) === before || confirmDiscard(), beforeReplace);
      if (!applied) return;
      cleanSignature.current = signature(api);
      bind(picked);setTitle('');try{localStorage.removeItem('pendraw:drawing-title')}catch{};
      recordDirty(false);
    } catch (error) {
      window.alert("Couldn't open that file: " + error);
    } finally { setBusyState(false); }
  }, [apiRef, enabled, confirmDiscard, bind, recordDirty, beforeReplace]);

  const save = useCallback(async (asNew: boolean) => {
    const api = apiRef.current;
    if (!enabled || busyRef.current || !api) return;
    setBusyState(true);
    try {
      const picked = asNew || !pathRef.current
        ? await pickSavePath(pathRef.current ?? (title ? title+'.excalidraw' : undefined)) : pathRef.current;
      if (!picked) return;
      const savedSignature = signature(api);
      const snapshot = serializeScene(api);
      await writeFile(picked, snapshot);
      bind(picked);
      cleanSignature.current = savedSignature;
      recordDirty(signature(api) !== savedSignature);
    } catch (error) {
      window.alert("Couldn't save that file: " + error);
    } finally { setBusyState(false); }
  }, [apiRef, enabled, bind, recordDirty,title]);
  const onSave = useCallback(() => save(false), [save]);
  const onSaveAs = useCallback(() => save(true), [save]);
  const onRename=useCallback(async(name:string)=>{const trimmed=name.trim();if(!trimmed||busyRef.current)return false;if(pathRef.current&&enabled){const api=apiRef.current;if(!api)return false;setBusyState(true);try{const picked=await pickSavePath(pathRef.current.replace(/[^/\\]+$/,trimmed.endsWith('.excalidraw')?trimmed:trimmed+'.excalidraw'));if(!picked)return false;const saved=signature(api);await writeFile(picked,serializeScene(api));bind(picked);cleanSignature.current=saved;recordDirty(signature(api)!==saved);setTitle('');localStorage.removeItem('pendraw:drawing-title');return true;}catch(e){window.alert("Couldn't rename that drawing: "+e);return false;}finally{setBusyState(false)}}setTitle(trimmed);try{localStorage.setItem('pendraw:drawing-title',trimmed)}catch{};return true;},[apiRef,enabled,bind,recordDirty]);
  return { onRename, fileName: baseName(path)||title||null, dirty, busy, onSceneChange, onNew, onOpen, onSave, onSaveAs };
}
