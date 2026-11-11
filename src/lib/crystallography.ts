export type CrystalSystem =
  | 'Cubic' | 'Tetragonal' | 'Orthorhombic' | 'Hexagonal'
  | 'Trigonal / Rhombohedral' | 'Monoclinic' | 'Triclinic';

export type Lattice = {
  a: number; b: number; c: number;
  alpha: number; beta: number; gamma: number;
};

export type Reflection = {
  h: number; k: number; l: number; hkl: string;
  dAngstrom: number; dNm: number; inverseD2: number;
  status: 'Centering-forbidden' | 'Centering-compatible; SG check required';
};

export function latticeDefaults(system: CrystalSystem): Lattice {
  if (system === 'Hexagonal') return { a: 0, b: 0, c: 0, alpha: 90, beta: 90, gamma: 120 };
  if (system === 'Trigonal / Rhombohedral') return { a: 0, b: 0, c: 0, alpha: 75, beta: 75, gamma: 75 };
  if (system === 'Monoclinic') return { a: 0, b: 0, c: 0, alpha: 90, beta: 105, gamma: 90 };
  if (system === 'Triclinic') return { a: 0, b: 0, c: 0, alpha: 80, beta: 95, gamma: 105 };
  return { a: 0, b: 0, c: 0, alpha: 90, beta: 90, gamma: 90 };
}

/**
 * Apply an edit to one lattice field while keeping the crystal-system constraints
 * satisfied: derived (locked) fields get the correct value automatically, so the
 * operator only enters the independent parameters.
 */
export function updateLatticeValue(system: CrystalSystem, lattice: Lattice, key: keyof Lattice, value: number): Lattice {
  const next: Lattice = { ...lattice, [key]: value };
  switch (system) {
    case 'Cubic':
      if (key === 'a') { next.b = value; next.c = value; }
      next.alpha = 90; next.beta = 90; next.gamma = 90;
      break;
    case 'Tetragonal':
      if (key === 'a') next.b = value;
      next.alpha = 90; next.beta = 90; next.gamma = 90;
      break;
    case 'Orthorhombic':
      next.alpha = 90; next.beta = 90; next.gamma = 90;
      break;
    case 'Hexagonal':
      if (key === 'a') next.b = value;
      next.alpha = 90; next.beta = 90; next.gamma = 120;
      break;
    case 'Trigonal / Rhombohedral':
      if (key === 'a') { next.b = value; next.c = value; }
      if (key === 'alpha' || key === 'beta' || key === 'gamma') {
        next.alpha = value; next.beta = value; next.gamma = value;
      }
      break;
    case 'Monoclinic':
      next.alpha = 90; next.gamma = 90;
      break;
    default:
      break;
  }
  return next;
}

