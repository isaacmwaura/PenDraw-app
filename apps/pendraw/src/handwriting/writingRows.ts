type Stroke = [number, number][];
// Only split at an actual blank horizontal band. No stroke is cut or reassigned.
// Closely spaced or overlapping writing remains one native layout-analysis request.
export function writingRows(strokes: Stroke[]): number[][] {
  const bounds = strokes.map((s, index) => ({ index, top:Math.min(...s.map(p=>p[1])), bottom:Math.max(...s.map(p=>p[1])) }))
    .filter(b=>Number.isFinite(b.top)&&Number.isFinite(b.bottom)).sort((a,b)=>a.top-b.top);
  const heights=bounds.map(b=>b.bottom-b.top).filter(h=>h>4).sort((a,b)=>a-b);
  const gap=Math.max(12,(heights[Math.floor(heights.length/2)]??20)*.6);
  const rows:{bottom:number;ids:number[]}[]=[];
  for(const b of bounds){const last=rows.at(-1);if(!last||b.top-last.bottom>gap)rows.push({bottom:b.bottom,ids:[b.index]});
    else {last.bottom=Math.max(last.bottom,b.bottom);last.ids.push(b.index)}}
  return rows.map(r=>r.ids);
}
