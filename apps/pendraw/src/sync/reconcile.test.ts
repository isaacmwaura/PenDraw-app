import { describe, it, expect } from "vitest";
import { reconcile, versionSignature, isNewer } from "./reconcile";

const el = (id: string, version: number, versionNonce = 0, extra: any = {}) => ({
  id,
  version,
  versionNonce,
  ...extra,
});

describe("reconcile", () => {
  it("keeps the higher-version element", () => {
    const local = [el("a", 2)];
    const remote = [el("a", 5)];
    const { elements, changed } = reconcile(local, remote);
    expect(changed).toBe(true);
    expect(elements[0].version).toBe(5);
  });

  it("does not downgrade to an older remote version", () => {
    const local = [el("a", 5)];
    const remote = [el("a", 2)];
    const { elements, changed } = reconcile(local, remote);
    expect(changed).toBe(false);
    expect(elements[0].version).toBe(5);
  });

  it("breaks version ties with versionNonce", () => {
    const local = [el("a", 3, 10)];
    const remote = [el("a", 3, 20)];
    const { elements } = reconcile(local, remote);
    expect(elements[0].versionNonce).toBe(20);
  });

  it("adds new remote elements and keeps local-only ones", () => {
    const local = [el("a", 1)];
    const remote = [el("b", 1)];
    const { elements, changed } = reconcile(local, remote);
    expect(changed).toBe(true);
    expect(elements.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("propagates deletions (they arrive as newer versions)", () => {
    const local = [el("a", 1, 0, { isDeleted: false })];
    const remote = [el("a", 2, 0, { isDeleted: true })];
    const { elements } = reconcile(local, remote);
    expect(elements[0].isDeleted).toBe(true);
  });

  it("versionSignature is order-independent and version-sensitive", () => {
    expect(versionSignature([el("a", 1), el("b", 2)])).toBe(
      versionSignature([el("b", 2), el("a", 1)]),
    );
    expect(versionSignature([el("a", 1)])).not.toBe(versionSignature([el("a", 2)]));
  });

  it("isNewer compares version then nonce", () => {
    expect(isNewer(el("a", 2), el("a", 1))).toBe(true);
    expect(isNewer(el("a", 1, 5), el("a", 1, 3))).toBe(true);
    expect(isNewer(el("a", 1, 3), el("a", 1, 5))).toBe(false);
  });
  it("signature notices a conflict winner, tombstone, and layer index", () => {
    const original = el("a", 2, 5);
    for (const changed of [{ ...original, versionNonce: 9 }, { ...original, isDeleted: true }, { ...original, index: "a1" }]) {
      expect(versionSignature([original])).not.toBe(versionSignature([changed]));
    }
  });
});

it("propagates fractional layer order independently of arrival order",()=>{
  const result=reconcile([{id:"a",version:1,index:"a0"},{id:"b",version:1,index:"a1"}], [{id:"a",version:2,index:"a2"}]);
  expect(result.elements.map(e=>e.id)).toEqual(["b","a"]);
});
