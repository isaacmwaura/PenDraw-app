// Relay + authoritative merged store for two-way (collaborative) editing.
// Every peer sends its changed elements; the hub merges them per-element using
// last-write-wins by Excalidraw's `version` (tie-broken by `versionNonce`), keeps
// the merged board so late joiners catch up, and broadcasts each message to the
// other peers, who merge it locally with the same rule. No sockets in here, so it
// is easy to unit-test.

export function isNewer(a, b) {
  const va = a.version ?? 0;
  const vb = b.version ?? 0;
  if (va !== vb) return va > vb;
  return (a.versionNonce ?? 0) > (b.versionNonce ?? 0);
}

export class Hub {
  constructor() {
    /** @type {Set<{send:(raw:string)=>void}>} */
    this.clients = new Set();
    /** @type {Map<string, any>} merged elements by id (includes deleted) */
    this.elements = new Map();
    /** @type {Record<string, any>} merged image files by id */
    this.files = {};
    /** @type {any} last viewport reported by an editor (for lock-to-presenter) */
    this.viewport = null;
  }

  add(client) {
    this.clients.add(client);
    const snap = this.snapshot();
    if (snap) {
      try {
        client.send(snap);
      } catch {
        /* ignore */
      }
    }
  }

  remove(client) {
    this.clients.delete(client);
  }

  handle(sender, raw) {
    let msg;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!msg || msg.type !== "scene") return;

    if (Array.isArray(msg.elements)) {
      for (const el of msg.elements) {
        if (!el || !el.id) continue;
        const cur = this.elements.get(el.id);
        if (!cur || isNewer(el, cur)) this.elements.set(el.id, el);
      }
    }
    if (msg.files && typeof msg.files === "object") {
      for (const [id, file] of Object.entries(msg.files)) this.files[id] = file;
    }
    // Only an editor's viewport drives "lock to presenter".
    if (msg.role === "editor" && msg.viewport) this.viewport = msg.viewport;

    const out = typeof raw === "string" ? raw : JSON.stringify(raw);
    for (const client of this.clients) {
      if (client === sender) continue;
      try {
        client.send(out);
      } catch {
        /* ignore */
      }
    }
  }

  snapshot() {
    if (this.elements.size === 0 && Object.keys(this.files).length === 0) return null;
    return JSON.stringify({
      type: "scene",
      role: "server",
      elements: Array.from(this.elements.values()),
      files: this.files,
      viewport: this.viewport,
    });
  }
}
