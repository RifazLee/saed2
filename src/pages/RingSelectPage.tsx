import { useMemo, useState } from 'react';
import { Atom, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Target, ArrowRight, Loader2 } from 'lucide-react';
import type { AnalysisParams, AnalysisResult, DetectionResult } from '@/lib/diffraction/types';
import { renderOriginalCanvas, renderDetectionOverlay } from '@/lib/diffraction/overlay';
import { calibrateWithSelection } from '@/lib/diffraction/analyze';

type Props = {
  detections: DetectionResult[];
  params: AnalysisParams;
  errors: string[];
  onConfirm: (results: AnalysisResult[]) => void;
  onRestart: () => void;
};

export default function RingSelectPage({ detections, params, errors, onConfirm, onRestart }: Props) {
  const [active, setActive] = useState(0);
  const [choices, setChoices] = useState<(number | null)[]>(
    () => detections.map(() => null),
  );
  const [calibrating, setCalibrating] = useState(false);

  const r = detections[active];

  const imageUrls = useMemo(() => {
    if (!r) return { original: '', overlay: '' };
    const original = renderOriginalCanvas(r, 700).toDataURL('image/png');
    const overlay = renderDetectionOverlay(r, 700, choices[active] ?? undefined).toDataURL('image/png');
    return { original, overlay };
  }, [r, choices, active]);

  if (detections.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-16 w-full">
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <AlertCircle size={28} className="mx-auto text-red-500 mb-3" />
            <h2 className="font-semibold text-slate-800 mb-1">Tidak ada hasil deteksi</h2>
            <p className="text-sm text-slate-500 mb-4">Semua citra gagal dideteksi. Periksa parameter dan coba lagi.</p>
            <button onClick={onRestart} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800">
              Kembali ke Input
            </button>
          </div>
        </main>
      </div>
    );
  }

  const allChosen = choices.every((c) => c !== null);

  async function handleConfirm() {
    setCalibrating(true);
    try {
      const results: AnalysisResult[] = [];
      for (let i = 0; i < detections.length; i++) {
        const idx = choices[i];
        if (idx === null) continue;
        const res = await calibrateWithSelection(detections[i], idx, {
          ...params,
          kv: detections[i].kv,
          cameraLengthM: detections[i].cameraLengthM,
        });
        results.push(res);
      }
      onConfirm(results);
    } catch (err) {
      console.error(err);
      setCalibrating(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium mb-1"><AlertCircle size={16} /> {errors.length} citra gagal:</div>
            <ul className="text-xs space-y-0.5 pl-6 list-disc">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        <section>
          <h2 className="text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide">Galeri Citra</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {detections.map((det, i) => {
              const url = renderDetectionOverlay(det, 180, choices[i] ?? undefined).toDataURL('image/png');
              const chosen = choices[i] !== null;
              return (
                <button
                  key={det.id}
                  onClick={() => setActive(i)}
                  className={`shrink-0 w-44 rounded-lg overflow-hidden border-2 transition ${i === active ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
                >
                  <div className="relative">
                    <img src={url} alt={det.name} className="w-full h-28 object-cover bg-slate-100" />
                    {chosen && (
                      <span className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5">
                        <CheckCircle2 size={14} />
                      </span>
                    )}
                  </div>
                  <div className="p-2 text-left">
                    <p className="text-xs font-medium text-slate-800 truncate">{det.name}</p>
                    <p className="text-[11px] text-slate-500">{chosen ? `cincin ${choices[i]! + 1}` : 'belum dipilih'} · {det.rings.length} cincin</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">Pratinjau Cincin</h3>
                <p className="text-xs text-slate-500 mt-1">Pilih cincin utama di kanan; cincin terpilih akan disorot di kiri.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0}
                  className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setActive((a) => Math.min(detections.length - 1, a + 1))} disabled={active === detections.length - 1}
                  className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <figure className="min-w-0">
                <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-200">
                  <img src={imageUrls.original} alt="Citra asli" className="block w-full h-auto" />
                </div>
                <figcaption className="mt-2 text-xs font-medium text-slate-600">Citra asli</figcaption>
              </figure>
              <figure className="min-w-0">
                <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-200">
                  <img src={imageUrls.overlay} alt="Citra dengan overlay" className="block w-full h-auto" />
                </div>
                <figcaption className="mt-2 text-xs font-medium text-slate-600">
                  Overlay {choices[active] !== null ? `(cincin ${choices[active]! + 1} disorot)` : '(belum ada pilihan)'}
                </figcaption>
              </figure>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-slate-700" />
              <h3 className="font-semibold text-slate-800">Pilih Cincin Utama</h3>
            </div>
            <p className="text-xs text-slate-500">
              Citra: <span className="font-medium text-slate-700">{r.name}</span>
            </p>
            <p className="text-xs text-slate-500">
              Pilih satu cincin terdeteksi sebagai referensi utama untuk kalibrasi. Cincin terpilih akan disorot berwarna pada gambar.
            </p>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {r.rings.length === 0 && (
                <p className="text-sm text-red-600 py-4">Tidak ada cincin terdeteksi untuk citra ini.</p>
              )}
              {r.rings.map((ring) => {
                const selected = choices[active] === ring.index;
                return (
                  <label
                    key={ring.index}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      selected ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`ring-${active}`}
                      checked={selected}
                      onChange={() => setChoices((prev) => prev.map((c, idx) => (idx === active ? ring.index : c)))}
                      className="w-4 h-4 accent-slate-900 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-800">Cincin {ring.index + 1}</span>
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: `hsl(${ring.index * 47}, 80%, 62%)` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 grid grid-cols-2 gap-x-2">
                        <span>R = {ring.R_px.toFixed(1)} px</span>
                        <span>nSpot = {ring.nSpot}</span>
                      </div>
                    </div>
                    {selected && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between pt-2">
          <button onClick={onRestart} disabled={calibrating} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-white disabled:opacity-40">
            <ChevronLeft size={16} /> Kembali ke Input
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allChosen || calibrating}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {calibrating ? <><Loader2 size={16} className="animate-spin" /> Mengkalibrasi...</> : <>Lanjut ke Hasil <ArrowRight size={16} /></>}
          </button>
        </div>
        {!allChosen && !calibrating && (
          <p className="text-center text-xs text-amber-600">
            {choices.filter((c) => c === null).length} citra belum memiliki cincin utama terpilih.
          </p>
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-slate-900 text-white px-6 py-5 shadow-sm">
      <div className="max-w-6xl mx-auto flex items-center gap-3">
        <img src="/image.png" alt="Logo Institut Teknologi Bandung" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shrink-0" />
          <Atom size={26} className="hidden sm:block text-slate-200" />
          <img src="/logo.png" alt="SAED" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shrink-0" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pemilihan Cincin Utama</h1>
          <p className="text-slate-300 text-sm">Pilih cincin referensi untuk kalibrasi tiap citra</p>
          <p className="text-slate-400 text-xs mt-1">Rifaz Muhammad Sukma</p>
        </div>
        <div className="ml-auto text-xs px-2.5 py-1 rounded-full bg-slate-700">Langkah 3 / 4 — Pilih Cincin</div>
      </div>
    </header>
  );
}
