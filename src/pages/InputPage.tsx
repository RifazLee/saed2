import { useState, useRef, useEffect } from 'react';
import { Upload, Settings2, ChevronRight, X, Atom, FileImage, Sliders } from 'lucide-react';
import type { AnalysisParams, BeamStopArm, MaterialId } from '@/lib/diffraction/types';
import { DEFAULT_HKL } from '@/lib/diffraction/types';
import { api, type ApiMaterial } from '@/lib/api';

export type InputEntry = { id: string; file: File; kv: number; cameraLengthM: number };

type Props = {
  onStart: (entries: InputEntry[], params: AnalysisParams) => void;
  onBackToMaterials?: () => void;
};

const COLORS = {
  bg: 'bg-slate-50',
  panel: 'bg-white',
  border: 'border-slate-200',
  accent: 'bg-slate-900 text-white',
  accentSoft: 'bg-slate-100 text-slate-900',
  muted: 'text-slate-500',
};

export default function InputPage({ onStart, onBackToMaterials }: Props) {
  const [entries, setEntries] = useState<InputEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [material, setMaterial] = useState<MaterialId>('custom');
  const [validatedMaterials, setValidatedMaterials] = useState<ApiMaterial[]>([]);
  const [selectedDbMaterial, setSelectedDbMaterial] = useState<ApiMaterial | null>(null);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState('');
  const [customA, setCustomA] = useState<string>('0.404');
  const [hkl, setHkl] = useState<string>(DEFAULT_HKL.join(' '));
  const [kv, setKv] = useState<string>('100');
  const [cameraLength, setCameraLength] = useState<string>('0.3');
  const [kSigma, setKSigma] = useState<string>('15');
  const [tolerance, setTolerance] = useState<string>('0.10');
  const [refine, setRefine] = useState(true);
  const [arm, setArm] = useState<BeamStopArm>('auto');
  const [cropBottom, setCropBottom] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList) {
    const next = Array.from(files).filter(f => /\.(tiff?|png|jpe?g|bmp|gif)$/i.test(f.name));
    setEntries(prev => [
      ...prev,
      ...next.map(f => ({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        kv: parseFloat(kv) || 100,
        cameraLengthM: parseFloat(cameraLength) || 0.3,
      })),
    ]);
  }

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function updateEntry(id: string, patch: Partial<InputEntry>) {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  }

  useEffect(() => {
    api<{success:boolean;data:ApiMaterial[]}>('/materials/validated')
      .then(result => {
        setValidatedMaterials(result.data);
        if (result.data.length) {
          setSelectedDbMaterial(result.data[0]);
          const keys = result.data[0].reflections?.map(r => `${r.h},${r.k},${r.l}`) || [];
          setHkl(keys.join(' '));
        }
      })
      .catch(err => setMaterialsError(err instanceof Error ? err.message : 'Gagal memuat material tervalidasi'))
      .finally(() => setMaterialsLoading(false));
  }, []);

  function handleMaterialChange(id: string) {
    const selected = validatedMaterials.find(m => m.id === id) || null;
    setSelectedDbMaterial(selected);
    setMaterial('custom');
    if (selected) setHkl((selected.reflections || []).map(r => `${r.h},${r.k},${r.l}`).join(' '));
  }

  function handleStart() {
    if (entries.length === 0) return;
    const params: AnalysisParams = {
      kv: parseFloat(kv) || 100,
      cameraLengthM: parseFloat(cameraLength) || 0.3,
      material,
      referenceDnm: selectedDbMaterial ? Object.fromEntries((selectedDbMaterial.reflections || []).map(r => [`${r.h},${r.k},${r.l}`, Number(r.d_nanometer)])) : undefined,
      customA_nm: material === 'custom' ? parseFloat(customA) || null : null,
      hklList: hkl.trim().split(/\s+/).filter(Boolean),
      cropBottom: cropBottom.trim() ? parseInt(cropBottom) : null,
      arm,
      kSigma: parseFloat(kSigma) || 15,
      tolerance: parseFloat(tolerance) || 0.10,
      refineCenter: refine,
      rMin: null,
      rMax: null,
    };
    onStart(entries, params);
  }

  return (
    <div className={`min-h-screen ${COLORS.bg}`}>
      <header className={`${COLORS.accent} px-6 py-5 shadow-sm`}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <img src="/image.png" alt="Logo Institut Teknologi Bandung" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shrink-0" />
          <Atom size={26} className="hidden sm:block text-slate-200" />
          <img src="/logo.png" alt="SAED" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shrink-0" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Analisis Pola Difraksi Elektron (SAED)</h1>
            <p className="text-slate-300 text-sm">Kalibrasi nm⁻¹/pixel dari citra polikristal standar</p>
            <p className="text-slate-400 text-xs mt-1">Rifaz Muhammad Sukma</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            {onBackToMaterials && <button onClick={onBackToMaterials} className="rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800">Material Database</button>}
            <span className="px-2.5 py-1 rounded-full bg-slate-700">Langkah 1 / 4 — Input</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drop zone */}
        <section className="lg:col-span-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); }}
            className={`${COLORS.panel} ${COLORS.border} border-2 border-dashed rounded-xl p-8 text-center transition ${dragOver ? 'border-slate-900 bg-slate-50' : ''}`}
          >
            <Upload size={32} className="mx-auto text-slate-400 mb-3" />
            <p className="text-slate-700 font-medium">Seret citra difraksi ke sini, atau</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 transition"
            >
              Pilih file
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".tif,.tiff,.png,.jpg,.jpeg,.bmp,.gif"
              className="hidden"
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <p className={`text-xs ${COLORS.muted} mt-3`}>Mendukung TIFF 16-bit, PNG, JPG</p>
          </div>

          {/* File list */}
          {entries.length > 0 && (
            <div className="mt-4 space-y-2">
              {entries.map((e, i) => (
                <div key={e.id} className={`${COLORS.panel} ${COLORS.border} border rounded-lg p-3 flex items-center gap-3`}>
                  <FileImage size={18} className="text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{e.file.name}</p>
                    <p className="text-xs text-slate-500">{(e.file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={e.kv}
                      onChange={(ev) => updateEntry(e.id, { kv: parseFloat(ev.target.value) || 0 })}
                      className="w-20 px-2 py-1 text-xs border border-slate-200 rounded"
                      title="Tegangan (kV)"
                    />
                    <span className="text-xs text-slate-400">kV</span>
                    <input
                      type="number"
                      step="0.1"
                      value={e.cameraLengthM}
                      onChange={(ev) => updateEntry(e.id, { cameraLengthM: parseFloat(ev.target.value) || 0 })}
                      className="w-20 px-2 py-1 text-xs border border-slate-200 rounded"
                      title="Camera length (m)"
                    />
                    <span className="text-xs text-slate-400">m</span>
                    <button onClick={() => removeEntry(e.id)} className="text-slate-400 hover:text-red-500">
                      <X size={16} />
                    </button>
                  </div>
                  <span className="text-xs text-slate-300 w-5 text-right">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Parameter panel */}
        <aside className={`${COLORS.panel} ${COLORS.border} border rounded-xl p-5 space-y-4 h-fit`}>
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-slate-700" />
            <h2 className="font-semibold text-slate-800">Parameter Analisis</h2>
          </div>

          <Field label="Material tervalidasi">
            <select
              value={selectedDbMaterial?.id || ''}
              onChange={(e) => handleMaterialChange(e.target.value)}
              disabled={materialsLoading || validatedMaterials.length === 0}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white disabled:bg-slate-100"
            >
              {materialsLoading && <option value="">Memuat material...</option>}
              {!materialsLoading && validatedMaterials.length === 0 && <option value="">Belum ada material tervalidasi</option>}
              {validatedMaterials.map(m => <option key={m.id} value={m.id}>{m.material_name} · {m.chemical_formula} · {m.phase} · {m.crystal_system} · {m.space_group_symbol}</option>)}
            </select>
            {materialsError && <span className="mt-1 block text-xs text-red-600">{materialsError}</span>}
            {!materialsError && !materialsLoading && validatedMaterials.length === 0 && <span className="mt-1 block text-xs text-amber-700">Validasi material pada Material Reference Database terlebih dahulu.</span>}
          </Field>

          <Field label="Daftar hkl">
            <input type="text" value={hkl} onChange={(e) => setHkl(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded font-mono" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tegangan (kV)">
              <input type="number" value={kv} onChange={(e) => setKv(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
            </Field>
            <Field label="Camera length (m)">
              <input type="number" step="0.1" value={cameraLength} onChange={(e) => setCameraLength(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
            </Field>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 flex items-center gap-1 hover:text-slate-900">
              <Settings2 size={14} /> Lanjutan
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="Ambang spot (k-sigma)">
                <input type="number" step="0.5" value={kSigma} onChange={(e) => setKSigma(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
              </Field>
              <Field label="Toleransi pencarian cincin">
                <input type="number" step="0.005" value={tolerance} onChange={(e) => setTolerance(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
              </Field>
              <Field label="Arah lengan beam-stop">
                <select value={arm} onChange={(e) => setArm(e.target.value as BeamStopArm)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white">
                  <option value="auto">auto</option>
                  <option value="right">right</option>
                  <option value="left">left</option>
                  <option value="up">up</option>
                  <option value="down">down</option>
                  <option value="none">none</option>
                </select>
              </Field>
              <Field label="Buang baris bawah (bar teks)">
                <input type="number" value={cropBottom} onChange={(e) => setCropBottom(e.target.value)} placeholder="auto"
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
              </Field>
              <label className="flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={refine} onChange={(e) => setRefine(e.target.checked)} />
                Penyempurnaan pusat (semua cincin)
              </label>
            </div>
          </details>

          <button
            onClick={handleStart}
            disabled={entries.length === 0 || !selectedDbMaterial || materialsLoading}
            className="w-full mt-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Mulai Analisis <ChevronRight size={18} />
          </button>
        </aside>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
