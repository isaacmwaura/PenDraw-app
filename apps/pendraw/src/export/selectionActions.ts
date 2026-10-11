import { exportToBlob, exportToSvg } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Shared "what am I acting on" helper: the current selection, or the whole
// canvas when nothing is selected.
function targetElements(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();
  const selectedIds = appState.selectedElementIds || {};
  const selected = elements.filter((e: any) => selectedIds[e.id] && !e.isDeleted);
  const toExport = selected.length > 0 ? selected : elements;
  return { toExport, files, appState, hasSelection: selected.length > 0 };
}

export type CopyResult = "copied" | "downloaded" | "empty";

async function pngBlob(api: ExcalidrawImperativeAPI): Promise<Blob | null> {
  const { toExport, files, appState } = targetElements(api);
  if (toExport.length === 0) return null;
  return exportToBlob({
    elements: toExport,
    files,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
    mimeType: "image/png",
    exportPadding: 16,
  });
}

async function svgString(api: ExcalidrawImperativeAPI): Promise<string | null> {
  const { toExport, files, appState } = targetElements(api);
  if (toExport.length === 0) return null;
  const svg = await exportToSvg({
    elements: toExport,
    files,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
    exportPadding: 16,
  });
  return new XMLSerializer().serializeToString(svg);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Copy the selection as a PNG image to the clipboard. Falls back to a file
// download if the clipboard image API isn't available (older WebView, denied
// permission), so the action never silently fails.
export async function copySelectionPng(api: ExcalidrawImperativeAPI): Promise<CopyResult> {
  const blob = await pngBlob(api);
  if (!blob) return "empty";
  try {
    if (navigator.clipboard && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "copied";
    }
  } catch {
    /* fall through to download */
  }
  downloadBlob(blob, "pendraw-selection.png");
  return "downloaded";
}

// Copy the selection as SVG source text to the clipboard (pasteable into code,
// design tools, docs). Falls back to a .svg file download if writing text fails.
export async function copySelectionSvg(api: ExcalidrawImperativeAPI): Promise<CopyResult> {
  const svg = await svgString(api);
  if (svg == null) return "empty";
  try {
    if (navigator.clipboard && "writeText" in navigator.clipboard) {
      await navigator.clipboard.writeText(svg);
      return "copied";
    }
  } catch {
    /* fall through to download */
  }
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "pendraw-selection.svg");
  return "downloaded";
}
