// Merge remote elements into local ones using last-write-wins by Excalidraw's
// `version` (tie-broken by `versionNonce`). Deleted elements carry `isDeleted`
// with a bumped version, so deletions propagate through the same path.

export function isNewer(a: any, b: any): boolean {
  const va = a.version ?? 0;
  const vb = b.version ?? 0;
  if (va !== vb) return va > vb;
  return (a.versionNonce ?? 0) > (b.versionNonce ?? 0);
}

export function reconcile(
  local: readonly any[],
  remote: readonly any[],
): { elements: any[]; changed: boolean } {
  const map = new Map<string, any>();
  for (const el of local) if (el && el.id) map.set(el.id, el);

  let changed = false;
  for (const el of remote) {
    if (!el || !el.id) continue;
    const cur = map.get(el.id);
    if (!cur || isNewer(el, cur)) {
      map.set(el.id, el);
      changed = true;
    }
  }
  const elements = Array.from(map.values());
  // Fractional indices are the engine's portable layer order. Map insertion
  // order alone silently loses bring-to-front changes on an existing peer.
  elements.sort((a, b) => typeof a.index === "string" && typeof b.index === "string"
    ? (a.index < b.index ? -1 : a.index > b.index ? 1 : 0) : 0);
  return { elements, changed };
}

// A compact signature of element ids, versions, nonces and deletion/order state,
// used to tell whether anything
// actually changed (so we don't rebroadcast applied remote edits — no echo loop).
export function versionSignature(elements: readonly any[]): string {
  return elements
    .map((e) => JSON.stringify([e.id, e.version ?? 0, e.versionNonce ?? 0, !!e.isDeleted, e.index ?? null]))
    .sort()
    .join("|");
}
