import {expect,it} from 'vitest';
import {closedRegions,chooseRegion} from './regions';
const stroke=(id:string,points:number[][])=>({id,type:'freedraw',x:0,y:0,width:100,height:100,angle:0,points});
it('finds a closed outline and refuses an open stroke or self-crossing scribble',()=>{
  expect(closedRegions([stroke('box',[[0,0],[100,0],[100,100],[0,100],[0,0]])])).toHaveLength(1);
  expect(closedRegions([stroke('open',[[0,0],[100,0],[100,100]])])).toHaveLength(0);
  expect(closedRegions([stroke('cross',[[0,0],[100,100],[0,100],[100,0],[0,0]])])).toHaveLength(0);
});
it('joins multiple clear boundary strokes while rejecting branches',()=>{
  const all=[stroke('a',[[0,0],[100,0]]),stroke('b',[[100,0],[100,100]]),stroke('c',[[100,100],[0,100]]),stroke('d',[[0,100],[0,0]])];
  expect(closedRegions(all)[0].ids.sort()).toEqual(['a','b','c','d']);
  expect(closedRegions([...all,stroke('branch',[[100,0],[150,50]])])).toHaveLength(0);
});
it('selects the innermost region and preserves nested holes',()=>{
  const regions=closedRegions([{id:'outer',type:'rectangle',x:0,y:0,width:100,height:100},{id:'inner',type:'ellipse',x:30,y:30,width:40,height:40}]);
  expect(chooseRegion(regions,[10,10])?.holes.map(h=>h.ids)).toEqual([['inner']]);
  expect(chooseRegion(regions,[50,50])?.outer.ids).toEqual(['inner']);
  expect(chooseRegion(regions,[200,200])).toBeNull();
});
