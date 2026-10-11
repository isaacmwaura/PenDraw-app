export type InkFixture={format:'pendraw-ink-fixture';version:1;source:'captured'|'synthetic';expectedText:string;kind:'text'|'drawing';strokes:[number,number][][]};
export function parseFixture(value:unknown):InkFixture {
  const f=value as InkFixture;
  if(!f||f.format!=='pendraw-ink-fixture'||f.version!==1||!['captured','synthetic'].includes(f.source)||!['text','drawing'].includes(f.kind)||typeof f.expectedText!=='string'||f.expectedText.length>10000||!Array.isArray(f.strokes)||!f.strokes.length||f.strokes.length>500||f.strokes.reduce((n,s)=>n+(Array.isArray(s)?s.length:100001),0)>100000||!f.strokes.every(s=>s.length>1&&s.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<10000000))))throw new Error('This is not a valid PenDraw ink sample.');
  return f;
}
export function editDistance(a:string,b:string):number {
  const left=Array.from(a),right=Array.from(b);let row=right.map((_,i)=>i+1);row.unshift(0);
  for(let i=0;i<left.length;i++){const next=[i+1];for(let j=0;j<right.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(left[i]===right[j]?0:1)));row=next;}
  return row[right.length];
}
export function measureText(expected:string,actual:string){const clean=(s:string)=>s.replace(/\s+/g,' ').trim();const a=clean(expected),b=clean(actual);return {expected:a,actual:b,characterErrors:editDistance(a,b),characters:Array.from(a).length,exact:a===b};}