function determinant(m: number[][]): number {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

function inverse3(m: number[][]): number[][] {
  const d = determinant(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) throw new Error('Geometri unit cell singular atau tidak valid.');
  return [
    [(m[1][1]*m[2][2]-m[1][2]*m[2][1])/d, (m[0][2]*m[2][1]-m[0][1]*m[2][2])/d, (m[0][1]*m[1][2]-m[0][2]*m[1][1])/d],
    [(m[1][2]*m[2][0]-m[1][0]*m[2][2])/d, (m[0][0]*m[2][2]-m[0][2]*m[2][0])/d, (m[0][2]*m[1][0]-m[0][0]*m[1][2])/d],
    [(m[1][0]*m[2][1]-m[1][1]*m[2][0])/d, (m[0][1]*m[2][0]-m[0][0]*m[2][1])/d, (m[0][0]*m[1][1]-m[0][1]*m[1][0])/d],
  ];
}

export function validateLattice(system: CrystalSystem, p: Lattice): string[] {
  const errors: string[] = [];
  if ([p.a,p.b,p.c].some(v => !Number.isFinite(v) || v <= 0)) errors.push('Parameter a, b, dan c harus bernilai positif.');
  if ([p.alpha,p.beta,p.gamma].some(v => !Number.isFinite(v) || v <= 0 || v >= 180)) errors.push('Sudut alpha, beta, gamma harus berada di antara 0° dan 180°.');
  if (errors.length) return errors;
  if (system === 'Cubic' && !(p.a > 0)) errors.push('Parameter kubik tidak valid.');
  if (system === 'Trigonal / Rhombohedral' && (Math.abs(p.a-p.b)>1e-6 || Math.abs(p.b-p.c)>1e-6 || Math.abs(p.alpha-p.beta)>1e-6 || Math.abs(p.beta-p.gamma)>1e-6)) errors.push('Rhombohedral mensyaratkan a=b=c dan alpha=beta=gamma.');
  if (system === 'Monoclinic' && (Math.abs(p.alpha-90)>1e-6 || Math.abs(p.gamma-90)>1e-6)) errors.push('Konvensi unique axis b mensyaratkan alpha=gamma=90°.');
  if (system === 'Hexagonal' && (Math.abs(p.a-p.b)>1e-6 || Math.abs(p.alpha-90)>1e-6 || Math.abs(p.beta-90)>1e-6 || Math.abs(p.gamma-120)>1e-6)) errors.push('Hexagonal mensyaratkan a=b, alpha=beta=90°, gamma=120°.');
  if (system === 'Tetragonal' && (Math.abs(p.a-p.b)>1e-6 || Math.abs(p.alpha-90)>1e-6 || Math.abs(p.beta-90)>1e-6 || Math.abs(p.gamma-90)>1e-6)) errors.push('Tetragonal mensyaratkan a=b dan semua sudut 90°.');
  if (system === 'Cubic' && (Math.abs(p.a-p.b)>1e-6 || Math.abs(p.b-p.c)>1e-6 || Math.abs(p.alpha-90)>1e-6 || Math.abs(p.beta-90)>1e-6 || Math.abs(p.gamma-90)>1e-6)) errors.push('Cubic mensyaratkan a=b=c dan semua sudut 90°.');
  if (system === 'Orthorhombic' && (Math.abs(p.alpha-90)>1e-6 || Math.abs(p.beta-90)>1e-6 || Math.abs(p.gamma-90)>1e-6)) errors.push('Orthorhombic mensyaratkan semua sudut 90°.');
  const rad = Math.PI/180;
  const ca=Math.cos(p.alpha*rad), cb=Math.cos(p.beta*rad), cg=Math.cos(p.gamma*rad);
  const metric = [
    [p.a*p.a, p.a*p.b*cg, p.a*p.c*cb],
    [p.a*p.b*cg, p.b*p.b, p.b*p.c*ca],
    [p.a*p.c*cb, p.b*p.c*ca, p.c*p.c],
  ];
  if (determinant(metric) <= 1e-10) errors.push('Kombinasi sudut menghasilkan volume unit cell yang tidak fisik.');
  return errors;
}

export function calculateDSpacing(p: Lattice, h: number, k: number, l: number): number {
  if (h===0 && k===0 && l===0) throw new Error('(000) bukan refleksi yang valid.');
  const r=Math.PI/180, ca=Math.cos(p.alpha*r), cb=Math.cos(p.beta*r), cg=Math.cos(p.gamma*r);
  const direct = [
    [p.a*p.a, p.a*p.b*cg, p.a*p.c*cb],
    [p.a*p.b*cg, p.b*p.b, p.b*p.c*ca],
    [p.a*p.c*cb, p.b*p.c*ca, p.c*p.c],
  ];
  const rec=inverse3(direct);
  const v=[h,k,l];
  let invD2=0;
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) invD2 += v[i]*rec[i][j]*v[j];
  if (!(invD2>0)) throw new Error('Nilai d-spacing tidak valid.');
  return 1/Math.sqrt(invD2);
}

export function centeringAllowed(symbol: string, h: number, k: number, l: number): boolean {
  const lattice=(symbol.trim().replace(/^[-+]/,'')[0] || 'P').toUpperCase();
  switch(lattice) {
    case 'I': return (h+k+l)%2===0;
    case 'F': return Math.abs(h)%2===Math.abs(k)%2 && Math.abs(k)%2===Math.abs(l)%2;
    case 'A': return (k+l)%2===0;
    case 'B': return (h+l)%2===0;
    case 'C': return (h+k)%2===0;
    case 'R': return ((-h+k+l)%3===0); // hexagonal axes, obverse setting; setting must be verified
    default: return true;
  }
}

export function generateReflections(
  p: Lattice, symbol: string, maxH: number, maxK: number, maxL: number,
  minD: number, maxD?: number, includeEquivalent=false,
): Reflection[] {
  const rows: Reflection[]=[];
  const seen=new Set<string>();
  for(let h=-maxH;h<=maxH;h++) for(let k=-maxK;k<=maxK;k++) for(let l=-maxL;l<=maxL;l++) {
    if(h===0&&k===0&&l===0) continue;
    const d=calculateDSpacing(p,h,k,l);
    if(d<minD || (maxD!==undefined && d>maxD)) continue;
    const canonical=includeEquivalent ? `${h},${k},${l}` : [ [h,k,l],[-h,-k,-l] ].map(v=>v.join(',')).sort()[0];
    if(seen.has(canonical)) continue;
    seen.add(canonical);
    rows.push({h,k,l,hkl:`(${h} ${k} ${l})`,dAngstrom:d,dNm:d/10,inverseD2:1/(d*d),
      status:centeringAllowed(symbol,h,k,l) ? 'Centering-compatible; SG check required':'Centering-forbidden'});
  }
  return rows.sort((a,b)=>b.dAngstrom-a.dAngstrom);
}
