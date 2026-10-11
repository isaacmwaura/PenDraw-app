import {expect,it} from 'vitest';import {parseFixture,measureText,editDistance} from './fixtures';
it('reports actual character differences and normalizes line breaks',()=>{expect(measureText('Hello world','Hello\nworld').exact).toBe(true);expect(measureText('Hello','Helo').characterErrors).toBe(1);expect(measureText('','O').characterErrors).toBe(1)});
it('compares Unicode characters rather than UTF-16 halves',()=>{expect(editDistance('🙂','😄')).toBe(1);expect(editDistance('日本語','日本')).toBe(1)});

it('loads the saved synthetic corpus and rejects unsafe samples',async()=>{
  for(const name of ['drawing-box','pause-bars']){
    const f=await import('../../tests/fixtures/'+name+'.json');
    expect(parseFixture(f.default).source).toBe('synthetic');
  }
  expect(()=>parseFixture({format:'other'})).toThrow();
  expect(()=>parseFixture({format:'pendraw-ink-fixture',version:1,source:'captured',kind:'text',expectedText:'ok',strokes:[[[NaN,0],[1,1]]]})).toThrow();
});
