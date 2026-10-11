import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// Exports the currently selected shapes (or the whole canvas if nothing is
// selected) as a PNG image and triggers a download. This is the "lasso -> PNG"
// feature: select with the lasso/marquee, then click Export.
export async function exportSelectionToPng(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const files = api.getFiles();

  const selectedIds = appState.selectedElementIds || {};
  const selected = elements.filter((e: any) => selectedIds[e.id] && !e.isDeleted);
  const toExport = selected.length > 0 ? selected : elements;

  if (toExport.length === 0) {
    window.alert("Nothing to export yet — draw or select something first.");
    return;
  }

  const blob = await exportToBlob({
    elements: toExport,
    files,
    appState: { ...appState, exportBackground: true, exportWithDarkMode: false },
    mimeType: "image/png",
    exportPadding: 16,
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = selected.length > 0 ? "pendraw-selection.png" : "pendraw-canvas.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
