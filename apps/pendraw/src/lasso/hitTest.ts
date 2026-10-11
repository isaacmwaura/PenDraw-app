// Pure geometry for the free-form lasso. Kept separate from the React overlay
// so it can be unit-tested and reused by later tools (e.g. "lasso a formula to
// plot"). Everything here works in Excalidraw *scene* coordinates.

export type Pt = { x: number; y: number };

// Standard ray-casting point-in-polygon test. `polygon` is a closed loop given
// as an ordered list of points; the closing edge (last → first) is implied.
export function pointInPolygon(p: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Returns the ids of elements whose centre point lies inside the lasso loop.
// Centre-inside is predictable ("loop around what you want") and cheap; it is
// deliberately simple for v1 and can be upgraded to edge-intersection later.
export function elementsInsideLasso(
  elements: readonly any[],
  polygon: Pt[],
): string[] {
  if (polygon.length < 3) return [];
  const ids: string[] = [];
  for (const el of elements) {
    if (!el || el.isDeleted) continue;
    const cx = el.x + (el.width ?? 0) / 2;
    const cy = el.y + (el.height ?? 0) / 2;
    if (pointInPolygon({ x: cx, y: cy }, polygon)) ids.push(el.id);
  }
  return ids;
}
