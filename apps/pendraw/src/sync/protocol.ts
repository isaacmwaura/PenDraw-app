// Shared shapes and helpers for the one-way sync between editor and mirror.

// Fixed port the little Node sync server listens on. The client always talks to
// this port on whatever host served the page, so it works in dev and on the LAN.
export const SYNC_PORT = 4000;

export type Viewport = { scrollX: number; scrollY: number; zoom: number };

export type SceneMessage = {
  type: "scene";
  elements: unknown[];
  files: Record<string, unknown>;
  viewport: Viewport;
};

export function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // The sync server serves the page AND the WebSocket on the same origin, so
  // connect back to whatever port served this page. Fall back to the default
  // port when opened without one, and special-case the Vite dev port (5173),
  // where the sync server runs separately on SYNC_PORT.
  const pagePort = window.location.port;
  const port = !pagePort || pagePort === "5173" ? String(SYNC_PORT) : pagePort;
  const query = new URLSearchParams(window.location.search);
  const key = query.get("key"), session = query.get("session");
  const access = key && session ? `/ws?${new URLSearchParams({key,session})}` : "";
  return `${proto}//${window.location.hostname}:${port}${access}`;
}
