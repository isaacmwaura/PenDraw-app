import {useEffect,useState} from "react";
import {CaptureUpdateAction,newElementWith} from "@excalidraw/excalidraw";
import type {ExcalidrawImperativeAPI} from "@excalidraw/excalidraw/types";
import {straightCandidate} from "./straighten";

export default function StraightenLayer({apiRef,enabled}:{apiRef:React.MutableRefObject<ExcalidrawImperativeAPI|null>;enabled:boolean}) {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(!enabled)return;
    let disposed=false;
    let pointer:number|null=null,timer:number|undefined,elementId:string|null=null;
    let candidate:{id:string;version:number;points:[number,number][]}|null=null;
    const reset=()=>{window.clearTimeout(timer);candidate=null;setReady(false)};
    const arm=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{
      const api=apiRef.current;if(!api)return;
      const e=api.getAppState().newElement;
      if(e?.type!=='freedraw'||(elementId&&e.id!==elementId))return;
      const points=straightCandidate(e.points as [number,number][],api.getAppState().zoom.value);
      if(points){candidate={id:e.id,version:e.version,points};setReady(true);}
    },650)};
    const down=(e:PointerEvent)=>{
      if(e.pointerType==='touch'||e.button!==0||(e.buttons&2)||!(e.target instanceof Element)||!e.target.closest('.excalidraw canvas'))return;
      if(apiRef.current?.getAppState().activeTool.type!=='freedraw')return;
      pointer=e.pointerId;elementId=null;reset();arm();
    };
    const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;const ink=apiRef.current?.getAppState().newElement;if(ink?.type==='freedraw')elementId=ink.id;reset();arm()};
    const up=(e:PointerEvent)=>{
      if(e.pointerId!==pointer)return;pointer=null;
      const pending=candidate;reset();if(e.type==='pointercancel'||!pending)return;
      // Never rewrite a live element. Let the engine finish the gesture first.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const api=apiRef.current;if(disposed||!api||api.getAppState().newElement)return;
        const ink=api.getSceneElements().find(e=>e.id===pending.id);
        if(!ink||ink.type!=='freedraw')return;
        const p=straightCandidate(ink.points as [number,number][],api.getAppState().zoom.value);if(!p)return;
        api.updateScene({elements:api.getSceneElementsIncludingDeleted().map(e=>e.id===ink.id?newElementWith(ink,{points:p,pressures:ink.pressures.length?[ink.pressures[0],ink.pressures[ink.pressures.length-1]]:[],width:Math.abs(p[1][0]-p[0][0]),height:Math.abs(p[1][1]-p[0][1])}):e),captureUpdate:CaptureUpdateAction.IMMEDIATELY});
      }));
    };
    window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);
    window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);window.addEventListener('blur',reset);
    return()=>{disposed=true;reset();window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);window.removeEventListener('blur',reset)};
  },[enabled,apiRef]);
  return ready?<div className="pd-drawing-hint">Release to straighten · Undo brings back the ink</div>:null;
}
