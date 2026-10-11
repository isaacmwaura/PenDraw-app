import {useEffect,useRef,type RefObject} from 'react';
export function useDialogFocus(active:boolean,ref:RefObject<HTMLElement|null>,onClose:()=>void):void {
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!active)return;const previous=document.activeElement as HTMLElement|null;
  const controls=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary')??[]).filter(e=>e.getClientRects().length>0);
  controls()[0]?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='F11')return;
   e.stopImmediatePropagation();
   if(e.key==='Escape'){e.preventDefault();close.current();}
   if(e.key==='Tab'){const all=controls(),first=all[0],last=all[all.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!ref.current?.contains(document.activeElement))){e.preventDefault();first.focus();}}
  };
  window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('keydown',key,true);previous?.focus();};
 },[active,ref]);
}
