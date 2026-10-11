import { useEffect, useRef, useState } from 'react';
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { clientToScene } from '../board/coordinates';
import { useDialogFocus } from '../components/useDialogFocus';
import { loadPens } from '../components/penPresets';

const shapes = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow'];
type Box = { x: number; y: number; width: number; height: number; clientX: number; clientY: number; zoom: number };

// Shapes remain native gestures. Only a drawn text box needs its own draft.
export default function DrawingTools({ apiRef, blocked }: {
  apiRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>; blocked: boolean;
}) {
  const [draft, setDraft] = useState<Box | null>(null), [pending, setPending] = useState<Box | null>(null);
  const [text, setText] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const cancel = () => { setPending(null); setText(''); };
  useDialogFocus(!!pending, dialog, cancel);
  useEffect(() => {
    if (blocked) return;
    let gesture: { id: number; type: string; x: number; y: number; view: any; before: Set<string> } | null = null;
    let timer: number | undefined;
    const down = (e: PointerEvent) => {
      const api = apiRef.current;
      if (!api || e.button !== 0 || e.buttons & (2 | 32) || !(e.target instanceof Element) || !e.target.closest('.excalidraw canvas')) return;
      const view = api.getAppState(), type = view.activeTool.type;
      if (!shapes.includes(type) && type !== 'text') return;
      if (e.pointerType === 'touch' && view.penMode) return;
      gesture = { id: e.pointerId, type, x: e.clientX, y: e.clientY, view, before: new Set(api.getSceneElements().map(el => el.id)) };
      if (type === 'text') {
        document.querySelector<HTMLElement>('.excalidraw-container')?.focus({preventScroll:true});
        e.preventDefault(); e.stopImmediatePropagation();
      }
    };
    const box = (e: PointerEvent): Box => {
      const g = gesture!, start = clientToScene(g.x, g.y, g.view), end = clientToScene(e.clientX, e.clientY, g.view);
      return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(80, Math.abs(end.x - start.x)),
        height: Math.max(40, Math.abs(end.y - start.y)), clientX: Math.min(g.x, e.clientX), clientY: Math.min(g.y, e.clientY), zoom: g.view.zoom.value };
    };
    const move = (e: PointerEvent) => {
      if (gesture?.id !== e.pointerId || gesture.type !== 'text') return;
      e.preventDefault(); e.stopImmediatePropagation(); setDraft(box(e));
    };
    const up = (e: PointerEvent) => {
      if (gesture?.id !== e.pointerId) return;
      const g = gesture;
      if (g.type === 'text') {
        e.preventDefault(); e.stopImmediatePropagation(); setDraft(null);
        if (e.type !== 'pointercancel') { setText(''); setPending(box(e)); }
      } else if (e.type !== 'pointercancel') {
        // Let native finalization and width normalization finish before restoring ink.
        timer = window.setTimeout(() => {
          const api = apiRef.current;
          if (!api || !api.getSceneElements().some(el => !g.before.has(el.id) && el.type === g.type)) return;
          if (![g.type, 'selection'].includes(api.getAppState().activeTool.type)) return;
          let index = 0; try { index = Number(localStorage.getItem('pendraw:active-pen')) || 0; } catch { /* default */ }
          const pen = loadPens()[index] ?? loadPens()[0];
          api.setActiveTool({ type: 'freedraw' });
          api.updateScene({ appState: { selectedElementIds: {}, currentItemStrokeColor: pen.color, currentItemStrokeWidth: pen.width, currentItemOpacity: pen.opacity } });
        }, 0);
      }
      gesture = null;
    };
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    const blur = () => { gesture = null; setDraft(null); };
    window.addEventListener('blur', blur);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); window.removeEventListener('blur', blur); };
  }, [apiRef, blocked]);
  const add = () => {
    const api = apiRef.current;
    if (!api || !pending || !text.trim()) return;
    const s = api.getAppState();
    const elements = convertToExcalidrawElements([{ type: 'rectangle', x: pending.x, y: pending.y, width: pending.width, height: pending.height,
      strokeColor: 'transparent', backgroundColor: s.currentItemBackgroundColor, fillStyle: 'solid', roughness: 0,
      customData: { pendrawTextBox: true }, label: { text, fontSize: s.currentItemFontSize, fontFamily: s.currentItemFontFamily,
        strokeColor: s.currentItemStrokeColor, textAlign: s.currentItemTextAlign, verticalAlign: 'top' } } as any]);
    api.setActiveTool({ type: 'selection' });
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
      appState: { selectedElementIds: { [elements[0].id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    cancel();
  };
  return <>
    {draft && <div className="pd-textbox-draft" style={{ left: draft.clientX, top: draft.clientY, width: draft.width * draft.zoom, height: draft.height * draft.zoom }} />}
    {pending && <div className="pd-modal-shade"><section ref={dialog} className="pd-dialog" role="dialog" aria-modal="true" aria-label="Write in text box">
      <h2>Text box</h2><label>Text<textarea aria-label="Text box content" value={text} onChange={e => setText(e.target.value)} /></label>
      <p>Use Insert to choose the font, size and colours. Double-tap the finished box to edit its text.</p>
      <div className="pd-dialog-actions"><button className="pd-btn" disabled={!text.trim()} onClick={add}>Add text</button><button className="pd-btn ghost" onClick={cancel}>Cancel</button></div>
    </section></div>}
  </>;
}
