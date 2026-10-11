export type Point=[number,number];
export function straightCandidate(points:readonly Point[],zoom=1):Point[]|null {
  if(points.length<5)return null;
  const first=points[0],last=points[points.length-1];
  const dx=last[0]-first[0],dy=last[1]-first[1],length=Math.hypot(dx,dy);
  if(length*zoom<80)return null;
  let path=0,max=0;
  for(let i=0;i<points.length;i++) {
    const p=points[i];max=Math.max(max,Math.abs(dx*(p[1]-first[1])-dy*(p[0]-first[0]))/length);
    if(i)path+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);
  }
  if(path>length*1.08||max>Math.max(2/zoom,length*.035))return null;
  return [[...first],[...last]];
}
