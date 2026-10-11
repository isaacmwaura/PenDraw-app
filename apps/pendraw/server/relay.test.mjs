import { describe, it, expect } from "vitest";
import { Hub, isNewer } from "./relay.mjs";

function fakeClient() {
  return {
    sent: [],
    send(raw) {
      this.sent.push(raw);
    },
  };
}

const elem = (id, version, versionNonce = 0) => ({ id, version, versionNonce });
const sceneMsg = (elements, extra = {}) =>
  JSON.stringify({ type: "scene", role: "editor", elements, files: {}, viewport: null, ...extra });

describe("Hub (relay + merged store)", () => {
  it("broadcasts a scene to other clients but not the sender", () => {
    const hub = new Hub();
    const a = fakeClient();
    const b = fakeClient();
    hub.add(a);
    hub.add(b);

    hub.handle(a, sceneMsg([elem("x", 1)]));

    expect(a.sent.length).toBe(0);
    expect(b.sent.length).toBe(1);
    expect(JSON.parse(b.sent[0]).elements[0].id).toBe("x");
  });

  it("ignores non-scene and malformed messages", () => {
    const hub = new Hub();
    const a = fakeClient();
    const b = fakeClient();
    hub.add(a);
    hub.add(b);

    hub.handle(a, JSON.stringify({ type: "hello" }));
    expect(() => hub.handle(a, "{not json")).not.toThrow();

    expect(b.sent.length).toBe(0);
    expect(hub.snapshot()).toBe(null);
  });

  it("merges elements by version (newer wins, order-independent)", () => {
    const hub = new Hub();
    const a = fakeClient();
    hub.add(a);

    hub.handle(a, sceneMsg([elem("x", 1)]));
    hub.handle(a, sceneMsg([elem("x", 5)]));
    expect(JSON.parse(hub.snapshot()).elements.find((e) => e.id === "x").version).toBe(5);

    // An older version must not overwrite the newer stored one.
    hub.handle(a, sceneMsg([elem("x", 3)]));
    expect(JSON.parse(hub.snapshot()).elements.find((e) => e.id === "x").version).toBe(5);
  });

  it("gives a late joiner a merged snapshot of the whole board", () => {
    const hub = new Hub();
    const a = fakeClient();
    hub.add(a);
    hub.handle(a, sceneMsg([elem("x", 2)]));
    hub.handle(a, sceneMsg([elem("y", 1)]));

    const late = fakeClient();
    hub.add(late);

    const snap = JSON.parse(late.sent[0]);
    expect(snap.type).toBe("scene");
    expect(snap.elements.map((e) => e.id).sort()).toEqual(["x", "y"]);
  });

  it("stops sending to a removed client", () => {
    const hub = new Hub();
    const a = fakeClient();
    const b = fakeClient();
    hub.add(a);
    hub.add(b);
    hub.remove(b);

    hub.handle(a, sceneMsg([elem("x", 1)]));
    expect(b.sent.length).toBe(0);
  });

  it("remembers only an editor's viewport for lock-to-presenter", () => {
    const hub = new Hub();
    const a = fakeClient();
    hub.add(a);
    hub.handle(a, sceneMsg([elem("x", 1)], { role: "mirror", viewport: { scrollX: 9, scrollY: 9, zoom: 1 } }));
    expect(hub.viewport).toBe(null); // mirror viewport ignored
    hub.handle(a, sceneMsg([elem("x", 2)], { role: "editor", viewport: { scrollX: 4, scrollY: 5, zoom: 2 } }));
    expect(hub.viewport).toEqual({ scrollX: 4, scrollY: 5, zoom: 2 });
  });

  it("isNewer compares version then versionNonce", () => {
    expect(isNewer(elem("a", 2), elem("a", 1))).toBe(true);
    expect(isNewer(elem("a", 1, 9), elem("a", 1, 2))).toBe(true);
  });
});
