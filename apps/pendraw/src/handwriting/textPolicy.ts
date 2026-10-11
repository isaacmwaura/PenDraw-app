// Conservative safeguards, not a recognition confidence score. Windows may
// identify a drawing mark as an InkWord. Keep ambiguous marks as ink by default;
// the preview lets the user deliberately include a real isolated character.
export type RecognizedBlock = {
  text: string; x: number; y: number; width: number; height: number;
  stroke_indices: number[];
  keepAsInk?: boolean;
};

export function possibleDrawing(block: RecognizedBlock): boolean {
  const compact = block.text.replace(/\s/g, "");
  // Standalone punctuation, primes, parallel bars and shape symbols are too
  // ambiguous. Punctuation inside ordinary words remains part of those words.
  if (!/[\p{L}\p{N}]/u.test(compact)) return true;
  // A single straight mark or a closed loop can read as I/l/1/O/0. Prefer
  // leaving those isolated characters untouched; do not classify whole words.
  return /^[Il1O0|]$/.test(compact);
}

export function selectionFontSize(blocks: RecognizedBlock[]): number {
  const heights = blocks.filter(b => !b.keepAsInk)
    .map(b => b.height / Math.max(1, b.text.split("\n").length))
    .filter(h => Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  if (!heights.length) return 20;
  const middle = Math.floor(heights.length / 2);
  const height = heights.length % 2 ? heights[middle]
    : (heights[middle - 1] + heights[middle]) / 2;
  // One size for the entire selected area. The median
  // prevents one unusually tall line from determining all the letter sizes.
  return Math.max(8, Math.min(200, height / 1.25));
}
