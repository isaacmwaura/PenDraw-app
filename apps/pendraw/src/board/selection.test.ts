import { expect, it, vi } from "vitest";
vi.mock("@excalidraw/excalidraw", () => ({CaptureUpdateAction: {IMMEDIATELY: "immediate"},newElementWith:(e:any,u:any)=>({...e,...u,version:e.version+1})}));
import { cloneSelection } from "./selection";
it("duplicates groups, bound text and internal arrow links with new reciprocal ids", () => {
  const all = [
    {id:"box",x:0,y:0,groupIds:["g"],boundElements:[{id:"text",type:"text"},{id:"arrow",type:"arrow"}]},
    {id:"text",x:1,y:1,containerId:"box",groupIds:["g"]},
    {id:"arrow",x:2,y:2,groupIds:["g"],startBinding:{elementId:"box"},endBinding:{elementId:"external"}},
  ];
  let n=0;const copies=cloneSelection(all,{box:true,arrow:true},()=>`copy${++n}`);
  expect(copies).toHaveLength(3);
  const [box,text,arrow]=copies;
  expect(text.containerId).toBe(box.id);
  expect(box.boundElements.map((b:any)=>b.id)).toEqual([text.id,arrow.id]);
  expect(arrow.startBinding.elementId).toBe(box.id);
  expect(arrow.endBinding).toBeNull();
  expect(new Set(copies.flatMap(e=>e.groupIds)).size).toBe(1);
  expect(box.groupIds).not.toContain("g");
  expect(all[0].x).toBe(0);
  expect(box.x).toBe(16);
});

it("remaps duplicated fill ownership to the copied boundaries",()=>{
 let n=0;const copies=cloneSelection([{id:'fill',x:0,y:0,groupIds:['g'],customData:{pendrawFill:true,boundaryIds:['ink']}},{id:'ink',x:0,y:0,groupIds:['g']}],{fill:true,ink:true},()=>`new${++n}`);
 expect(copies[0].customData.boundaryIds).toEqual([copies[1].id]);
});
