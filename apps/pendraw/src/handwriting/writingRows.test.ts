import {expect,it} from 'vitest';
import {writingRows} from './writingRows';
it('separates stacked lines with clear blank space, preserving input indices',()=>{
  expect(writingRows([[[30,100],[40,120]],[[0,10],[12,30]],[[15,12],[22,28]],[[0,102],[15,118]]])).toEqual([[1,2],[0,3]]);
});
it('keeps dots, staggered letters and close writing together',()=>{
  expect(writingRows([[[0,0],[1,1]],[[0,8],[0,30]],[[10,12],[10,36]],[[15,40],[20,60]]])).toEqual([[0,1,2,3]]);
});
it('does not split a stroke spanning both rows or invent ink for empty input',()=>{
  expect(writingRows([])).toEqual([]);
  expect(writingRows([[[0,0],[0,100]],[[10,10],[20,20]],[[10,80],[20,95]]])).toEqual([[0,1,2]]);
});
