import {expect,it} from 'vitest';import {absoluteInkPoints} from './inkGeometry';
it('keeps ordinary ink in absolute board coordinates',()=>{expect(absoluteInkPoints({x:10,y:20,points:[[0,0],[30,15]]})).toEqual([[10,20],[40,35]])});
it('rotates ink around the same center as the visible element',()=>{const p=absoluteInkPoints({x:10,y:20,width:100,height:50,angle:Math.PI/2,points:[[0,0],[100,50]]});expect(p[0][0]).toBeCloseTo(85);expect(p[0][1]).toBeCloseTo(-5);expect(p[1][0]).toBeCloseTo(35);expect(p[1][1]).toBeCloseTo(95)});
