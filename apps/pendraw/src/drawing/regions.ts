export type Point = [number, number];
export type Region = {points: Point[]; ids: string[]; area: number};
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function area(points:Point[]):number {
  return Math.abs(points.reduce((n,p,i)=>{const q=points[(i+1)%points.length];return n+p[0]*q[1]-q[0]*p[1]},0))/2;
}
export function inside(p:Point, polygon:Point[]):boolean {
  let yes=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
  }
  return yes;
}
function crossed(p:Point[]):boolean {
  const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const n=p.length-1;
  for(let i=0;i<n;i++) for(let j=i+2;j<n;j++) {
    if(i===0 && j===n-1) continue;
    if(cross(p[i],p[i+1],p[j])*cross(p[i],p[i+1],p[j+1])<0 && cross(p[j],p[j+1],p[i])*cross(p[j],p[j+1],p[i+1])<0) return true;
  }
  return false;
}
function path(e:any):Point[]|null {
  let points:Point[];
  if(e.type==='rectangle'||e.type==='diamond') points=e.type==='diamond'
    ? [[e.width/2,0],[e.width,e.height/2],[e.width/2,e.height],[0,e.height/2],[e.width/2,0]]
    : [[0,0],[e.width,0],[e.width,e.height],[0,e.height],[0,0]];
  else if(e.type==='ellipse') points=Array.from({length:65},(_,i)=>[e.width/2+Math.cos(i*Math.PI/32)*e.width/2,e.height/2+Math.sin(i*Math.PI/32)*e.height/2] as Point);
  else if((e.type==='freedraw'||e.type==='line')&&e.points?.length>=2) points=e.points;
  else return null;
  const cx=e.x+e.width/2,cy=e.y+e.height/2,c=Math.cos(e.angle??0),s=Math.sin(e.angle??0);
  return points.map(p=>{const x=e.x+p[0]-cx,y=e.y+p[1]-cy;return [cx+x*c-y*s,cy+x*s+y*c]});
}
export function closedRegions(elements:readonly any[], tolerance=6):Region[] {
  const paths=elements.filter(e=>!e.isDeleted&&!e.customData?.pendrawFill).map(e=>({id:e.id,points:path(e)})).filter(e=>e.points) as {id:string;points:Point[]}[];
  // Bound quadratic intersection work. Complex ink should be selected more
  // narrowly rather than blocking the UI with an unbounded tracing operation.
  if(paths.length>200 || paths.reduce((n,p)=>n+p.points.length,0)>10000) return [];
  const out:Region[]=[],used=new Set<number>();
  for(let i=0;i<paths.length;i++) {
    if(used.has(i))continue;
    const ids=[i],points=paths[i].points.map(p=>[...p] as Point);
    let good=true;
    while(distance(points[0],points[points.length-1])>tolerance) {
      const end=points[points.length-1];
      const matches=paths.flatMap((p,k)=>used.has(k)||ids.includes(k)?[]:
        distance(end,p.points[0])<=tolerance?[{k,reverse:false}]:distance(end,p.points[p.points.length-1])<=tolerance?[{k,reverse:true}]:[]);
      if(matches.length!==1){good=false;break;}
      const {k,reverse}=matches[0];ids.push(k);
      const next=reverse?[...paths[k].points].reverse():paths[k].points;
      points.push(...next.slice(1));
      if(ids.length>100){good=false;break;}
    }
    if(!good||points.length<4)continue;
    if(ids.length>1 && ids.some(k=>[paths[k].points[0],paths[k].points[paths[k].points.length-1]].some(end=>
      paths.reduce((n,p)=>n+(distance(end,p.points[0])<=tolerance?1:0)+(distance(end,p.points[p.points.length-1])<=tolerance?1:0),0)!==2)))continue;
    points[points.length-1]=[...points[0]];
    const a=area(points);
    // Crossings are ambiguous: do not guess a region on a scribble.
    if(a<25||points.length>3000||crossed(points))continue;
    ids.forEach(k=>used.add(k));out.push({points,ids:ids.map(k=>paths[k].id),area:a});
  }
  return out;
}
export function chooseRegion(regions:Region[],seed:Point):{outer:Region;holes:Region[]}|null {
  const candidates=regions.filter(r=>inside(seed,r.points)).sort((a,b)=>a.area-b.area);
  if(!candidates.length)return null;
  const outer=candidates[0];
  // Include every nested contour. Even-odd rendering preserves holes and
  // islands instead of painting over drawings inside an enclosing outline.
  const holes=regions.filter(r=>r!==outer&&r.area<outer.area&&r.points.slice(0,-1).every(p=>inside(p,outer.points)));
  return {outer,holes};
}
