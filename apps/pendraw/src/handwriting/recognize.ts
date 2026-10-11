import { convertToExcalidrawElements, CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import {absoluteInkPoints} from "./inkGeometry";
import {writingRows} from './writingRows';
import { possibleDrawing, selectionFontSize } from "./textPolicy";
import { versionSignature } from "../sync/reconcile";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Handwriting -> text. This is a DESKTOP-only feature: it calls the native
// Windows handwriting engine (Windows Ink Analysis / InkAnalyzer) through the
// Tauri backend. In the plain browser build `isDesktopApp()` is false and the
// button never shows (the browser regains recognition later via the math path).

export function isDesktopApp(): boolean {
  return isTauri();
}

type Stroke = [number, number][];

// Block granularity for Turn-to-text. "line" replaces each line in place (best
// size/position fidelity); "paragraph"/"region" convert bigger chunks. Kept as a
// constant so the line-vs-paragraph A/B test is a one-line change (see plan 6b).
export const TEXT_GRANULARITY: "line" | "paragraph" | "region" = "line";

// One recognized block of text, as returned by the native engine. `x, y` is the
// block's top-left corner and `width, height` its size, all in scene coordinates
// (the same space we send). `stroke_indices` index into the `strokes` array we
// sent — i.e. which selected ink strokes turned into this block.
export type TextBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke_indices: number[];
  keepAsInk?: boolean;
};

// The result of analysing a selection: the recognized blocks (in scene
// coordinates) plus the ink elements that were sent, index-aligned to the
// stroke indices each block reports. Held between the preview and the apply.
export type AnalyzedSelection = {
  blocks: TextBlock[];
  ink: any[];
  signature: string;
  fontSize: number;
};

// Step 1 — analyse only. Sends the selected handwriting to the engine and gets
// back the recognized blocks, WITHOUT changing the canvas. Returns null (after
// showing a message) if there's nothing to convert. The caller can preview the
// blocks, then call applyBlocks to commit.
export async function analyzeSelection(
  api: ExcalidrawImperativeAPI,
): Promise<AnalyzedSelection | null> {
  const appState = api.getAppState();
  const selectedIds = appState.selectedElementIds || {};
  const elements = api.getSceneElements();
  // Snapshot before awaiting native analysis. The engine can mutate live
  // elements while the user moves or edits them.
  const ink = structuredClone(elements.filter(
    (e: any) => selectedIds[e.id] && !e.isDeleted && e.type === "freedraw",
  ));
  const signature = versionSignature(ink);

  if (ink.length === 0) {
    window.alert("Lasso some handwriting first, then click Turn to text.");
    return null;
  }

  // Each freedraw element is one stroke; its points are offsets from (x, y).
  // strokes[i] corresponds to ink[i], so a returned stroke index maps straight
  // back to the Excalidraw element it came from.
  const strokes: Stroke[] = ink.map((e:any)=>absoluteInkPoints(e));

  let blocks: TextBlock[];
  try {
    blocks = [];
    for (const row of writingRows(strokes)) {
      const recognized = await invoke<TextBlock[]>("recognize_handwriting", { strokes:row.map(i=>strokes[i]), granularity:TEXT_GRANULARITY });
      blocks.push(...recognized.map(b=>({...b,stroke_indices:b.stroke_indices.flatMap(i=>Number.isInteger(i)&&i>=0&&i<row.length?[row[i]]:[])})));
    }
  } catch (e) {
    window.alert("Handwriting recognition failed: " + e);
    return null;
  }

  // Keep only blocks that actually read as something and own some strokes.
  const usable = blocks
    .map((b) => ({ ...b, text: b.text.replace(/\r\n/g, "\n").trim(),
      stroke_indices: b.stroke_indices.filter((i) => Number.isInteger(i) && i >= 0 && i < ink.length) }))
    .filter((b) => b.text && b.stroke_indices.length > 0
      && [b.x, b.y, b.width, b.height].every(Number.isFinite)
      && b.width >= 0 && b.height > 0)
    .map((b) => ({ ...b, keepAsInk: possibleDrawing(b) }));

  if (usable.length === 0) {
    window.alert("Couldn't read that handwriting — try writing a bit more clearly.");
    return null;
  }

  return { blocks: usable, ink, signature, fontSize: selectionFontSize(usable) };
}

export function selectionIsCurrent(api: ExcalidrawImperativeAPI, selection: AnalyzedSelection): boolean {
  const ids = new Set(selection.ink.map((e) => e.id));
  const current = api.getSceneElements().filter((e) => ids.has(e.id));
  return current.length === ids.size && versionSignature(current) === selection.signature;
}

// Step 2 — apply. Drops one text element per block back where the ink was (at
// roughly the same size) and removes only the strokes that became text, leaving
// drawings and any unread ink in place. captureUpdate: IMMEDIATELY records the
// whole thing as one undo step, so Ctrl+Z restores the original handwriting.
export function applyBlocks(
  api: ExcalidrawImperativeAPI,
  selection: AnalyzedSelection,
): boolean {
  if (!selectionIsCurrent(api, selection)) return false;
  const { blocks, ink } = selection;
  const elements = api.getSceneElementsIncludingDeleted();
  const specs: any[] = [];
  const consumed = new Set<number>(); // stroke indices that became text
  for (const b of blocks) {
    if (!b.text) continue;
    for (const idx of b.stroke_indices) consumed.add(idx);
    // Fixed during analysis, before exclusions. Toggling a preview block
    // cannot resize the other lines. Every converted block uses this one size.
    specs.push({ type: "text", x: b.x, y: b.y, text: b.text, fontSize: selection.fontSize });
  }
  if (specs.length === 0) return true;

  const textEls = convertToExcalidrawElements(specs);
  const consumedIds = new Set<string>();
  consumed.forEach((idx) => {
    const el = ink[idx] as any;
    if (el) consumedIds.add(el.id);
  });
  // Keep versioned deletion records so peers cannot resurrect consumed ink.
  const remaining = elements.map((e) => consumedIds.has(e.id) ? newElementWith(e, { isDeleted: true }) : e);
  api.updateScene({
    elements: [...remaining, ...textEls],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
}
