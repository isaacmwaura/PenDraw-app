import { isTauri } from "@tauri-apps/api/core";

// Desktop-only browser tweaks. Returns a cleanup function.
//
// Suppress the native WebView2 context menu so it never appears on top of
// Excalidraw's own menu on right-click / pen press-and-hold (the "two
// overlapping menus" bug). The v0.1.1 version listened in the *bubble* phase,
// but Excalidraw calls stopPropagation on contextmenu to show its own menu, so
// a bubble-phase window listener never ran and the OS menu still appeared.
// Listening in the *capture* phase runs before Excalidraw can stop the event,
// so preventDefault reliably kills the OS menu. Excalidraw's menu is React-
// rendered (not the OS menu) and is unaffected — only the duplicate OS menu goes.
export function installDesktopBehaviors(): () => void {
  if (!isTauri()) return () => {};
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  window.addEventListener("contextmenu", onContextMenu, true);
  return () => window.removeEventListener("contextmenu", onContextMenu, true);
}
