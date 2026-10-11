import {describe,it,expect} from 'vitest';
import {recoverySignature} from './recovery';
describe('content-only recovery',()=>{
 const ink={id:'ink',version:1,versionNonce:11,type:'freedraw',isDeleted:false};
 const state={viewBackgroundColor:'#fff',scrollX:0,scrollY:0,zoom:{value:1}};
 it('ignores pan, zoom, selection, pen presets, theme and viewport resize',()=>{
 const baseline=recoverySignature([ink],state);
 for(const update of [{scrollX:91,scrollY:-32},{zoom:{value:2}},{selectedElementIds:{ink:true}},{activeTool:{type:'hand'},currentItemStrokeColor:'#f00'},{theme:'dark',width:400,height:700}])expect(recoverySignature([ink],{...state,...update})).toBe(baseline);
 });
 it('tracks edits, deletion, undo, layering and paper changes',()=>{
 const baseline=recoverySignature([ink],state);
 expect(recoverySignature([{...ink,version:2,versionNonce:12}],state)).not.toBe(baseline);
 expect(recoverySignature([{...ink,isDeleted:true}],state)).not.toBe(baseline);
 expect(recoverySignature([ink],{...state,viewBackgroundColor:'#eee'})).not.toBe(baseline);
 const other={...ink,id:'other'};expect(recoverySignature([ink,other],state)).not.toBe(recoverySignature([other,ink],state));
 expect(recoverySignature([{...ink,version:3,versionNonce:19}],state)).not.toBe(baseline);
 });
 it('tracks image arrival and replaced image data but ignores unused assets',()=>{
 const image={...ink,id:'image',fileId:'asset',type:'image'};
 const baseline=recoverySignature([image],state);
 const files={asset:{dataURL:'data:image/png;base64,AAA',mimeType:'image/png'}};
 expect(recoverySignature([image],state,files)).not.toBe(baseline);
 expect(recoverySignature([image],state,{asset:{...files.asset,dataURL:'data:image/png;base64,BBB'}})).not.toBe(recoverySignature([image],state,files));
 expect(recoverySignature([image],state,{...files,unused:{dataURL:'unused'}})).toBe(recoverySignature([image],state,files));
 });
});
