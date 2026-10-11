export type Pen = { name: string; color: string; width: number; opacity: number };
export const DEFAULT_PENS: Pen[] = [
  { name: 'Pen 1', color: '#253047', width: .5, opacity: 100 },
  { name: 'Pen 2', color: '#2862be', width: .5, opacity: 100 },
  { name: 'Pen 3', color: '#bf3535', width: .7, opacity: 100 },
  { name: 'Highlighter', color: '#e3b321', width: 4, opacity: 35 },
];
export function loadPens(): Pen[] {
  try {
    const pens = JSON.parse(localStorage.getItem('pendraw:pens') ?? 'null');
    if (Array.isArray(pens) && pens.length === 4 && pens.every(p =>
      /^#[0-9a-f]{6}$/i.test(p.color) && Number.isFinite(p.width) && p.width >= .3 && p.width <= 12 &&
      Number.isFinite(p.opacity) && p.opacity >= 1 && p.opacity <= 100)) {
      return pens.map((p, i) => ({ ...p, name: DEFAULT_PENS[i].name }));
    }
  } catch { /* unavailable storage uses defaults */ }
  return DEFAULT_PENS.map(p => ({ ...p }));
}
