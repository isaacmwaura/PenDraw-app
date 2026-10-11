import { useRef } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {clientToScene} from '../board/coordinates';
import {fillRegion} from './fillRegion';
export default function BucketFill({apiRef,enabled,color,onDone,onMessage}:{apiRef:React.MutableRefObject<ExcalidrawImperativeAPI|null>;enabled:boolean;color:string;onDone:()=>void;onMessage:(s:string)=>void}) {
 const contacts=useRef(new Set<number>()),busy=useRef(false);
 const gesture=useRef<{id:number;x:number;y:number;view:any;cancelled:boolean}|null>(null);
 if(!enabled)return null;
 return <><div className="pd-bucket-target" aria-label="Fill closed area" onPointerDown={e=>{
   if(e.button!==0||e.buttons&(2|32))return;
   if(e.pointerType!=='touch'){
     e.preventDefault();document.querySelector<HTMLElement>('.excalidraw-container')?.focus({preventScroll:true});
   }
   e.currentTarget.setPointerCapture(e.pointerId);contacts.current.add(e.pointerId);
   if(contacts.current.size>1){if(gesture.current)gesture.current.cancelled=true;return;}
   const api=apiRef.current;if(api&&!busy.current)gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,view:api.getAppState(),cancelled:false};
 }} onPointerMove={e=>{const g=gesture.current;if(g?.id===e.pointerId&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)g.cancelled=true}}
 onPointerCancel={e=>{contacts.current.delete(e.pointerId);if(gesture.current?.id===e.pointerId)gesture.current=null}}
 onPointerUp={e=>{
   window.setTimeout(()=>document.querySelector<HTMLElement>('.excalidraw-container')?.focus({preventScroll:true}),0);
   contacts.current.delete(e.pointerId);const g=gesture.current;if(g?.id!==e.pointerId)return;gesture.current=null;
   if(g.cancelled||busy.current)return;const api=apiRef.current;if(!api)return;busy.current=true;
   const p=clientToScene(g.x,g.y,g.view);
   void fillRegion(api,p.x,p.y,color).then(ok=>{onMessage(ok?'Region filled. Undo restores the original outline.':'No closed region here. Tap inside the outline.');if(ok)onDone()})
     .catch(()=>onMessage('Could not fill this outline. Try a simpler closed region.')).finally(()=>{busy.current=false});
 }}/><div className="pd-drawing-hint">Tap inside a closed outline to fill · Escape cancels</div></>;
}
