import { SYNC_PORT, wsUrl } from "./protocol";

// Where the user's mirror-connection choice is stored. The desktop app is
// offline-first: it does NOT connect unless the user opts in here. The browser
// app defaults to connecting to its own origin (the LAN mirror flow).

const KEY = "pendraw:sync-prefs";

export type SyncPrefs = {
  /** When false, no socket is opened at all (fully offline). */
  enabled: boolean;
  /** Contributor mirror address: "host", "host:port", or a full ws:// URL. */
  address: string;
};

export function loadSyncPrefs(isDesktop: boolean): SyncPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      // A built-in host session is temporary. Start sharing deliberately after launch.
      if (isDesktop && typeof p.address === "string" && p.address.includes("/ws?key=")) return {enabled:false,address:""};
      return { enabled: !!p.enabled, address: typeof p.address === "string" ? p.address : "" };
    }
  } catch {
    /* ignore */
  }
  // Desktop: off by default (offline-first). Browser: on (same-origin mirror).
  return { enabled: !isDesktop, address: "" };
}

export function saveSyncPrefs(p: SyncPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// Turns a user-typed address into a WebSocket URL. Empty falls back to the
// page's own origin (the browser mirror flow).
export function wsUrlFromAddress(address: string): string {
  const a = (address || "").trim();
  if (!a) return wsUrl();
  if (/^wss?:\/\//i.test(a)) return a;
  if (/^https?:\/\//i.test(a)) {
    const link = new URL(a);
    link.protocol = link.protocol === "https:" ? "wss:" : "ws:";
    if (link.searchParams.has("key")) {
      link.pathname = "/ws";
      link.searchParams.delete("mirror");
    }
    return link.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostport = a.replace(/^https?:\/\//i, "");
  const withPort = hostport.includes(":") ? hostport : `${hostport}:${SYNC_PORT}`;
  return `${proto}//${withPort}`;
}
