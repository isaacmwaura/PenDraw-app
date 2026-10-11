import { serializeAsJSON, loadFromBlob, CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

// Native file management for the desktop app: New / Open / Save / Save As to
// standard .excalidraw files. The dialog plugin provides the OS file picker;
// small Rust commands (read_text_file / write_text_file) do the actual disk I/O
// on the user-chosen path. Browser builds don't use any of this (see FileMenu,
// which only renders on desktop) — they keep the download/upload backup buttons.

export const FILE_EXT = "excalidraw";
const FILTERS = [{ name: "PenDraw drawing", extensions: [FILE_EXT] }];

export function isDesktop(): boolean {
  return isTauri();
}

// Serialize the current scene to the standard .excalidraw JSON string.
export function serializeScene(api: ExcalidrawImperativeAPI): string {
  return serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
}

// Load a .excalidraw JSON string into the canvas (via Excalidraw's own loader,
// so it normalises appState and restores images), then fit the view to it.
export async function applySceneJSON(api: ExcalidrawImperativeAPI, text: string, mayApply = () => true, beforeReplace = () => {}): Promise<boolean> {
  const blob = new Blob([text], { type: "application/json" });
  const scene = await loadFromBlob(blob, null, null);
  if (!mayApply()) return false;
  beforeReplace();
  // A new document must not retain another file's undo history.
  const penMode = api.getAppState().penMode;
  api.resetScene();
  if (scene.files) {
    const files = Object.values(scene.files);
    if (files.length) api.addFiles(files as any);
  }
  api.updateScene({ elements: scene.elements, appState: { ...scene.appState, penMode }, captureUpdate: CaptureUpdateAction.NEVER });
  api.scrollToContent(scene.elements, { fitToContent: true });
  return true;
}

// OS "open" picker → absolute path, or null if cancelled.
export async function pickOpenPath(): Promise<string | null> {
  const res = await openDialog({ multiple: false, directory: false, filters: FILTERS });
  return typeof res === "string" ? res : null;
}

// OS "save as" picker → absolute path, or null if cancelled.
export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  const res = await saveDialog({ filters: FILTERS, defaultPath });
  return res ?? null;
}

export function readFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export function writeFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_text_file", { path, contents });
}

// The file name (with extension) for display, from a full path.
export function baseName(path: string | null): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || null;
}
