// Identity matters: two different drawings can have the same version sum.
// Keep array order because it controls which overlapping shape is on top.
export function contentSignature(elements: readonly any[], files: Record<string, unknown> = {}): string {
  return JSON.stringify([
    elements.filter((e) => !e.isDeleted).map((e) => [e.id, e.version ?? 0, e.versionNonce ?? 0, e.index ?? null]),
    elements.filter((e) => !e.isDeleted && e.fileId && files[e.fileId]).map((e) => e.fileId).sort(),
  ]);
}
