import { useMemo, useState } from 'react';
import { Download, FileText, Table2, Atom, RotateCcw, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { AnalysisResult } from '@/lib/diffraction/types';
import { renderOverlayCanvas, downloadPdf, downloadCsv, downloadAllPdf, downloadAllCsv } from '@/lib/diffraction/export';
import { renderOriginalCanvas, renderStandardRingsOverlay, renderMeasuredRingsOverlay } from '@/lib/diffraction/overlay';

type Props = {
  results: AnalysisResult[];
  errors: string[];
  onRestart: () => void;
};

export default function ResultsPage({ results, errors, onRestart }: Props) {
  const [active, setActive] = useState(0);
  const r = results[active];

  const imageUrls = useMemo(() => {
    if (!r) return { original: '', standard: '', measured: '', combined: '' };
    const original = renderOriginalCanvas(r, 800).toDataURL('image/png');
    const standard = renderStandardRingsOverlay(r, 800).toDataURL('image/png');
    const measured = renderMeasuredRingsOverlay(r, 800).toDataURL('image/png');
    const combined = renderOverlayCanvas(r, 800).toDataURL('image/png');
    return { original, standard, measured, combined };
  }, [r]);

  if (results.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-16 w-full">
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <AlertCircle size={28} className="mx-auto text-red-500 mb-3" />
            <h2 className="font-semibold text-slate-800 mb-1">Tidak ada hasil yang berhasil</h2>
            <p className="text-sm text-slate-500 mb-4">Semua citra gagal dianalisis. Periksa parameter dan coba lagi.</p>
            {errors.length > 0 && (
              <ul className="text-xs text-red-600 space-y-1 mb-4 text-left max-w-md mx-auto">
                {errors.map((e, i) => <li key={i} className="flex gap-2"><AlertCircle size={14} className="shrink-0 mt-0.5" />{e}</li>)}
              </ul>
            )}
            <button onClick={onRestart} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800">
              Kembali ke Input
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Errors banner */}
        {errors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium mb-1"><AlertCircle size={16} /> {errors.length} citra gagal:</div>
            <ul className="text-xs space-y-0.5 pl-6 list-disc">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        {/* Gallery thumbs */}
        <section>
          <h2 className="text-sm font-semibold text-slate-600 mb-2 uppercase tracking-wide">Galeri Citra</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {results.map((res, i) => {
              const canvas = renderOverlayCanvas(res, 180);
              const url = canvas.toDataURL('image/png');
              return (
                <button
                  key={res.id}
                  onClick={() => setActive(i)}
                  className={`shrink-0 w-44 rounded-lg overflow-hidden border-2 transition ${i === active ? 'border-slate-900' : 'border-slate-200 hover:border-slate-400'}`}
                >
                  <img src={url} alt={res.name} className="w-full h-28 object-cover bg-slate-100" />
                  <div className="p-2 text-left">
                    <p className="text-xs font-medium text-slate-800 truncate">{res.name}</p>
                    <p className="text-[11px] text-slate-500">K={res.K.toFixed(1)} · {res.nCincin} cincin</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Active result detail */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Original and overlay comparison */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">Perbandingan Citra</h3>
                <p className="text-xs text-slate-500 mt-1">Resolusi analisis dipertahankan; hanya info bar yang dipotong.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0}
                  className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setActive(a => Math.min(results.length - 1, a + 1))} disabled={active === results.length - 1}
                  className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-50 disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <figure className="min-w-0">
                <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-200">
                  <img src={imageUrls.original} alt="Citra asli tanpa overlay" className="block w-full h-auto" />
                </div>
                <figcaption className="mt-2 text-xs font-medium text-slate-600">Citra asli</figcaption>
              </figure>
              <figure className="min-w-0">
                <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-200">
                  <img src={imageUrls.standard} alt="Cincin standar material" className="block w-full h-auto" />
                </div>
                <figcaption className="mt-2 text-xs font-medium text-slate-600">
                  Cincin standar material <span className="text-slate-400">(garis putus-putus = R prediksi dari K/d)</span>
                </figcaption>
              </figure>
              <figure className="min-w-0">
                <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-200">
                  <img src={imageUrls.measured} alt="Cincin hasil deteksi" className="block w-full h-auto" />
                </div>
                <figcaption className="mt-2 text-xs font-medium text-slate-600">
                  Cincin hasil deteksi <span className="text-slate-400">(R terukur dari bintik/cincin)</span>
                </figcaption>
              </figure>
              <figure className="min-w-0">
                <div className="rounded-lg overflow-hidden bg-slate-900 border border-slate-200">
                  <img src={imageUrls.combined} alt="Gabungan standar dan deteksi" className="block w-full h-auto" />
                </div>
                <figcaption className="mt-2 text-xs font-medium text-slate-600">
                  Gabungan <span className="text-slate-400">(standar + deteksi + label hkl)</span>
                </figcaption>
              </figure>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Citra asli, cincin standar material (R prediksi = K/d), cincin hasil deteksi (R terukur), dan gabungan keduanya dengan label hkl.
            </p>
          </div>

          {/* Summary */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-slate-800">Ringkasan Kalibrasi</h3>
            <dl className="text-sm space-y-1.5">
              <Row k="Citra" v={r.name} />
              <Row k="Tegangan" v={`${r.kv} kV`} />
              <Row k="Camera length" v={`${r.cameraLengthM} m`} />
              <Row k="λ (relativistik)" v={`${r.lambda_nm.toFixed(6)} nm`} />
              <Row k="λL" v={`${(r.lambda_nm * r.cameraLengthM).toExponential(4)} nm.m`} />
              <Row k="Titik tengah" v={`(${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}) px`} />
              <Row k="K (fit)" v={`${r.K.toFixed(2)} nm.px`} />
              <Row k="g (resiprokal)" v={`${r.g.toFixed(6)} nm⁻¹/px`} />
              <Row k="Ukuran piksel" v={`${r.pix_um.toFixed(3)} µm/px`} />
              <Row k="Ukuran gambar asli" v={`${r.originalWidth} × ${r.originalHeight} px`} />
              <Row k="Cincin dipakai" v={`${r.nCincin}`} />
              <Row k="Sebaran K" v={`${r.sebaranPct.toFixed(2)} %`} />
            </dl>
          </div>
        </section>

        {/* Rings table */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Tabel Cincin — {r.name}</h3>
            <div className="flex gap-2">
              <button onClick={() => downloadPdf(r)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800">
                <FileText size={14} /> PDF
              </button>
              <button onClick={() => downloadCsv(r)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
                <Table2 size={14} /> CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">hkl</th>
                  <th className="px-4 py-2 text-right">d standar (nm)</th>
                  <th className="px-4 py-2 text-right">d prediksi (nm)</th>
                  <th className="px-4 py-2 text-right">selisih d (nm)</th>
                  <th className="px-4 py-2 text-right">selisih d %</th>
                  <th className="px-4 py-2 text-right">R prediksi</th>
                  <th className="px-4 py-2 text-right">R terukur</th>
                  <th className="px-4 py-2 text-right">selisih R %</th>
                  <th className="px-4 py-2 text-right">n spot</th>
                  <th className="px-4 py-2 text-right">K=R·d</th>
                  <th className="px-4 py-2 text-left">catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.rings.map(ring => (
                  <tr key={ring.hkl} className={ring.used ? '' : 'text-slate-400'}>
                    <td className="px-4 py-2 font-mono">{ring.hkl}</td>
                    <td className="px-4 py-2 text-right">{ring.d_nm.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right">{ring.found ? ring.d_pred_nm.toFixed(4) : '—'}</td>
                    <td className="px-4 py-2 text-right">{ring.found ? ring.d_selisih_nm.toFixed(4) : '—'}</td>
                    <td className="px-4 py-2 text-right">{ring.found ? ring.d_selisihPct.toFixed(2) : '—'}</td>
                    <td className="px-4 py-2 text-right">{ring.R_pred.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right">{ring.found ? ring.R_px.toFixed(1) : '—'}</td>
                    <td className="px-4 py-2 text-right">{ring.found ? ring.selisihPct.toFixed(2) : '—'}</td>
                    <td className="px-4 py-2 text-right">{ring.nSpot}</td>
                    <td className="px-4 py-2 text-right">{ring.found ? ring.K.toFixed(2) : '—'}</td>
                    <td className="px-4 py-2 text-xs">
                      {ring.used ? <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> dipakai</span> :
                        ring.found ? 'lemah' : 'tidak ada bintik'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* All-results summary */}
        {results.length > 1 && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Ringkasan Semua Citra</h3>
              <div className="flex gap-2">
                <button onClick={() => downloadAllPdf(results)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800">
                  <Download size={14} /> Semua PDF
                </button>
                <button onClick={() => downloadAllCsv(results)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
                  <Download size={14} /> Semua CSV
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Citra</th>
                    <th className="px-4 py-2 text-right">kV</th>
                    <th className="px-4 py-2 text-right">L (m)</th>
                    <th className="px-4 py-2 text-right">pusat x</th>
                    <th className="px-4 py-2 text-right">pusat y</th>
                    <th className="px-4 py-2 text-right">K (nm.px)</th>
                    <th className="px-4 py-2 text-right">nm⁻¹/px</th>
                    <th className="px-4 py-2 text-right">µm/px</th>
                    <th className="px-4 py-2 text-right">cincin</th>
                    <th className="px-4 py-2 text-right">sebaran %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map(res => (
                    <tr key={res.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setActive(results.indexOf(res))}>
                      <td className="px-4 py-2 font-medium text-slate-800">{res.name}</td>
                      <td className="px-4 py-2 text-right">{res.kv}</td>
                      <td className="px-4 py-2 text-right">{res.cameraLengthM}</td>
                      <td className="px-4 py-2 text-right">{res.cx.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{res.cy.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{res.K.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{res.g.toFixed(6)}</td>
                      <td className="px-4 py-2 text-right">{res.pix_um.toFixed(3)}</td>
                      <td className="px-4 py-2 text-right">{res.nCincin}</td>
                      <td className="px-4 py-2 text-right">{res.sebaranPct.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="flex justify-center pt-2">
          <button onClick={onRestart} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-white">
            <RotateCcw size={16} /> Analisis citra baru
          </button>
        </div>
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
          <h1 className="text-xl font-semibold tracking-tight">Hasil Analisis Difraksi</h1>
          <p className="text-slate-300 text-sm">Cincin, kalibrasi, dan unduhan PDF/CSV</p>
          <p className="text-slate-400 text-xs mt-1">Rifaz Muhammad Sukma</p>
        </div>
        <div className="ml-auto text-xs px-2.5 py-1 rounded-full bg-slate-700">Langkah 4 / 4 — Hasil</div>
      </div>
    </header>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-900 font-medium text-right">{v}</dd>
    </div>
  );
}
