import { useMemo, useState } from 'react';
import { Atom, Calculator, ChevronLeft, Database, Download, Loader2, Plus, Search, ShieldCheck, CheckSquare, SquareCheck, XSquare } from 'lucide-react';
import { generateReflections, latticeDefaults, updateLatticeValue, validateLattice, type CrystalSystem, type Lattice, type Reflection, type ReflectionStatus } from '@/lib/crystallography';

export type MaterialRecord = {
  id: string; name: string; formula: string; phase: string; description: string;
  source: string; doi: string; notes: string; system: CrystalSystem;
  sgNumber: number; sgSymbol: string; setting: string; lattice: Lattice;
  reflections: Reflection[]; allowedCount: number; status: 'Draft'|'Calculated'|'Pending Validation'|'Validated'|'Rejected';
  createdAt: string; validatedAt?: string;
  calculationLimits?: {maxH:number;maxK:number;maxL:number;minD:number;maxD?:number};
};

type SaveStatus = 'idle' | 'classifying' | 'saving' | 'done';

type Props = { materials: MaterialRecord[]; onSave: (m: MaterialRecord, selected: Reflection[]) => Promise<void>; onOpenAnalysis: () => void; onViewDetail: (id: string) => void };

const systems: CrystalSystem[] = ['Cubic','Tetragonal','Orthorhombic','Hexagonal','Trigonal / Rhombohedral','Monoclinic','Triclinic'];
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold text-slate-600';
const statusStyles: Record<ReflectionStatus, string> = {
  'Allowed': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Forbidden': 'bg-red-50 text-red-700 ring-red-200',
  'Centering-compatible': 'bg-sky-50 text-sky-700 ring-sky-200',
  'Requires SG verification': 'bg-amber-50 text-amber-700 ring-amber-200',
};
type FilterKey = 'all' | ReflectionStatus;
const filterOptions: {key:FilterKey;label:string}[] = [
  {key:'all',label:'All reflections'},
  {key:'Allowed',label:'Allowed'},
  {key:'Forbidden',label:'Forbidden'},
  {key:'Centering-compatible',label:'Centering-compatible'},
  {key:'Requires SG verification',label:'Requires SG verification'},
];

