import {CaptureUpdateAction,newElementWith,restoreElements} from "@excalidraw/excalidraw";
import type {ExcalidrawImperativeAPI} from "@excalidraw/excalidraw/types";
import {widthForType} from "./StrokeWidthSlider";
export function applyDrawingStyle(api:ExcalidrawImperativeAPI,key:string,value:any):void {
  const appKeys:Record<string,string>={textColor:'currentItemStrokeColor',strokeColor:'currentItemStrokeColor',backgroundColor:'currentItemBackgroundColor',fillStyle:'currentItemFillStyle',strokeStyle:'currentItemStrokeStyle',roughness:'currentItemRoughness',opacity:'currentItemOpacity',fontSize:'currentItemFontSize',fontFamily:'currentItemFontFamily',textAlign:'currentItemTextAlign',roundness:'currentItemRoundness',startArrowhead:'currentItemStartArrowhead',endArrowhead:'currentItemEndArrowhead',strokeWidth:'currentItemStrokeWidth'};
  if(!appKeys[key])return;
  const ids=api.getAppState().selectedElementIds;
  const all=api.getSceneElementsIncludingDeleted();
  const selectedText=all.filter(e=>!e.isDeleted&&e.type==='text'&&ids[e.id]);
  const containers=new Set(selectedText.flatMap(e=>'containerId' in e&&e.containerId?[e.containerId]:[]));
  const elements=all.map(e=>{
    const fontStyle=['fontSize','fontFamily','textAlign'].includes(key); const bound=(fontStyle||key==='textColor')&&'containerId' in e&&e.containerId&&ids[e.containerId];
    const background=key==='backgroundColor'&&containers.has(e.id);
    if((!ids[e.id]&&!bound&&!background)||e.isDeleted)return e;
    if(['fontSize','fontFamily','textAlign','textColor'].includes(key)&&e.type!=='text')return e;
    if(['startArrowhead','endArrowhead'].includes(key)&&e.type!=='arrow')return e;
    if(e.type==='image'&&key!=='opacity')return e;
    return newElementWith(e,{[key==='textColor'?'strokeColor':key]:key==='strokeWidth'?widthForType(value,e.type):value} as any);
  });
  const resized=['fontSize','fontFamily','textAlign'].includes(key)?restoreElements(elements,null,{refreshDimensions:true,repairBindings:true}):elements;
  api.updateScene({elements:resized,appState:{[appKeys[key]]:value} as any,captureUpdate:CaptureUpdateAction.IMMEDIATELY});
}
export function ribbonSnapshot(elements:readonly any[],state:any):any {
  const selected=elements.find(e=>state.selectedElementIds[e.id]&&!e.isDeleted);
  const text=elements.find(e=>!e.isDeleted&&e.type==='text'&&(state.selectedElementIds[e.id]||state.selectedElementIds[e.containerId]));
  return {hasSelection:!!selected,activeTool:state.activeTool.type,viewport:{scrollX:state.scrollX,scrollY:state.scrollY,zoom:state.zoom,offsetLeft:state.offsetLeft,offsetTop:state.offsetTop},
    strokeWidth:selected?(selected.type==='freedraw'?selected.strokeWidth:selected.strokeWidth/4.25):state.currentItemStrokeWidth,
    strokeColor:selected?.strokeColor??state.currentItemStrokeColor,backgroundColor:selected?.backgroundColor??state.currentItemBackgroundColor,
    fillStyle:selected?.fillStyle??state.currentItemFillStyle,strokeStyle:selected?.strokeStyle??state.currentItemStrokeStyle,roughness:selected?.roughness??state.currentItemRoughness,
    textColor:elements.find(e=>!e.isDeleted&&e.type==='text'&&(state.selectedElementIds[e.id]||state.selectedElementIds[e.containerId]))?.strokeColor??state.currentItemStrokeColor,
    opacity:selected?.opacity??state.currentItemOpacity,fontSize:text?.fontSize??state.currentItemFontSize,fontFamily:text?.fontFamily??state.currentItemFontFamily,
    textAlign:text?.textAlign??state.currentItemTextAlign,roundness:selected?.roundness??state.currentItemRoundness,startArrowhead:selected?.startArrowhead??state.currentItemStartArrowhead,endArrowhead:selected?.endArrowhead??state.currentItemEndArrowhead};
}
