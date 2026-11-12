import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Atom, ChevronLeft, Download, Search, ShieldCheck, CheckCircle2, XCircle,
  AlertTriangle, Info, ChevronLeft as ChevronPrev, ChevronRight, Loader2
} from 'lucide-react';
import { api, parseLatticeJson, type ApiEnvelope, type ApiMaterial, type ApiReflection, type ApiReflectionSummary, type ValidateResponse } from '@/lib/api';

type Props = { materialId: string; token: string | null; onBack: () => void };

type StatusFilter = 'Allowed' | 'Forbidden' | 'Centering-compatible' | 'Requires SG verification' | 'All';
const PAGE_SIZE = 25;

const statusStyles: Record<string, string> = {
  'Allowed': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Forbidden': 'bg-red-50 text-red-700 ring-red-200',
  'Centering-compatible': 'bg-sky-50 text-sky-700 ring-sky-200',
  'Requires SG verification': 'bg-amber-50 text-amber-700 ring-amber-200'
};

const infoRow = 'flex justify-between gap-4 py-2 border-b border-slate-100 text-sm';
const infoLabel = 'text-slate-500 shrink-0';
const infoValue = 'text-slate-800 font-medium text-right';

export default function MaterialDetailPage({ materialId, token, onBack }: Props) {
  const [material, setMaterial] = useState<ApiMaterial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('Allowed');
  const [page, setPage] = useState(1);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api<ApiEnvelope<ApiMaterial>>(`/materials/${materialId}`, {}, token);
      setMaterial(response.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat detail material.');
    } finally { setLoading(false); }
  }, [materialId, token]);

  useEffect(() => { void load(); }, [load]);

  const summary: ApiReflectionSummary = useMemo(() => {
    if (material?.summary) return material.summary;
    const refs = material?.reflections || [];
    return {
      total: refs.length,
      allowed: refs.filter(r => r.reflection_status === 'Allowed').length,
      forbidden: refs.filter(r => r.reflection_status === 'Forbidden').length,
      centeringCompatible: refs.filter(r => r.reflection_status === 'Centering-compatible').length,
      requiresVerification: refs.filter(r => r.reflection_status === 'Requires SG verification').length
    };
  }, [material]);

  const filtered = useMemo(() => {
    const refs = material?.reflections || [];
    const term = search.trim().toLowerCase();
    return refs
      .filter(r => filter === 'All' || r.reflection_status === filter)
      .filter(r => !term || `${r.h} ${r.k} ${r.l}`.includes(term) || `(${r.h} ${r.k} ${r.l})`.toLowerCase().includes(term));
  }, [material, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, filter]);

  const lattice = useMemo(() => material ? parseLatticeJson(material) : null, [material]);
  const canValidate = material?.status === 'Pending Validation';

  async function confirmValidate() {
    if (!material || validating) return;
    setValidating(true); setValidateError(''); setSuccessMessage('');
    try {
      await api<ValidateResponse>(`/materials/${material.id}/validate`, {
        method: 'POST',
        body: JSON.stringify({ validationNotes: 'Operator reviewed material metadata, lattice parameters, reference source and generated reflections.' })
      }, token);
      setSuccessMessage(`Material "${material.material_name}" berhasil divalidasi dan kini tersedia untuk analisis SAED.`);
      setConfirmOpen(false);
      await load();
    } catch (e) {
      setValidateError(e instanceof Error ? e.message : 'Validasi gagal.');
      setConfirmOpen(false);
    } finally { setValidating(false); }
  }

  function exportCsv() {
    const header = ['No', 'h', 'k', 'l', 'HKL', 'd_Angstrom', 'd_nm', '1_d2', 'Status'];
    const lines = [header.join(','), ...filtered.map((r, i) => [
      i + 1, r.h, r.k, r.l, `(${r.h} ${r.k} ${r.l})`,
      Number(r.d_angstrom).toFixed(6), Number(r.d_nanometer).toFixed(6),
      Number(r.inverse_d2).toFixed(8), r.reflection_status
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))];
    const name = material?.material_name || 'material';
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${name.replace(/\s+/g, '_')}_HKL_${filter.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Shell onBack={onBack}><div className="flex items-center justify-center py-24 text-slate-500"><Loader2 className="animate-spin mr-2" size={20}/> Memuat detail material...</div></Shell>;
  if (error && !material) return <Shell onBack={onBack}><div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{error}<div><button onClick={load} className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-xs hover:bg-red-100">Coba lagi</button></div></div></Shell>;
  if (!material) return null;

  return (
    <Shell onBack={onBack}>
      {/* Header card */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white"><Atom size={22}/></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{material.material_name}</h2>
              <StatusBadge status={material.status}/>
            </div>
            <p className="mt-1 text-sm text-slate-500">{material.chemical_formula} · {material.phase} · {material.crystal_system} · {material.space_group_symbol} ({material.space_group_number})</p>
          </div>
          {canValidate && (
            <button onClick={() => { setValidateError(''); setConfirmOpen(true); }} disabled={validating}
              className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              <ShieldCheck size={16}/> Validate Material
            </button>
          )}
        </div>
        {successMessage && <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 size={16} className="mt-0.5 shrink-0"/>{successMessage}</div>}
        {validateError && <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700"><XCircle size={16} className="mt-0.5 shrink-0"/>{validateError}</div>}
        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      </section>

      {/* Summary cards */}
      <section className="grid gap-4 sm:grid-cols-5">
        {([
          ['Total Allowed Reflections', summary.allowed, 'text-emerald-700'],
          ['Total Forbidden Reflections', summary.forbidden, 'text-red-700'],
          ['Centering-compatible', summary.centeringCompatible ?? 0, 'text-sky-700'],
          ['Requires SG Verification', summary.requiresVerification, 'text-amber-700'],
          ['Total HKL Records', summary.total, 'text-slate-900']
        ] as const).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Material information */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-1">
          <h3 className="mb-3 font-semibold text-slate-900">Material Information</h3>
          {lattice && (<>
            <div className={infoRow}><span className={infoLabel}>Material Name</span><span className={infoValue}>{material.material_name}</span></div>
            <div className={infoRow}><span className={infoLabel}>Chemical Formula</span><span className={infoValue}>{material.chemical_formula}</span></div>
            <div className={infoRow}><span className={infoLabel}>Phase</span><span className={infoValue}>{material.phase}</span></div>
            <div className={infoRow}><span className={infoLabel}>Crystal System</span><span className={infoValue}>{material.crystal_system}</span></div>
            <div className={infoRow}><span className={infoLabel}>Space Group Symbol</span><span className={infoValue}>{material.space_group_symbol}</span></div>
            <div className={infoRow}><span className={infoLabel}>Space Group Number</span><span className={infoValue}>{material.space_group_number}</span></div>
            <div className={infoRow}><span className={infoLabel}>Crystal Setting</span><span className={infoValue}>{material.setting}</span></div>
            <div className={infoRow}><span className={infoLabel}>Lattice a (Å)</span><span className={infoValue}>{lattice.a}</span></div>
            <div className={infoRow}><span className={infoLabel}>Lattice b (Å)</span><span className={infoValue}>{lattice.b}</span></div>
            <div className={infoRow}><span className={infoLabel}>Lattice c (Å)</span><span className={infoValue}>{lattice.c}</span></div>
            <div className={infoRow}><span className={infoLabel}>Angle α (°)</span><span className={infoValue}>{lattice.alpha}</span></div>
            <div className={infoRow}><span className={infoLabel}>Angle β (°)</span><span className={infoValue}>{lattice.beta}</span></div>
            <div className={infoRow}><span className={infoLabel}>Angle γ (°)</span><span className={infoValue}>{lattice.gamma}</span></div>
            <div className={infoRow}><span className={infoLabel}>Reference Source</span><span className={infoValue}>{material.source || '-'}</span></div>
            <div className={infoRow}><span className={infoLabel}>DOI</span><span className={infoValue}>{material.doi || '-'}</span></div>
            <div className={infoRow}><span className={infoLabel}>Material Status</span><span className={infoValue}>{material.status}</span></div>
            <div className={infoRow}><span className={infoLabel}>Created Date</span><span className={infoValue}>{material.created_at ? new Date(material.created_at).toLocaleDateString() : '-'}</span></div>
            <div className={infoRow}><span className={infoLabel}>Validated Date</span><span className={infoValue}>{material.validated_at ? new Date(material.validated_at).toLocaleDateString() : '-'}</span></div>
            {material.version && <div className={infoRow}><span className={infoLabel}>Version</span><span className={infoValue}>v{material.version.version_number} · {material.version.validation_status}</span></div>}
          </>)}
        </section>

        {/* Reflections table */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">HKL Reflections</h3>
              <p className="mt-1 text-xs text-slate-500">{filtered.length} refleksi ({filter}) — diurutkan berdasarkan d-spacing menurun.</p>
            </div>
            <button onClick={exportCsv} disabled={filtered.length === 0} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-40"><Download size={14}/> Export CSV</button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-44 flex-1">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
              <input className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100" placeholder="Cari HKL (contoh: 1 1 1)..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500" value={filter} onChange={e => setFilter(e.target.value as StatusFilter)}>
              <option value="Allowed">Allowed</option>
              <option value="Forbidden">Forbidden</option>
              <option value="Centering-compatible">Centering-compatible</option>
              <option value="Requires SG verification">Requires SG verification</option>
              <option value="All">All reflections</option>
            </select>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{['No.', 'h', 'k', 'l', 'HKL', 'd (Å)', 'd (nm)', '1/d²', 'Status'].map(t => <th key={t} className="px-3 py-2.5 font-semibold">{t}</th>)}</tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500"><Info size={20} className="mx-auto mb-2 text-slate-300"/>Tidak ada refleksi yang cocok dengan filter atau pencarian.</td></tr>}
                {pageRows.map((r, i) => <ReflectionRow key={r.id ?? `${r.h}-${r.k}-${r.l}-${i}`} row={r} index={(page - 1) * PAGE_SIZE + i + 1}/>)}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Halaman {page} dari {totalPages} · {filtered.length} refleksi</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronPrev size={14}/></button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40"><ChevronRight size={14}/></button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Validation confirm dialog */}
      {confirmOpen && material && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck size={20}/></div>
              <div>
                <h4 className="font-semibold text-slate-900">Validate Material</h4>
                <p className="mt-1 text-sm text-slate-600">Anda akan memvalidasi material <strong>{material.material_name}</strong> ({material.chemical_formula}). Validasi menyetujui material ini untuk digunakan dalam database referensi SAED.</p>
                <p className="mt-2 text-xs text-slate-500">Tindakan ini akan menandai versi perhitungan saat ({material.version ? `v${material.version.version_number}` : 'current'}) sebagai tervalidasi dan mencatatnya dalam audit trail.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} disabled={validating} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">Batal</button>
              <button onClick={confirmValidate} disabled={validating} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
                {validating ? <><Loader2 size={14} className="animate-spin"/> Memvalidasi...</> : <><ShieldCheck size={14}/> Confirm Validation</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function ReflectionRow({ row, index }: { row: ApiReflection; index: number }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/60">
      <td className="px-3 py-2 tabular-nums text-slate-400">{index}</td>
      <td className="px-3 py-2 tabular-nums">{row.h}</td>
      <td className="px-3 py-2 tabular-nums">{row.k}</td>
      <td className="px-3 py-2 tabular-nums">{row.l}</td>
      <td className="px-3 py-2 font-mono">({row.h} {row.k} {row.l})</td>
      <td className="px-3 py-2 tabular-nums">{Number(row.d_angstrom).toFixed(5)}</td>
      <td className="px-3 py-2 tabular-nums">{Number(row.d_nanometer).toFixed(6)}</td>
      <td className="px-3 py-2 tabular-nums">{Number(row.inverse_d2).toFixed(7)}</td>
      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${statusStyles[row.reflection_status] || 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{row.reflection_status}</span></td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = status === 'Validated' ? 'bg-emerald-50 text-emerald-700'
    : status === 'Pending Validation' ? 'bg-amber-50 text-amber-700'
    : status === 'Rejected' ? 'bg-red-50 text-red-700'
    : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>{status}</span>;
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-950 px-6 py-4 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Kembali"><ChevronLeft/></button>
          <div>
            <p className="text-xs text-slate-400">MATERIAL REFERENCE DATABASE / DETAIL</p>
            <h1 className="text-lg font-semibold">Material Detail</h1>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-300"><AlertTriangle size={14} className="text-amber-400"/> Hanya operator berwenang yang dapat memvalidasi material.</div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-6 py-7">{children}</main>
    </div>
  );
}
