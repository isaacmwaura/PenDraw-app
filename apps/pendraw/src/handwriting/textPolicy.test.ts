import { expect, it } from "vitest";
import { possibleDrawing, selectionFontSize, type RecognizedBlock } from "./textPolicy";
const block = (text: string, height = 25): RecognizedBlock => ({
  text, height, x: 0, y: 0, width: 80, stroke_indices: [0],
});
it("keeps isolated symbols and ambiguous line/loop characters as ink", () => {
  for (const text of ["′", "‖", "||", "→", "□", "I", "l", "1", "O", "0"]) {
    expect(possibleDrawing(block(text)), text).toBe(true);
  }
});
it("retains punctuation in prose, numbers, equations and non-Latin writing", () => {
  for (const text of ["I'm here.", "Hello!", "12", "x = 1", "日本語", "مرحبا", "Oxygen", "Line 1"]) {
    expect(possibleDrawing(block(text)), text).toBe(false);
  }
});
it("uses a robust common size, with lines normalized and drawings ignored", () => {
  expect(selectionFontSize([block("One", 20), block("Two", 25), block("Heading", 120),
    {...block("′", 300), keepAsInk: true}])).toBe(20);
  expect(selectionFontSize([block("One\nTwo", 50), block("Three", 25)])).toBe(20);
});
it("bounds unusable/extreme sizing without creating zero or infinite letters", () => {
  expect(selectionFontSize([])).toBe(20);
  expect(selectionFontSize([block("One", 0), block("Two", Infinity)])).toBe(20);
  expect(selectionFontSize([block("One", 1)])).toBe(8);
  expect(selectionFontSize([block("One", 1000)])).toBe(200);
});
