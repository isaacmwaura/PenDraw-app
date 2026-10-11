import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { wsUrl } from "./protocol";
import { createResilientSocket, type ConnStatus } from "./connection";
import { reconcile, versionSignature } from "./reconcile";
import { saveMirrorScene } from "../storage/persistence";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

export type Role = "editor" | "mirror";

// Builds the outgoing scene message. Only the editor advertises its viewport
// (that is what "lock to presenter" follows).
function buildSceneMessage(api: ExcalidrawImperativeAPI, role: Role): string {
  const elements = api.getSceneElementsIncludingDeleted();
  const files = api.getFiles();
  const appState = api.getAppState();
  return JSON.stringify({
    type: "scene",
    role,
    elements,
    files,
    viewport:
      role === "editor"
        ? { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom?.value ?? 1 }
        : null,
  });
}

function viewportSig(api: ExcalidrawImperativeAPI): string {
  const a = api.getAppState();
  return `${a.scrollX},${a.scrollY},${a.zoom?.value ?? 1}`;
}

// Two-way collaborative sync used by BOTH the editor and the mirror. Each peer
// sends its changed elements and merges everyone else's changes locally. An
// echo-guard (version signature) stops applied remote edits from looping back.
export function usePeerSync(
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>,
  role: Role,
  lockToPresenter: boolean,
  options?: { enabled?: boolean; url?: string; onLocalEdit?: () => void },
) {
  const enabled = options?.enabled ?? true;
  const url = options?.url ?? wsUrl();
  const [status, setStatus] = useState<ConnStatus>(enabled ? "connecting" : "offline");
  const paused = useRef(false);
  const connRef = useRef<ReturnType<typeof createResilientSocket> | null>(null);
  const lockRef = useRef(lockToPresenter);
  lockRef.current = lockToPresenter;
  const roleRef = useRef<Role>(role);
  roleRef.current = role;
  const onLocalEditRef = useRef(options?.onLocalEdit);
  onLocalEditRef.current = options?.onLocalEdit;

  const lastSentEls = useRef<string>("");
  const lastSentVp = useRef<string>("");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  function applyViewport(scene: any, msg: any) {
    if (roleRef.current === "mirror" && lockRef.current && msg.viewport) {
      scene.appState = {
        scrollX: msg.viewport.scrollX,
        scrollY: msg.viewport.scrollY,
        zoom: { value: msg.viewport.zoom },
      };
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!enabled) {
      // Offline-first: open no socket at all, so there is no reconnect loop.
      connRef.current = null;
      setStatus("offline");
      return;
    }
    paused.current = false;
    let readyTimer: number | undefined;
    let waiting: string[] = [];
    let sendWhenReady: ((raw:string)=>void) | null = null;
    const receive = (data: string) => {
        if (paused.current) return;
        let msg: any;
        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }
        if (!msg || msg.type !== "scene") return;
        const api = apiRef.current;
        if (!api) { waiting.push(data); return; }

        if (msg.files) {
          const files = Object.values(msg.files);
          if (files.length) api.addFiles(files as any);
        }

        const local = api.getSceneElementsIncludingDeleted();
        const { elements, changed } = reconcile(local, msg.elements || []);

        if (changed) {
          const scene: any = { elements, captureUpdate: CaptureUpdateAction.NEVER };
          applyViewport(scene, msg);
          api.updateScene(scene);
          // Excalidraw may BUMP element versions when applying via updateScene.
          // Adopt whatever versions it actually stored as our "last sent" baseline,
          // so the onChange this triggers is seen as "nothing new" — without this,
          // the bumped versions get rebroadcast and the two peers loop versions
          // upward forever.
          lastSentEls.current = versionSignature(api.getSceneElementsIncludingDeleted());
          if (roleRef.current === "mirror") {
            saveMirrorScene(JSON.stringify({ elements: api.getSceneElementsIncludingDeleted(), files: api.getFiles() }));
          }
        } else {
          // No element change, but maybe follow the presenter's pan/zoom.
          const scene: any = {};
          if (applyViewport(scene, msg)) api.updateScene(scene);
        }

    };
    const conn = createResilientSocket({
      url, onStatus: setStatus,
      onOpen: (send) => {
        sendWhenReady=send;
        const ready=()=>{
          if(!apiRef.current){readyTimer=window.setTimeout(ready,50);return;}
          const queued=waiting;waiting=[];queued.forEach(receive);
          const api=apiRef.current;
          if(api.getSceneElementsIncludingDeleted().length){
            sendWhenReady?.(buildSceneMessage(api,roleRef.current));
            lastSentEls.current=versionSignature(api.getSceneElementsIncludingDeleted());
            lastSentVp.current=viewportSig(api);
          }
        };
        ready();
      },
      onMessage: receive,
    });
    connRef.current = conn;
    return () => {
      window.clearTimeout(readyTimer);waiting=[];sendWhenReady=null;
      conn.close();
      if (connRef.current === conn) connRef.current = null;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [apiRef, enabled, url]);

  // Called on every local change (throttled). Sends only when something actually
  // changed since the last send — this is what prevents feedback loops.
  const pushLocalChange = useCallback(() => {
    if (timer.current != null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const api = apiRef.current;
      if (!api) return;
      const els = api.getSceneElementsIncludingDeleted();
      if (roleRef.current === "mirror") {
        saveMirrorScene(JSON.stringify({ elements: els, files: api.getFiles() }));
      }
      const elsSig = versionSignature(els);
      const vpSig = roleRef.current === "editor" ? viewportSig(api) : "";
      if (elsSig === lastSentEls.current && vpSig === lastSentVp.current) return;
      const elementsChanged = elsSig !== lastSentEls.current;
      lastSentEls.current = elsSig;
      lastSentVp.current = vpSig;
      connRef.current?.send(buildSceneMessage(api, roleRef.current));
      // A genuine local element edit (not an applied remote change, which is
      // recorded above before its onChange fires) — used for mirror auto-unlock.
      if (elementsChanged) onLocalEditRef.current?.();
    }, 33);
  }, [apiRef]);

  const reconnectNow = useCallback(() => connRef.current?.reconnectNow(), []);

  const disconnectNow = useCallback(() => {
    paused.current = true;
    connRef.current?.close();
    connRef.current = null;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("offline");
  }, []);
  return { status, reconnectNow, pushLocalChange, disconnectNow };
}
