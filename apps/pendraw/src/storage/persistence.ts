import { serializeAsJSON, loadFromBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Local-browser persistence so a reload, crash, or disconnect never loses work.
// Elements + a little viewport state go in one key; images (which can be large)
// go in a second key that is dropped first if storage runs out of room.

const SCENE_KEY = "pendraw:editor-scene";
const FILES_KEY = "pendraw:editor-files";
const MIRROR_KEY = "pendraw:mirror-scene";

function pickAppState(a: any) {
  if (!a) return {};
  return {
    viewBackgroundColor: a.viewBackgroundColor,
    scrollX: a.scrollX,
    scrollY: a.scrollY,
    zoom: a.zoom,
  };
}

export function saveEditorScene(elements: any, appState: any, files: any): "saved" | "partial" | "failed" {
  try {
    localStorage.setItem(
      SCENE_KEY,
      JSON.stringify({ elements, appState: pickAppState(appState) }),
    );
    // Images are stored separately; if they don't fit, keep the shapes/ink anyway.
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify(files ?? {}));
    } catch {
      return "partial";
    }
    return "saved";
  } catch {
    return "failed";
  }
}

export function loadEditorScene():
  | { elements: any; appState: any; files: any }
  | null {
  try {
    const raw = localStorage.getItem(SCENE_KEY);
    if (!raw) return null;
    const { elements, appState } = JSON.parse(raw);
    let files = {};
    try {
      files = JSON.parse(localStorage.getItem(FILES_KEY) || "{}");
    } catch {
      files = {};
    }
    return { elements: elements ?? [], appState: appState ?? {}, files };
  } catch {
    return null;
  }
}

// The mirror stores the last scene it received, so a reload shows the last known
// board immediately instead of a blank canvas.
export function saveMirrorScene(rawSceneMessage: string) {
  try {
    localStorage.setItem(MIRROR_KEY, rawSceneMessage);
  } catch {
    /* ignore */
  }
}

export function loadMirrorScene(): { elements: any; files: any } | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    return { elements: m.elements ?? [], files: m.files ?? {} };
  } catch {
    return null;
  }
}

// Downloads the current drawing as a .excalidraw file (the standard format that
// can be re-opened later). Used by the "Download backup" button.
export function downloadBackup(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();
  const json = serializeAsJSON(elements, appState, files, "local");
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.download = `pendraw-backup-${stamp}.excalidraw`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Opens a file picker for a .excalidraw backup and loads it into the canvas,
// replacing the current drawing (with a confirmation if the canvas isn't empty).
export function openBackupFile(api: ExcalidrawImperativeAPI) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".excalidraw,application/json";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const existing = api.getSceneElements();
    if (
      existing.length > 0 &&
      !window.confirm("Loading a backup will replace the current drawing. Continue?")
    ) {
      return;
    }
    try {
      const scene = await loadFromBlob(file, null, null);
      api.updateScene({ elements: scene.elements, appState: scene.appState });
      if (scene.files) {
        const files = Object.values(scene.files);
        if (files.length) api.addFiles(files as any);
      }
      api.scrollToContent(scene.elements, { fitToContent: true });
    } catch {
      window.alert("Sorry — that file could not be opened as a PenDraw/Excalidraw backup.");
    }
  };
  input.click();
}