export default function MaterialPage({ materials, onSave, onOpenAnalysis, onViewDetail }: Props) {
  const [view,setView]=useState<'database'|'calculator'>('database');
  const [name,setName]=useState(''); const [formula,setFormula]=useState(''); const [phase,setPhase]=useState('');
  const [description,setDescription]=useState(''); const [source,setSource]=useState(''); const [doi,setDoi]=useState(''); const [notes,setNotes]=useState('');
  const [system,setSystem]=useState<CrystalSystem>('Cubic'); const [sgNumber,setSgNumber]=useState('225'); const [sgSymbol,setSgSymbol]=useState('Fm-3m'); const [setting,setSetting]=useState('Standard');
  const [lattice,setLattice]=useState<Lattice>(latticeDefaults('Cubic'));
  const [maxH,setMaxH]=useState('8'); const [maxK,setMaxK]=useState('8'); const [maxL,setMaxL]=useState('8');
  const [minD,setMinD]=useState('0.5'); const [maxD,setMaxD]=useState(''); const [includeEquivalent,setIncludeEquivalent]=useState(false);
  const [rows,setRows]=useState<Reflection[]>([]);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [classifiedRows,setClassifiedRows]=useState<Reflection[]|null>(null);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState<FilterKey>('all');
  const [error,setError]=useState('');
  const [saveStatus,setSaveStatus]=useState<SaveStatus>('idle');
  const [saveSuccess,setSaveSuccess]=useState('');
  const [current,setCurrent]=useState<MaterialRecord|null>(null);

  const errors=useMemo(()=>validateLattice(system,lattice),[system,lattice]);
  const rowKey=(r:Reflection)=>`${r.h},${r.k},${r.l}`;

  const visibleRows=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return rows.filter(r=>(filter==='all'||r.status===filter) && (!term || r.hkl.toLowerCase().includes(term) || `${r.h} ${r.k} ${r.l}`.includes(term)));
  },[rows,filter,search]);

  const selectionCounts=useMemo(()=>{
    const all=rows;
    let selectedAllowed=0,selectedForbidden=0,selectedCentering=0,selectedRequires=0;
    for(const r of all){
      if(!selected.has(rowKey(r)))continue;
      if(r.status==='Allowed')selectedAllowed++;
      else if(r.status==='Forbidden')selectedForbidden++;
      else if(r.status==='Centering-compatible')selectedCentering++;
      else if(r.status==='Requires SG verification')selectedRequires++;
    }
    return {totalSelected:selected.size,selectedAllowed,selectedForbidden,selectedCentering,selectedRequires};
  },[rows,selected]);

  const update=(key:keyof Lattice,value:string)=>setLattice(p=>updateLatticeValue(system,p,key,Number(value)));
  function changeSystem(value:CrystalSystem){setSystem(value);setLattice(latticeDefaults(value));setRows([]);setSelected(new Set());setClassifiedRows(null);}

  function generate(){
    setError('');setClassifiedRows(null);setSaveSuccess('');
    if(errors.length){setError(errors.join(' '));return;}
    const sg=Number(sgNumber);
    if(!Number.isInteger(sg)||sg<1||sg>230||!sgSymbol.trim()){setError('Nomor space group harus 1–230 dan simbol Hermann–Mauguin wajib diisi.');return;}
    const limits=[maxH,maxK,maxL].map(Number), min=Number(minD), max=maxD.trim()?Number(maxD):undefined;
    if(limits.some(v=>!Number.isInteger(v)||v<0||v>30)||!Number.isFinite(min)||min<=0||(max!==undefined&&(!Number.isFinite(max)||max<min))){setError('Batas HKL harus integer 0–30. Rentang d-spacing harus positif dan maksimum tidak lebih kecil dari minimum.');return;}
    try {
      const generated=generateReflections(lattice,sgSymbol,limits[0],limits[1],limits[2],min,max,includeEquivalent);
      setRows(generated);
      setSelected(new Set(generated.map(rowKey)));
    } catch(e){setError(e instanceof Error?e.message:'Perhitungan gagal.');}
  }

  function toggleRow(r:Reflection){
    const key=rowKey(r);
    setSelected(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;});
  }
  function selectAll(){setSelected(new Set(rows.map(rowKey)));}
  function deselectAll(){setSelected(new Set());}
  function selectAllowedOnly(){setSelected(new Set(rows.filter(r=>r.status==='Allowed').map(rowKey)));}

  async function saveSelected(){
    setError('');setSaveSuccess('');
    if(!name.trim()||!formula.trim()||!phase.trim()||!source.trim()){setError('Lengkapi nama material, formula, fase kristal, dan sumber referensi.');return;}
    if(errors.length){setError(errors.join(' '));return;}
    if(!Number.isInteger(Number(sgNumber))||Number(sgNumber)<1||Number(sgNumber)>230||!sgSymbol.trim()){setError('Nomor space group harus 1–230 dan simbol Hermann–Mauguin wajib diisi.');return;}
    if(selected.size===0){setError('Pilih minimal satu refleksi HKL untuk disimpan.');return;}
    const selectedReflections=rows.filter(r=>selected.has(rowKey(r)));
    setSaveStatus('classifying');
    try {
      const record:MaterialRecord={id:current?.id??crypto.randomUUID(),name,formula,phase,description,source,doi,notes,system,sgNumber:Number(sgNumber),sgSymbol,setting,lattice,reflections:selectedReflections,allowedCount:selectedReflections.filter(r=>r.status==='Allowed').length,calculationLimits:{maxH:Number(maxH),maxK:Number(maxK),maxL:Number(maxL),minD:Number(minD),...(maxD.trim()?{maxD:Number(maxD)}:{})},status:'Pending Validation',createdAt:current?.createdAt??new Date().toISOString()};
      await onSave(record,selectedReflections);
      setSaveStatus('done');
      setSaveSuccess(`${selectedReflections.length} refleksi HKL berhasil disimpan ke database. Material kini berstatus "Pending Validation" dan siap divalidasi.`);
      setCurrent(record);
    } catch(e){
      setSaveStatus('idle');
      setError(e instanceof Error ? e.message : 'Gagal menyimpan refleksi HKL.');
    }
  }

  function exportCsv(){
    const lines=['h,k,l,HKL,d_Angstrom,d_nm,1_d2,reflection_status',...visibleRows.map(r=>[r.h,r.k,r.l,r.hkl,r.dAngstrom.toFixed(6),r.dNm.toFixed(6),r.inverseD2.toFixed(8),r.status].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))];
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a');a.href=url;a.download=`${(name||'material').replace(/\s+/g,'_')}_HKL.csv`;a.click();URL.revokeObjectURL(url);
  }
  function startNew(){setCurrent(null);setName('');setFormula('');setPhase('');setDescription('');setSource('');setDoi('');setNotes('');setSystem('Cubic');setLattice(latticeDefaults('Cubic'));setSgNumber('225');setSgSymbol('Fm-3m');setRows([]);setSelected(new Set());setClassifiedRows(null);setError('');setSaveSuccess('');setSaveStatus('idle');setView('calculator');}

  if(view==='database') return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="bg-slate-950 text-white px-6 py-5"><div className="mx-auto flex max-w-6xl items-center gap-3"><Atom/><div><h1 className="text-xl font-semibold">Material Reference Database</h1><p className="mt-1 text-xs text-slate-300">Manage, calculate, validate, and store crystallographic material references for TEM diffraction analysis.</p></div><button onClick={onOpenAnalysis} className="ml-auto rounded-lg border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800">Diffraction Analysis</button></div></header>
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="grid gap-4 sm:grid-cols-4">{[['Total Materials',materials.length],['Validated Materials',materials.filter(m=>m.status==='Validated').length],['Pending Validation',materials.filter(m=>m.status==='Pending Validation').length],['Draft Materials',materials.filter(m=>m.status==='Draft'||m.status==='Calculated').length]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>
      <div className="mt-7 flex items-center justify-between"><div><h2 className="font-semibold">Registered Materials</h2><p className="mt-1 text-xs text-slate-500">Validated references are intended for diffraction matching.</p></div><button onClick={startNew} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"><Plus size={16}/> Input New Material</button></div>
      {materials.length===0?<div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><Database size={42} className="mx-auto text-slate-300"/><h3 className="mt-4 font-semibold">No Materials Registered Yet</h3><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Start by creating a custom material reference. Define its crystal structure, lattice parameters, and space group to calculate theoretical HKL and d-spacing values.</p><button onClick={startNew} className="mt-5 rounded-lg bg-slate-900 px-5 py-2.5 text-sm text-white">+ Input New Material</button></div>:
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[1000px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Material Name','Formula','Phase','Crystal System','Space Group','Lattice (Å)','Allowed*','Status','Date Created','Actions'].map(x=><th key={x} className="px-3 py-3 font-semibold">{x}</th>)}</tr></thead><tbody>{materials.map(m=><tr key={m.id} className="border-t border-slate-100"><td className="px-3 py-3 font-medium">{m.name}</td><td className="px-3 py-3">{m.formula}</td><td className="px-3 py-3">{m.phase}</td><td className="px-3 py-3">{m.system}</td><td className="px-3 py-3">{m.sgSymbol} ({m.sgNumber})</td><td className="px-3 py-3">{m.lattice.a}, {m.lattice.b}, {m.lattice.c}</td><td className="px-3 py-3 tabular-nums">{m.allowedCount}</td><td className="px-3 py-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{m.status}</span></td><td className="px-3 py-3">{new Date(m.createdAt).toLocaleDateString()}</td><td className="px-3 py-3"><div className="flex items-center gap-3"><button onClick={()=>onViewDetail(m.id)} className="text-blue-700 hover:underline">View</button><button onClick={()=>{setValidationChecks({});setCurrent(m);setName(m.name);setFormula(m.formula);setPhase(m.phase);setSystem(m.system);setLattice(m.lattice);setRows(m.reflections);setSgNumber(String(m.sgNumber));setSgSymbol(m.sgSymbol);setSource(m.source);setDoi(m.doi);setDescription(m.description);setNotes(m.notes);setView('calculator');}} className="text-blue-700 hover:underline">Edit</button></div></td></tr>)}</tbody></table><p className="px-3 py-2 text-[11px] text-slate-400">*Jumlah refleksi dengan status Allowed pada versi material saat ini, dihitung dari database.</p></div>}
    </main>
  </div>;

  const isBusy=saveStatus==='classifying'||saveStatus==='saving';

  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="bg-slate-950 px-6 py-4 text-white"><div className="mx-auto flex max-w-6xl items-center gap-3"><button onClick={()=>setView('database')} className="rounded-lg p-2 hover:bg-slate-800"><ChevronLeft/></button><div><p className="text-xs text-slate-400">MATERIAL REFERENCE DATABASE / CALCULATOR</p><h1 className="text-lg font-semibold">Material Calculation</h1></div><span className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-xs">Calculation workspace</span></div></header>
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-7">
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Atom size={18}/> A. Material Information</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[['Material Name',name,setName],['Chemical Formula',formula,setFormula],['Crystal Phase',phase,setPhase],['Reference Source / Literature',source,setSource],['Reference DOI or URL',doi,setDoi],['Material Description',description,setDescription],['Notes',notes,setNotes]].map(([label,val,setter])=><label key={String(label)}><span className={labelClass}>{label as string}{['Material Name','Chemical Formula','Crystal Phase','Reference Source / Literature'].includes(String(label))?' *':''}</span><input className={inputClass} value={val as string} onChange={e=>(setter as (s:string)=>void)(e.target.value)} /></label>)}</div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-semibold">B. Crystal System & Lattice Parameters</h2><div className="grid gap-4 md:grid-cols-3"><label><span className={labelClass}>Crystal System</span><select className={inputClass} value={system} onChange={e=>changeSystem(e.target.value as CrystalSystem)}>{systems.map(s=><option key={s}>{s}</option>)}</select></label><label><span className={labelClass}>Space Group Number (1–230)</span><input className={inputClass} type="number" min="1" max="230" value={sgNumber} onChange={e=>setSgNumber(e.target.value)}/></label><label><span className={labelClass}>Hermann–Mauguin Symbol</span><input className={inputClass} value={sgSymbol} onChange={e=>setSgSymbol(e.target.value)}/></label></div><div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{(['a','b','c','alpha','beta','gamma'] as (keyof Lattice)[]).map(key=>{const fixed=(system==='Cubic'&&(key==='b'||key==='c'||['alpha','beta','gamma'].includes(key)))||(system==='Tetragonal'&&(key==='b'||['alpha','beta','gamma'].includes(key)))||(system==='Hexagonal'&&(key==='b'||key==='alpha'||key==='beta'||key==='gamma'))||(system==='Orthorhombic'&&['alpha','beta','gamma'].includes(key))||(system==='Monoclinic'&&(key==='alpha'||key==='gamma'))||(system==='Trigonal / Rhombohedral'&&(key==='b'||key==='c'||key==='beta'||key==='gamma'));return <label key={key}><span className={labelClass}>{key} {['a','b','c'].includes(key)?'(Å)':'(°)'}</span><input className={inputClass} type="number" step="any" value={lattice[key]} disabled={fixed} onChange={e=>update(key,e.target.value)}/></label>})}</div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500"><span>Setting: <select value={setting} onChange={e=>setSetting(e.target.value)} className="rounded border border-slate-200 px-2 py-1"><option>Standard</option><option>Unique axis b</option><option>Rhombohedral</option><option>Hexagonal axes</option><option>Obverse</option><option>Reverse</option></select></span><span className="self-center">Sudut dimasukkan dalam derajat; kalkulasi internal menggunakan radian.</span></div>{errors.length>0&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{errors.join(' ')}</p>}</section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><Calculator size={18}/> C–D. HKL Generator & d-Spacing</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[['Maximum h',maxH,setMaxH],['Maximum k',maxK,setMaxK],['Maximum l',maxL,setMaxL],['Minimum d (Å)',minD,setMinD],['Maximum d (Å), optional',maxD,setMaxD]].map(([label,val,setter])=><label key={String(label)}><span className={labelClass}>{label as string}</span><input className={inputClass} value={val as string} onChange={e=>(setter as (s:string)=>void)(e.target.value)} type="number" step="any"/></label>)}</div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeEquivalent} onChange={e=>setIncludeEquivalent(e.target.checked)}/> Tampilkan pasangan simetri ±hkl sebagai entri terpisah (tanpa reduksi simetri penuh)</label>
        <button onClick={generate} disabled={isBusy} className="mt-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">Generate HKL & Calculate d-spacing</button>
        {error&&<p className="mt-3 text-xs text-red-600">{error}</p>}
        {rows.length>0 && <>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Total calculated reflections" value={rows.length}/>
            <Metric label="Total selected reflections" value={selectionCounts.totalSelected}/>
            <Metric label="Selected Allowed" value={selectionCounts.selectedAllowed}/>
            <Metric label="Selected Forbidden" value={selectionCounts.selectedForbidden}/>
            <Metric label="Selected Centering-compatible" value={selectionCounts.selectedCentering}/>
            <Metric label="Selected Requires SG verification" value={selectionCounts.selectedRequires}/>
            <Metric label="Displayed results" value={visibleRows.length}/>
            <Metric label="Allowed (all)" value={rows.filter(r=>r.status==='Allowed').length}/>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><input className={`${inputClass} pl-8`} placeholder="Search HKL..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
            <select className={inputClass+' w-auto'} value={filter} onChange={e=>setFilter(e.target.value as FilterKey)}>{filterOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select>
            <button onClick={exportCsv} disabled={visibleRows.length===0} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-40"><Download size={14}/> Export CSV</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button onClick={selectAll} disabled={isBusy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"><CheckSquare size={14}/> Select All</button>
            <button onClick={deselectAll} disabled={isBusy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"><XSquare size={14}/> Deselect All</button>
            <button onClick={selectAllowedOnly} disabled={isBusy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"><SquareCheck size={14}/> Select Allowed Only</button>
          </div>
          <div className="mt-3 max-h-[480px] overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['','No.','h','k','l','HKL','d (Å)','d (nm)','1/d²','Reflection status'].map(t=><th key={t} className="px-3 py-2.5">{t}</th>)}</tr></thead><tbody>{visibleRows.slice(0,2000).map((r,i)=>{const key=rowKey(r);return <tr key={key} className={`border-t border-slate-100 ${selected.has(key)?'bg-sky-50/40':''}`}><td className="px-3 py-2"><input type="checkbox" checked={selected.has(key)} onChange={()=>toggleRow(r)} disabled={isBusy}/></td><td className="px-3 py-2 tabular-nums text-slate-400">{i+1}</td><td className="px-3 py-2 tabular-nums">{r.h}</td><td className="px-3 py-2 tabular-nums">{r.k}</td><td className="px-3 py-2 tabular-nums">{r.l}</td><td className="px-3 py-2 font-mono">{r.hkl}</td><td className="px-3 py-2 tabular-nums">{r.dAngstrom.toFixed(5)}</td><td className="px-3 py-2 tabular-nums">{r.dNm.toFixed(6)}</td><td className="px-3 py-2 tabular-nums">{r.inverseD2.toFixed(7)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${statusStyles[r.status]}`}>{r.status}</span></td></tr>;})}</tbody></table>{visibleRows.length>2000&&<p className="p-3 text-xs text-slate-500">Menampilkan 2.000 baris pertama; seluruh hasil tetap tersedia pada ekspor CSV.</p>}</div>
        </>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck size={18}/> E. Save Selected HKL to Database</h2>
        <p className="mb-4 text-xs text-slate-500">Hanya refleksi yang dicentang yang akan disimpan ke database, berasosiasi dengan versi material yang sesuai. Klasifikasi ilmiah (Allowed / Forbidden / Centering-compatible / Requires SG verification) tidak berubah saat disimpan. Setelah disimpan, material berstatus "Pending Validation" dan dapat divalidasi pada halaman Material Detail.</p>
        {saveSuccess && <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{saveSuccess}</div>}
        <div className="flex flex-wrap gap-2">
          <button onClick={saveSelected} disabled={isBusy || selected.size===0} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
            {isBusy ? <><Loader2 size={16} className="animate-spin"/> {saveStatus==='classifying'?'Mengklasifikasi via spglib...':'Menyimpan...'}'}</> : <><ShieldCheck size={16}/> Save Selected HKL to Database</>}
          </button>
        </div>
      </section>
      <p className="text-[11px] leading-relaxed text-slate-500">Catatan ilmiah: Klasifikasi sistematis absensi (screw-axis / glide-plane) ditentukan oleh layanan Python/spglib. Pemilihan operator menentukan refleksi mana yang disimpan, bukan mengubah klasifikasinya. Validasi material tidak mengubah status refleksi HKL individual.</p>
    </main>
  </div>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>}
