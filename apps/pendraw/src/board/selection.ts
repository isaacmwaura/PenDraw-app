import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export function cloneSelection(elements: readonly any[], ids: Readonly<Record<string, boolean>>, id: () => string = () => crypto.randomUUID()): any[] {
  const selected = new Set(elements.filter(e => ids[e.id] && !e.isDeleted).map(e => e.id));
  // Bound text belongs to its selected container even if the engine did not
  // include the text id in selectedElementIds.
  for (const e of elements) if (!e.isDeleted && e.containerId && selected.has(e.containerId)) selected.add(e.id);
  const remap = new Map([...selected].map(old => [old, id()]));
  const groups = new Map<string, string>();
  const bind = (b: any) => b && remap.has(b.elementId) ? {...b, elementId: remap.get(b.elementId)} : null;
  return elements.filter(e => selected.has(e.id)).map(e => {
    const copy = structuredClone(e);
    return { ...copy, ...(copy.customData?.pendrawFill ? {customData:{...copy.customData,boundaryIds:(copy.customData.boundaryIds??[]).flatMap((old:string)=>remap.has(old)?[remap.get(old)]:[])}} : {}), id: remap.get(e.id), x: e.x + 16, y: e.y + 16, index: null,
      seed: Math.floor(Math.random() * 2 ** 31), version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now(),
      groupIds: (e.groupIds ?? []).map((g: string) => { if (!groups.has(g)) groups.set(g, id()); return groups.get(g); }),
      containerId: e.containerId ? remap.get(e.containerId) ?? null : null,
      frameId: e.frameId ? remap.get(e.frameId) ?? e.frameId : null,
      boundElements: e.boundElements?.filter((b: any) => remap.has(b.id)).map((b: any) => ({...b, id: remap.get(b.id)})) ?? null,
      ...("startBinding" in e ? {startBinding: bind(e.startBinding), endBinding: bind(e.endBinding)} : {}),
    };
  });
}
export function duplicateSelection(api: ExcalidrawImperativeAPI): void {
  const copies = cloneSelection(api.getSceneElementsIncludingDeleted(), api.getAppState().selectedElementIds);
  if (!copies.length) return;
  api.updateScene({elements: [...api.getSceneElementsIncludingDeleted(), ...copies],
    appState: {selectedElementIds: Object.fromEntries(copies.map(e => [e.id, true]))}, captureUpdate: CaptureUpdateAction.IMMEDIATELY});
}
export function moveSelectionLayer(api: ExcalidrawImperativeAPI, front: boolean): void {
  const ids = api.getAppState().selectedElementIds;
  const all = api.getSceneElementsIncludingDeleted();
  const selected = all.filter(e => ids[e.id] || ("containerId" in e && e.containerId && ids[e.containerId]));
  if (!selected.length) return;
  const chosen = new Set(selected.map(e => e.id));
  const rest = all.filter(e => !chosen.has(e.id));
  // Invalidate moved fractional indices. The engine allocates indices for the
  // new order. Bump versions so peers can accept that order change.
  const moved = selected.map(e => newElementWith(e, {index: null} as any));
  api.updateScene({elements: front ? [...rest, ...moved] : [...moved, ...rest], captureUpdate: CaptureUpdateAction.IMMEDIATELY});
}
