import { useEffect,useMemo } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {useAppearance} from "../appearance/context";
import {loadLibrary,saveLibrary} from "../storage/library";
import { installHideNativeStrokeWidth } from "./hideNativeControls";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

type Props = {
  /** When true the canvas is read-only (used by the mirror). */
  viewMode?: boolean;
  /** Receives the imperative API once Excalidraw has mounted. */
  onApi?: (api: ExcalidrawImperativeAPI) => void;
  /** Fires on every change (elements, appState, files). Editor uses this to sync. */
  onChange?: (elements: any, appState: any, files: any) => void;
  /** Scene to load on first mount (restored from local storage). */
  initialData?: any;
};

// Thin wrapper around the Excalidraw drawing engine.
export default function Board({ viewMode, onApi, onChange, initialData }: Props) {
  const {theme}=useAppearance();
  const libraryItems=useMemo(loadLibrary,[]);
  useEffect(() => {
    installHideNativeStrokeWidth();
  }, []);

  return (
    <Excalidraw
      excalidrawAPI={(api) => {
        // Debug hook: lets automated tests reach the API. Harmless in production.
        (window as unknown as { __pdApi?: unknown }).__pdApi = api;
        onApi?.(api);
      }}
      onChange={onChange}
      viewModeEnabled={viewMode}
      theme={theme}
      onLibraryChange={saveLibrary}
      initialData={{...initialData,libraryItems}}
    />
  );
}
