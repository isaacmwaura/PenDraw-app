import {expect,it} from 'vitest';import {straightCandidate} from './straighten';
it('straightens a long nearly straight line without changing its endpoints',()=>{expect(straightCandidate([[0,0],[20,1],[40,-1],[60,2],[100,0]])).toEqual([[0,0],[100,0]])});
it('protects short handwriting, curved marks and loops',()=>{expect(straightCandidate([[0,0],[5,1],[10,0],[15,1],[20,0]])).toBeNull();expect(straightCandidate([[0,0],[20,30],[50,50],[80,30],[100,0]])).toBeNull();expect(straightCandidate([[0,0],[100,0],[100,100],[0,100],[0,0]])).toBeNull()});
it('uses visible length rather than zoom-dependent scene size',()=>{expect(straightCandidate([[0,0],[10,0],[20,1],[30,0],[50,0]],2)).not.toBeNull();expect(straightCandidate([[0,0],[20,0],[40,1],[60,0],[100,0]],.5)).toBeNull()});
