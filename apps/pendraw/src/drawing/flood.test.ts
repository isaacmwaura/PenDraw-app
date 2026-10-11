import {expect,it} from 'vitest';import {flood} from './flood';
it('fills a closed rendered boundary and keeps an enclosed island empty',()=>{
 const mask=new Uint8ClampedArray(9*9*4);for(let y=1;y<8;y++)for(let x=1;x<8;x++)if(x===1||x===7||y===1||y===7||(x===4&&y===4))mask[(y*9+x)*4+3]=255;
 const result=flood(mask,9,9,2,2)!;expect(result).not.toBeNull();expect(result[2*9+2]).toBe(1);expect(result[4*9+4]).toBe(0);expect(result[0]).toBe(0);
 mask[(1*9+3)*4+3]=0;expect(flood(mask,9,9,2,2)).toBeNull();
});
it('rejects a seed on ink and an outside seed',()=>{const mask=new Uint8ClampedArray(5*5*4);mask[(2*5+2)*4+3]=255;expect(flood(mask,5,5,2,2)).toBeNull();expect(flood(mask,5,5,-1,0)).toBeNull()});
