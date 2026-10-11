// Bounded four-neighbour flood. A leak to the image edge is an open outline,
// so return no fill rather than painting the whole board.
export function flood(mask:Uint8ClampedArray,width:number,height:number,x:number,y:number):Uint8Array|null {
  if(width*height>4000000||x<0||y<0||x>=width||y>=height)return null;
  const first=y*width+x;if(mask[first*4+3]>16)return null;
  const seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);let head=0,tail=1;
  queue[0]=first;seen[first]=1;
  while(head<tail){
    const i=queue[head++],px=i%width,py=Math.floor(i/width);
    if(px===0||py===0||px===width-1||py===height-1)return null;
    for(const next of [i-1,i+1,i-width,i+width])if(!seen[next]&&mask[next*4+3]<=16){seen[next]=1;queue[tail++]=next;}
  }
  return seen;
}
