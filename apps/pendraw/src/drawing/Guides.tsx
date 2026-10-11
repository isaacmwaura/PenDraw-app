import {useLayoutEffect,useRef,useState} from "react";
import type {CanvasViewport} from "../board/coordinates";
export type GuideMode='none'|'ruled'|'grid';
export default function Guides({mode,spacing,viewport}:{mode:GuideMode;spacing:number;viewport:CanvasViewport|null}) {
  const ref=useRef<HTMLDivElement>(null),[origin,setOrigin]=useState({x:0,y:0});
  useLayoutEffect(()=>{const r=ref.current?.getBoundingClientRect();if(r)setOrigin(p=>p.x===r.left&&p.y===r.top?p:{x:r.left,y:r.top})},[viewport]);
  if(!viewport)return null;
  const size=spacing*viewport.zoom.value;
  const x=viewport.offsetLeft-origin.x+viewport.scrollX*viewport.zoom.value,y=viewport.offsetTop-origin.y+viewport.scrollY*viewport.zoom.value;
  return <div ref={ref} className={'pd-guides '+mode} style={{backgroundSize:`${size}px ${size}px`,backgroundPosition:`${x}px ${y}px`}} aria-hidden="true"/>;
}
