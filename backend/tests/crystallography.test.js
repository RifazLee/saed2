import test from 'node:test';
import assert from 'node:assert/strict';
import {dSpacing,validateCell,generateCandidates} from '../src/services/crystallography.service.js';
const cubic={a:4.049,b:4.049,c:4.049,alpha:90,beta:90,gamma:90};
test('cubic aluminium d111 and d200',()=>{
 assert.ok(Math.abs(dSpacing(cubic,1,1,1)-2.33769)<0.0001);
 assert.ok(Math.abs(dSpacing(cubic,2,0,0)-2.0245)<0.0001);
});
test('hexagonal ZnO d100',()=>{
 const p={a:3.249,b:3.249,c:5.206,alpha:90,beta:90,gamma:120};
 assert.ok(Math.abs(dSpacing(p,1,0,0)-2.8137)<0.001);
});
test('zero reflection is rejected',()=>assert.throws(()=>dSpacing(cubic,0,0,0)));
test('cubic geometry constraints are enforced',()=>assert.ok(validateCell('Cubic',{...cubic,b:4}).length));
test('candidate list excludes 000 and has deterministic descending d',()=>{
 const list=generateCandidates(cubic,{maxH:2,maxK:2,maxL:2,minD:0.5});
 assert.ok(list.length>0);assert.ok(list.every(r=>r.h||r.k||r.l));
 assert.ok(list.every((r,i)=>i===0||list[i-1].dAngstrom>=r.dAngstrom));
});
