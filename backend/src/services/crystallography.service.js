const rad = Math.PI/180;
function det(m){return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);}
function inv(m){const d=det(m);if(!Number.isFinite(d)||Math.abs(d)<1e-12)throw new Error('Invalid/singular unit-cell metric');return [
[(m[1][1]*m[2][2]-m[1][2]*m[2][1])/d,(m[0][2]*m[2][1]-m[0][1]*m[2][2])/d,(m[0][1]*m[1][2]-m[0][2]*m[1][1])/d],
[(m[1][2]*m[2][0]-m[1][0]*m[2][2])/d,(m[0][0]*m[2][2]-m[0][2]*m[2][0])/d,(m[0][2]*m[1][0]-m[0][0]*m[1][2])/d],
[(m[1][0]*m[2][1]-m[1][1]*m[2][0])/d,(m[0][1]*m[2][0]-m[0][0]*m[2][1])/d,(m[0][0]*m[1][1]-m[0][1]*m[1][0])/d]];}
export function validateCell(system,p){
 const errors=[];
 if(!['a','b','c'].every(k=>Number.isFinite(p[k])&&p[k]>0))errors.push('a, b, c must be positive.');
 if(!['alpha','beta','gamma'].every(k=>Number.isFinite(p[k])&&p[k]>0&&p[k]<180))errors.push('Angles must be between 0 and 180 degrees.');
 if(errors.length)return errors;
 const close=(x,y)=>Math.abs(x-y)<1e-5;
 if(system==='Cubic'&&(!close(p.a,p.b)||!close(p.b,p.c)||![p.alpha,p.beta,p.gamma].every(x=>close(x,90))))errors.push('Cubic requires a=b=c and all angles 90°.');
 if(system==='Tetragonal'&&(!close(p.a,p.b)||![p.alpha,p.beta,p.gamma].every(x=>close(x,90))))errors.push('Tetragonal requires a=b and all angles 90°.');
 if(system==='Orthorhombic'&&![p.alpha,p.beta,p.gamma].every(x=>close(x,90)))errors.push('Orthorhombic requires all angles 90°.');
 if(system==='Hexagonal'&&(!close(p.a,p.b)||!close(p.alpha,90)||!close(p.beta,90)||!close(p.gamma,120)))errors.push('Hexagonal requires a=b, alpha=beta=90°, gamma=120°.');
 if(system==='Trigonal / Rhombohedral'&&(!close(p.a,p.b)||!close(p.b,p.c)||!close(p.alpha,p.beta)||!close(p.beta,p.gamma)))errors.push('Rhombohedral requires a=b=c and alpha=beta=gamma.');
 if(system==='Monoclinic'&&(!close(p.alpha,90)||!close(p.gamma,90)))errors.push('Monoclinic unique-axis-b requires alpha=gamma=90°.');
 const ca=Math.cos(p.alpha*rad),cb=Math.cos(p.beta*rad),cg=Math.cos(p.gamma*rad);
 const g=[[p.a*p.a,p.a*p.b*cg,p.a*p.c*cb],[p.a*p.b*cg,p.b*p.b,p.b*p.c*ca],[p.a*p.c*cb,p.b*p.c*ca,p.c*p.c]];
 if(det(g)<=1e-10)errors.push('Unit-cell geometry is physically invalid.');
 return errors;
}
export function dSpacing(p,h,k,l){
 if(h===0&&k===0&&l===0)throw new Error('(000) is invalid');
 const ca=Math.cos(p.alpha*rad),cb=Math.cos(p.beta*rad),cg=Math.cos(p.gamma*rad);
 const m=[[p.a*p.a,p.a*p.b*cg,p.a*p.c*cb],[p.a*p.b*cg,p.b*p.b,p.b*p.c*ca],[p.a*p.c*cb,p.b*p.c*ca,p.c*p.c]];
 const r=inv(m),v=[h,k,l];let q=0;
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)q+=v[i]*r[i][j]*v[j];
 if(!(q>0))throw new Error('Invalid reciprocal metric');return 1/Math.sqrt(q);
}
export function generateCandidates(p,limits){
 const out=[],seen=new Set();
 for(let h=-limits.maxH;h<=limits.maxH;h++)for(let k=-limits.maxK;k<=limits.maxK;k++)for(let l=-limits.maxL;l<=limits.maxL;l++){
  if(!h&&!k&&!l)continue;
  const d=dSpacing(p,h,k,l);if(d<limits.minD||(limits.maxD!=null&&d>limits.maxD))continue;
  const key=[[h,k,l],[-h,-k,-l]].map(x=>x.join(',')).sort()[0];if(seen.has(key))continue;seen.add(key);
  out.push({h,k,l,dAngstrom:d,dNanometer:d/10,inverseD2:1/(d*d)});
 }
 return out.sort((a,b)=>b.dAngstrom-a.dAngstrom);
}
