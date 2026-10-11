import {useDialogFocus} from '../components/useDialogFocus';
import {invoke} from '@tauri-apps/api/core';
import DrawingTools from '../drawing/DrawingTools';
import {loadPens} from '../components/penPresets';
import {FONT_FAMILY,getCommonBounds} from '@excalidraw/excalidraw';
import {sceneToClient} from '../board/coordinates';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {Brand,WindowControls} from "../components/WindowControls";
import {useAppearance} from "../appearance/context";
import {recoverySignature} from "../storage/recovery";
import Ribbon from "../components/Ribbon";
import {ribbonSnapshot} from "../components/ribbonStyles";
import Guides, {type GuideMode} from "../drawing/Guides";
import BucketFill from "../drawing/BucketFill";
import StraightenLayer from "../drawing/StraightenLayer";
import FixturePanel from "../handwriting/FixturePanel";
import { duplicateSelection, moveSelectionLayer } from "../board/selection";
import Board from "../board/Board";
import ConnectionBanner from "../components/ConnectionBanner";
import { normalizeNewWidths } from "../components/StrokeWidthSlider";
import LassoOverlay from "../lasso/LassoOverlay";
import SettingsMenu from "../components/SettingsMenu";
import TextBlockPreview from "../components/TextBlockPreview";
import { sameViewport, type CanvasViewport } from "../board/coordinates";
import PenInputLayer from "../pen/PenInputLayer";
import SelectionMenu, { type MenuActions } from "../components/SelectionMenu";
import FileMenu from "../components/FileMenu";
import { useFileManager } from "../desktop/useFileManager";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { usePeerSync } from "../sync/usePeerSync";
import { exportSelectionToPng } from "../export/exportSelection";
import { copySelectionPng, copySelectionSvg, type CopyResult } from "../export/selectionActions";
import {
  isDesktopApp,
  analyzeSelection,
  applyBlocks,
  selectionIsCurrent,
  type AnalyzedSelection,
} from "../handwriting/recognize";
import { loadSyncPrefs, saveSyncPrefs, wsUrlFromAddress, type SyncPrefs } from "../sync/prefs";
import {
  loadEditorScene,
  saveEditorScene,
  downloadBackup,
  openBackupFile,
} from "../storage/persistence";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export default function Editor() {
  const appearance=useAppearance();
  const [renaming,setRenaming]=useState(false),[newName,setNewName]=useState('');
  const [settings,setSettings]=useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const desktop = useMemo(() => isDesktopApp(), []);
  const [syncPrefs, setSyncPrefs] = useState<SyncPrefs>(() => loadSyncPrefs(desktop));
  const [sharing,setSharing]=useState<{links:string[];socketUrl:string}|null>(null);
  const [sharingBusy,setSharingBusy]=useState(false);
  const [sharingError,setSharingError]=useState('');
  const { pushLocalChange, status, reconnectNow, disconnectNow } = usePeerSync(apiRef, "editor", false, {
    enabled: syncPrefs.enabled,
    url: syncPrefs.enabled ? wsUrlFromAddress(syncPrefs.address) : undefined,
  });
  const onSyncPrefs = useCallback((p: SyncPrefs) => {
    setSyncPrefs(p);
    saveSyncPrefs(p);
  }, []);
  const startSharing=async()=>{
    setSharingBusy(true);setSharingError('');
    try { const info=await invoke<{links:string[];socketUrl:string}>('start_mirror');setSharing(info);onSyncPrefs({enabled:true,address:info.socketUrl}); }
    catch(error){setSharingError(String(error));}
    finally{setSharingBusy(false);}
  };
  const stopSharing=async()=>{
    setSharingBusy(true);setSharingError('');disconnectNow();onSyncPrefs({enabled:false,address:''});
    try{await invoke('stop_mirror');setSharing(null);}catch(error){setSharingError(String(error));}
    finally{setSharingBusy(false);}
  };
  const [everConnected, setEverConnected] = useState(false);
  const [lasso, setLasso] = useState(false);
  const [ribbonState,setRibbonState]=useState<any>(null);
  const [guides,setGuides]=useState<GuideMode>('none');
  const [guideSpacing,setGuideSpacing]=useState(32);
  const [straighten,setStraighten]=useState(false);
  const [fill,setFill]=useState(false);
  const [fillColor,setFillColor]=useState('#ffe08a');
  const [quality,setQuality]=useState(false);
  const [about,setAbout]=useState(false);
  const toggleLasso=useCallback(()=>{setFill(false);setLasso(v=>!v)},[]);
  const toggleFill=useCallback(()=>{setLasso(false);setFill(v=>!v)},[]);
  const finishFill=useCallback(()=>setFill(false),[]);
  const changeWidth=useCallback((v:number)=>{thicknessRef.current=v},[]);
  useEffect(()=>{if(!fill&&!lasso)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setFill(false);setLasso(false)}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[fill,lasso]);
  const recognitionRequest = useRef(0);
  const [recognizing, setRecognizing] = useState(false);
  // Desktop is pen-first: default to penMode (finger pans, doesn't draw).
  const [penMode, setPenMode] = useState(desktop);
  // Pending handwriting conversion, shown as a preview until the user confirms.
  // `excluded` holds block indices the user tapped to keep as ink (not convert).
  const [textPreview, setTextPreview] = useState<{
    sel: AnalyzedSelection;
    viewport: CanvasViewport;
    excluded: Set<number>;
  } | null>(null);
  // The unified selection context menu — opened on demand (right-click / finger
  // long-press) at a client-space point; null when closed.
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // A brief transient message (e.g. "Copied to clipboard"), since clipboard
  // actions are otherwise invisible.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  }, []);
  // Desktop file management (New/Open/Save/Save As + dirty tracking).
  const beforeReplace = useCallback(() => {
    disconnectNow();
    if(sharing){void invoke('stop_mirror').catch(error=>setSharingError(String(error)));setSharing(null);}
    if (syncPrefs.enabled) {
      onSyncPrefs({ ...syncPrefs, enabled: false });
      showFlash("New/Open starts a local board. Sharing is now off.");
    }
  }, [disconnectNow, syncPrefs, onSyncPrefs, showFlash, sharing]);
  const fm = useFileManager(apiRef, desktop, beforeReplace);

  // Apply Excalidraw's built-in pen mode (finger-draw rejection) when toggled.
  useEffect(() => {
    apiRef.current?.updateScene({ appState: { penMode } });
  }, [penMode]);

  // Desktop file shortcuts: Ctrl+S save, Ctrl+Shift+S save as, Ctrl+O open,
  // Ctrl+N new. Registered in the capture phase so they win over the browser.
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void (e.shiftKey ? fm.onSaveAs() : fm.onSave());
      } else if (k === "o") {
        e.preventDefault();
        void fm.onOpen();
      } else if (k === "n") {
        e.preventDefault();
        fm.onNew();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [desktop, fm]);

  // Escape also invalidates a native analysis still in progress.
  useEffect(() => {
    if (!textPreview && !recognizing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        recognitionRequest.current++;
        setRecognizing(false);
        setTextPreview(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [textPreview, recognizing]);
  const observedSignature=useRef<string|null>(null);
  const saveTimer = useRef<number | null>(null);
  const lastChange = useRef<{ elements: any; appState: any; files: any } | null>(null);
  const thicknessRef = useRef(0.5); // current visual thickness (from the slider)
  const seenIds = useRef<Set<string>>(new Set()); // ids already width-normalized

  const saveRef = useRef<HTMLSpanElement | null>(null);
  const setSaveText = useCallback((text: string, cls: string) => {
    if (saveRef.current) {
      saveRef.current.textContent = text;
      saveRef.current.className = "pd-save " + cls;
    }
  }, []);
  const flushRecovery = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const api=apiRef.current;
    const c = api?{elements:api.getSceneElementsIncludingDeleted(),appState:api.getAppState(),files:api.getFiles()}:lastChange.current;
    if (!c) return;
    const result = saveEditorScene(c.elements, c.appState, c.files);
    setSaveText(result === "saved" ? "Saved"
      : result === "partial" ? "Images not recovered — save a file" : "Recovery unavailable — save a file",
      result === "saved" ? "saved" : "saving");
  }, [setSaveText]);
  const disposeEditor = useCallback(() => {
    flushRecovery();
    recognitionRequest.current++;
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
  }, [flushRecovery]);
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === "hidden") flushRecovery(); };
    window.addEventListener("pagehide", flushRecovery);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushRecovery);
      document.removeEventListener("visibilitychange", onHidden);
      disposeEditor();
    };
  }, [flushRecovery, disposeEditor]);

  useEffect(() => {
    if (status === "connected") setEverConnected(true);
  }, [status]);

  const initialData = useMemo(() => {
    const saved = loadEditorScene();
    const pen=loadPens()[0];
    return {
      elements: saved?.elements ?? [],
      appState: { currentItemStrokeWidth: pen.width, currentItemStrokeColor: pen.color, currentItemFontFamily: FONT_FAMILY.Helvetica, currentItemFontSize: 20, zoom:{value:1}, ...saved?.appState, penMode: desktop },
      files: saved?.files ?? {},
      scrollToContent: false,
    };
  }, [desktop]);

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    thicknessRef.current = api.getAppState().currentItemStrokeWidth;
  }, []);

  // Pen-first: start on the freedraw tool so the pen draws on contact, with no
  // need to pick a tool first (OneNote-style). Excalidraw sets its own default
  // (selection) during init, sometimes after our first call, so we set freedraw
  // and retry briefly until it sticks, then stop (so we never fight the user).
  useEffect(() => {
    let tries = 0;
    const iv = window.setInterval(() => {
      const api = apiRef.current;
      if (api) {
        if (api.getAppState().activeTool?.type === "freedraw") {
          window.clearInterval(iv);
          return;
        }
        api.setActiveTool({ type: "freedraw" });
      }
      if (++tries > 20) window.clearInterval(iv);
    }, 50);
    return () => window.clearInterval(iv);
  }, []);

  const hasSelection = useCallback(() => {
    const api = apiRef.current;
    if (!api) return false;
    const ids = api.getAppState().selectedElementIds || {};
    return Object.keys(ids).some((id) => ids[id]);
  }, []);

  // Open the unified menu on right-click (mouse/pen) when something is selected,
  // suppressing both the OS menu and Excalidraw's own menu so only ours shows.
  // Capture phase + stopPropagation keeps the event from reaching Excalidraw.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || !t.closest(".excalidraw")) return;
      if (!hasSelection()) return; // no selection → leave default handling alone
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY });
    };
    // Barrel suppression runs at window capture, before this listener reaches
    // the canvas. Registration order can no longer open our menu mid-lasso.
    const canvas = document.querySelector(".pd-canvas");
    canvas?.addEventListener("contextmenu", onCtx as EventListener, true);
    return () => canvas?.removeEventListener("contextmenu", onCtx as EventListener, true);
  }, [hasSelection]);

  // A finger long-press on a selection also opens the menu (touch equivalent of
  // right-click). PenInputLayer detects the gesture and calls this with a point.
  const openMenuAt = useCallback((x: number, y: number) => setMenu({ x, y }), []);

  // Selection-toolbar actions, all operating on the current selection.
  const selectedEls = useCallback((): {
    api: ExcalidrawImperativeAPI | null;
    ids: Readonly<Record<string, boolean>>;
    els: any[];
  } => {
    const api = apiRef.current;
    if (!api) return { api: null, ids: {}, els: [] };
    const ids = api.getAppState().selectedElementIds || {};
    return { api, ids, els: [...api.getSceneElementsIncludingDeleted()] };
  }, []);
  const onDeleteSel = useCallback(() => {
    const { api, ids, els } = selectedEls();
    if (!api) return;
    api.updateScene({
      elements: els.map((e) => ids[e.id] && !e.isDeleted ? newElementWith(e, { isDeleted: true }) : e),
      appState: { selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setMenu(null);
  }, [selectedEls]);
  const onDuplicateSel = useCallback(() => { if (apiRef.current) duplicateSelection(apiRef.current); }, []);
  const onFrontSel = useCallback(() => { if (apiRef.current) moveSelectionLayer(apiRef.current, true); }, []);
  const onBackSel = useCallback(() => { if (apiRef.current) moveSelectionLayer(apiRef.current, false); }, []);

  const onChange = useCallback(
    (elements: any, appState: any, files: any) => {
      if(appState.activeTool.type==='freedraw')thicknessRef.current=appState.currentItemStrokeWidth;
      const nextUI=ribbonSnapshot(elements,appState);
      setRibbonState((previous:any)=>JSON.stringify(previous)===JSON.stringify(nextUI)?previous:nextUI);
      setTextPreview((p) => !p || sameViewport(p.viewport, appState)
        ? p : { ...p, viewport: appState });
      // Thickness parity: scale up new line/shape strokes to match the pen.
      // Pass appState so a shape still being drawn is left untouched — rewriting
      // it mid-gesture would collapse it to a dot on release.
      if (apiRef.current) {
        normalizeNewWidths(apiRef.current, elements, thicknessRef.current, seenIds.current, appState);
      }
      pushLocalChange(); // share this change with peers
      lastChange.current = { elements, appState, files };
      // Compare against the saved document, including ids and version nonces.
      fm.onSceneChange(elements, files);
      const signature=recoverySignature(elements,appState,files);
      if (signature===observedSignature.current) return;
      observedSignature.current=signature;
      setSaveText("Saving…", "saving");
      if (saveTimer.current == null) {
        saveTimer.current = window.setTimeout(flushRecovery, 800);
      }
    },
    [pushLocalChange, setSaveText, flushRecovery, fm],
  );

  const onExport = useCallback(async () => {
    if (apiRef.current) await exportSelectionToPng(apiRef.current);
  }, []);
  const flashFor = useCallback(
    (what: string, r: CopyResult) =>
      showFlash(
        r === "copied" ? `${what} copied to clipboard` : r === "downloaded" ? `${what} downloaded` : "Nothing selected",
      ),
    [showFlash],
  );
  const onCopyPng = useCallback(async () => {
    if (apiRef.current) flashFor("PNG", await copySelectionPng(apiRef.current));
  }, [flashFor]);
  const onCopySvg = useCallback(async () => {
    if (apiRef.current) flashFor("SVG", await copySelectionSvg(apiRef.current));
  }, [flashFor]);
  // Turn to text is two steps: analyse (no canvas change) → preview the blocks
  // the engine grouped → the user confirms → apply. Escape/Cancel discards it.
  const onTurnToText = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    const request = ++recognitionRequest.current;
    setMenu(null);
    setTextPreview(null);
    setRecognizing(true);
    const sel = await analyzeSelection(api);
    if (request !== recognitionRequest.current) return;
    setRecognizing(false);
    if (!sel) return;
    if (!selectionIsCurrent(api, sel)) {
      showFlash("The ink changed while reading it. Select it again and retry.");
      return;
    }
    setTextPreview({ sel, viewport: api.getAppState(),
      excluded: new Set(sel.blocks.flatMap((b, i) => b.keepAsInk ? [i] : [])) });
  }, [showFlash]);
  const onToggleBlock = useCallback((i: number) => {
    setTextPreview((p) => {
      if (!p) return p;
      const excluded = new Set(p.excluded);
      if (excluded.has(i)) excluded.delete(i);
      else excluded.add(i);
      return { ...p, excluded };
    });
  }, []);
  const onConfirmText = useCallback(() => {
    if (textPreview && apiRef.current) {
      const blocks = textPreview.sel.blocks.filter((_, i) => !textPreview.excluded.has(i));
      if (blocks.length > 0 && !applyBlocks(apiRef.current, { ...textPreview.sel, blocks })) {
        showFlash("The ink changed. Select it again before converting.");
      }
    }
    setTextPreview(null);
  }, [textPreview, showFlash]);
  const onCancelText = useCallback(() => setTextPreview(null), []);
  const onBackup = useCallback(() => {
    if (apiRef.current) downloadBackup(apiRef.current);
  }, []);
  const onOpenBackup = useCallback(() => {
    if (apiRef.current) openBackupFile(apiRef.current);
  }, []);

  const selectionBounds=(()=>{const api=apiRef.current;if(!api)return undefined;const state=api.getAppState();const selected=api.getSceneElements().filter(e=>state.selectedElementIds[e.id]);if(!selected.length)return undefined;const [x,y,right,bottom]=getCommonBounds(selected);const tl=sceneToClient(x,y,state),br=sceneToClient(right,bottom,state);return {left:tl.x,top:tl.y,right:br.x,bottom:br.y};})();
  const connectionText=sharing
    ? status==='connected'?'Sharing this board':status==='connecting'?'Starting sharing…':'Sharing connection lost'
    : status==='connected'?'Connected to mirror':status==='connecting'?'Connecting to mirror…':'Mirror disconnected';
  const dotClass =
    status === "connected"
      ? "on"
      : status === "connecting"
        ? "warn"
        : status === "offline"
          ? "offline"
          : "off";

  return (
    <div className={"pd-root pd-modern pd-compact"+(appearance.fullscreen?" pd-focus":"")}>
      <RenameDialog open={renaming} value={newName} onChange={setNewName} onClose={()=>setRenaming(false)} onConfirm={async()=>{if(await fm.onRename(newName))setRenaming(false)}}/>
      <SettingsMenu open={settings} onClose={()=>setSettings(false)} onQuality={()=>setQuality(true)} prefs={syncPrefs} onChange={onSyncPrefs} desktop={desktop} penMode={penMode} onPenMode={setPenMode} sharing={sharing} sharingBusy={sharingBusy} sharingError={sharingError} onStartSharing={startSharing} onStopSharing={stopSharing}/>
      <Ribbon headerStart={<><FileMenu fm={fm} desktop={desktop} onSettings={()=>setSettings(true)} onLibrary={()=>apiRef.current?.toggleSidebar({name:"default",tab:"library",force:true})} onAbout={()=>setAbout(true)} onExport={onExport} onOpenBackup={onOpenBackup} onBackup={onBackup}/><Brand/></>}
        headerEnd={<><span className="pd-spacer"/><button className="pd-filename" aria-label="Rename drawing" disabled={fm.busy} title="Rename drawing" onClick={()=>{setNewName(fm.fileName??'Untitled');setRenaming(true)}}>{fm.fileName??"Untitled"}{fm.dirty?" ●":""}</button>{syncPrefs.enabled&&<><span className={"pd-dot "+dotClass}/><span className="pd-status" data-status={status}>{connectionText}</span></>}<span className="pd-save" title="Automatic recovery on this device. Use Menu → Save to save a file." ref={saveRef}/><WindowControls/></>}
        apiRef={apiRef} state={ribbonState} desktop={desktop} lasso={lasso} onLasso={toggleLasso}
        recognizing={recognizing} onConvert={onTurnToText} onExport={onExport} onWidth={changeWidth}
        guideMode={guides} onGuides={setGuides} spacing={guideSpacing} onSpacing={setGuideSpacing}
        straighten={straighten} onStraighten={setStraighten} fill={fill} onFill={toggleFill}
        fillColor={fillColor} onFillColor={setFillColor} onQuality={()=>setQuality(true)} about={about} onAboutClose={()=>setAbout(false)}/>
      <div className="pd-canvas">
        <ConnectionBanner
          status={status}
          everConnected={syncPrefs.enabled&&everConnected}
          onReconnect={reconnectNow}
          onBackup={onBackup}
        />
        <DrawingTools apiRef={apiRef} blocked={fill||lasso||settings||quality||!!textPreview||renaming}/>
        <Board onApi={onApi} onChange={onChange} initialData={initialData} />
        <Guides mode={guides} spacing={guideSpacing} viewport={ribbonState?.viewport??null}/>
        <BucketFill apiRef={apiRef} enabled={fill} color={fillColor} onDone={finishFill} onMessage={showFlash}/>
        <StraightenLayer apiRef={apiRef} enabled={straighten&&!fill&&!lasso}/>
        {quality&&<FixturePanel apiRef={apiRef} onClose={()=>setQuality(false)}/>}
        <PenInputLayer
          apiRef={apiRef}
          enabled={desktop}
          penMode={penMode}
          suppressDrawing={fill}
          onLongPress={openMenuAt}
        />
        <LassoOverlay
          active={lasso}
          apiRef={apiRef}
          onDone={() => setLasso(false)}
        />
        {textPreview && (
          <TextBlockPreview
            blocks={textPreview.sel.blocks}
            viewport={textPreview.viewport}
            excluded={textPreview.excluded}
            onToggle={onToggleBlock}
            onConfirm={onConfirmText}
            onCancel={onCancelText}
          />
        )}
        {menu && !textPreview && (
          <SelectionMenu
            x={menu.x}
            y={menu.y}
            bounds={selectionBounds}
            onClose={() => setMenu(null)}
            actions={
              {
                onCopyPng,
                onCopySvg,
                onTurnToText: desktop ? onTurnToText : undefined,
                onDuplicate: onDuplicateSel,
                onDelete: onDeleteSel,
                onFront: onFrontSel,
                onBack: onBackSel,
                onExportPng: onExport,
              } satisfies MenuActions
            }
          />
        )}
        {flash && <div className="pd-flash">{flash}</div>}
      </div>
    </div>
  );
}

function RenameDialog({open,value,onChange,onClose,onConfirm}:{open:boolean;value:string;onChange:(s:string)=>void;onClose:()=>void;onConfirm:()=>Promise<void>}){const ref=useRef<HTMLElement>(null);useDialogFocus(open,ref,onClose);return open?<div className="pd-modal-shade"><section ref={ref} className="pd-dialog" role="dialog" aria-modal="true" aria-label="Rename drawing"><h2>Rename drawing</h2><label>Name<input aria-label="Drawing name" value={value} onChange={e=>onChange(e.target.value)}/></label><p>A saved drawing uses Save As to choose its new filename.</p><button className="pd-btn" disabled={!value.trim()} onClick={()=>void onConfirm()}>Rename</button><button className="pd-btn ghost" onClick={onClose}>Cancel</button></section></div>:null;}
