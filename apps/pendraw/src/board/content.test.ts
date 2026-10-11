import { expect, it } from "vitest";
import { contentSignature } from "./content";
it("detects equal-version replacements, conflict winners, order and image arrival", () => {
  const a = { id: "a", version: 1, versionNonce: 10 };
  const b = { ...a, id: "b" };
  expect(contentSignature([a])).not.toBe(contentSignature([b]));
  expect(contentSignature([a])).not.toBe(contentSignature([{ ...a, versionNonce: 20 }]));
  expect(contentSignature([a, b])).not.toBe(contentSignature([b, a]));
  const image = { ...a, fileId: "image" };
  expect(contentSignature([image], {})).not.toBe(contentSignature([image], { image: {} }));
  expect(contentSignature([a])).toBe(contentSignature([a], { unusedImage: {} }));
  expect(contentSignature([a])).toBe(contentSignature([a, { ...b, isDeleted: true }]));
});
