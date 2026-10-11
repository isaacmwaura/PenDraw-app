// Recognition and saved samples must use the visible, rotated stroke position.
export function absoluteInkPoints(e:{x:number;y:number;width?:number;height?:number;angle?:number;points:readonly (readonly number[])[]}):[number,number][] {
  const cx=e.x+(e.width??0)/2,cy=e.y+(e.height??0)/2,c=Math.cos(e.angle??0),s=Math.sin(e.angle??0);
  return e.points.map(([px,py])=>{const x=e.x+px-cx,y=e.y+py-cy;return [cx+x*c-y*s,cy+x*s+y*c]});
}
