import { convertToExcalidrawElements, CaptureUpdateAction, newElementWith, getFreeDrawSvgPath } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {flood} from "./flood";
import {chooseRegion,closedRegions} from "./regions";
export async function fillRegion(api:ExcalidrawImperativeAPI,x:number,y:number,color:string):Promise<boolean> {
  const all=api.getSceneElementsIncludingDeleted();
  const region=chooseRegion(closedRegions(all,6/api.getAppState().zoom.value),[x,y]);
  if(!region)return false;
  const contours=[region.outer,...region.holes];
  const boundaryIds=new Set(contours.flatMap(c=>c.ids));
  const boundaries=all.filter(e=>boundaryIds.has(e.id));
  const pts=region.outer.points;
  const margin=Math.max(8,...boundaries.map(e=>e.strokeWidth*4.25+8));
  const left=Math.min(...pts.map(p=>p[0]))-margin,top=Math.min(...pts.map(p=>p[1]))-margin;
  const width=Math.max(...pts.map(p=>p[0]))-left+margin,height=Math.max(...pts.map(p=>p[1]))-top+margin;
  if(width<=0||height<=0)return false;
  const scale=Math.min(2,2048/width,2048/height,Math.sqrt(4000000/(width*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*scale));canvas.height=Math.max(1,Math.ceil(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)return false;
  ctx.scale(scale,scale);ctx.translate(-left,-top);ctx.fillStyle='#000';ctx.strokeStyle='#000';
  for(const e of boundaries){
    ctx.save();ctx.translate(e.x+e.width/2,e.y+e.height/2);ctx.rotate(e.angle);ctx.translate(-e.width/2,-e.height/2);
    if(e.type==='freedraw')ctx.fill(new Path2D(getFreeDrawSvgPath(e)));
    else {
      ctx.lineWidth=Math.max(.5,e.strokeWidth);ctx.beginPath();
      if(e.type==='ellipse')ctx.ellipse(e.width/2,e.height/2,e.width/2,e.height/2,0,0,Math.PI*2);
      else if(e.type==='rectangle')ctx.rect(0,0,e.width,e.height);
      else if(e.type==='diamond'){ctx.moveTo(e.width/2,0);ctx.lineTo(e.width,e.height/2);ctx.lineTo(e.width/2,e.height);ctx.lineTo(0,e.height/2);ctx.closePath();}
      else if(e.type==='line'){ctx.moveTo(e.points[0][0],e.points[0][1]);for(const p of e.points.slice(1))ctx.lineTo(p[0],p[1]);}
      ctx.stroke();
    }
    ctx.restore();
  }
  const mask=ctx.getImageData(0,0,canvas.width,canvas.height);
  const selected=flood(mask.data,canvas.width,canvas.height,Math.floor((x-left)*scale),Math.floor((y-top)*scale));
  if(!selected)return false;
  const pixels=ctx.createImageData(canvas.width,canvas.height);
  const rgb=[1,3,5].map(n=>parseInt(color.slice(n,n+2),16));
  if(rgb.some(n=>!Number.isFinite(n)))return false;
  for(let i=0;i<selected.length;i++)if(selected[i])pixels.data.set([...rgb,255],i*4);
  ctx.setTransform(1,0,0,1,0,0);ctx.putImageData(pixels,0,0);
  const fileId=crypto.randomUUID();
  const ids=new Set(contours.flatMap(c=>c.ids));
  const previous=new Set(all.filter(e=>!e.isDeleted&&e.customData?.pendrawFill&&Array.isArray(e.customData.boundaryIds)&&region.outer.ids.every(id=>(e.customData!.boundaryIds as string[]).includes(id))).map(e=>e.id));
  // Expand any existing group so inserting a fill cannot split that group.
  const groups=new Set(all.filter(e=>ids.has(e.id)).flatMap(e=>e.groupIds));
  for(const e of all)if(!e.isDeleted&&!previous.has(e.id)&&e.groupIds.some(g=>groups.has(g)))ids.add(e.id);
  const groupId=crypto.randomUUID();
  const image=convertToExcalidrawElements([{type:'image',x:left,y:top,width,height,fileId,groupIds:[groupId],customData:{pendrawFill:true,boundaryIds:[...ids]}} as any])[0];
  api.addFiles([{id:fileId,dataURL:canvas.toDataURL('image/png'),mimeType:'image/png',created:Date.now(),lastRetrieved:Date.now()} as any]);
  const next=all.map(e=>previous.has(e.id)?newElementWith(e,{isDeleted:true}):ids.has(e.id)?newElementWith(e,{groupIds:[...e.groupIds,groupId]}):e);
  const at=Math.max(0,next.findIndex(e=>ids.has(e.id)));
  next.splice(at,0,image);
  api.updateScene({elements:next,appState:{selectedElementIds:Object.fromEntries([...ids,image.id].map(id=>[id,true]))},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  return true;
}
