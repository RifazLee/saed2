import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Atom } from 'lucide-react';
import type { DetectionResult } from '@/lib/diffraction/types';
import { detectRings } from '@/lib/diffraction/analyze';
import type { InputEntry } from './InputPage';
import type { AnalysisParams } from '@/lib/diffraction/types';

type Props = {
  entries: InputEntry[];
  params: AnalysisParams;
  onDone: (detections: DetectionResult[], errors: string[]) => void;
};

const STEPS = [
  'Membaca citra',
  'Deteksi beam-stop',
  'Deteksi bintik difraksi',
  'Mencari pusat & cincin pertama',
  'Deteksi semua cincin',
  'Menyusun hasil',
];

export default function ProcessingPage({ entries, params, onDone }: Props) {
  const [current, setCurrent] = useState(0);
  const [label, setLabel] = useState('Memulai');
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [detections, setDetections] = useState<DetectionResult[]>([]);

  const entriesRef = useRef(entries);
  const paramsRef = useRef(params);
  const onDoneRef = useRef(onDone);
  entriesRef.current = entries;
  paramsRef.current = params;
  onDoneRef.current = onDone;

  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const list = entriesRef.current;
      const allDetections: DetectionResult[] = [];
      const allErrors: string[] = [];
      for (let i = 0; i < list.length; i++) {
        if (!mountedRef.current) return;
        setIdx(i);
        try {
          const det = await detectRings(
            list[i].file,
            { ...paramsRef.current, kv: list[i].kv, cameraLengthM: list[i].cameraLengthM },
            (lbl, pct) => {
              setLabel(lbl);
              setCurrent(Math.min(STEPS.length - 1, Math.floor((pct / 100) * STEPS.length)));
            },
          );
          allDetections.push(det);
          setDetections((prev) => [...prev, det]);
        } catch (err) {
          console.error(err);
          const msg = err instanceof Error ? err.message : String(err);
          allErrors.push(`${list[i].file.name}: ${msg}`);
          setErrors((prev) => [...prev, `${list[i].file.name}: ${msg}`]);
        }
      }
      if (!mountedRef.current) return;
      setCurrent(STEPS.length);
      setLabel('Selesai');
      setTimeout(() => {
        if (mountedRef.current) onDoneRef.current(allDetections, allErrors);
      }, 400);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <img src="/image.png" alt="Logo Institut Teknologi Bandung" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shrink-0" />
          <Atom size={26} className="hidden sm:block text-slate-200" />
          <img src="/logo.png" alt="SAED" className="h-12 w-12 rounded-full bg-white object-contain p-0.5 shrink-0" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Deteksi Cincin Difraksi</h1>
            <p className="text-slate-300 text-sm">Memproses citra untuk mendeteksi cincin</p>
            <p className="text-slate-400 text-xs mt-1">Rifaz Muhammad Sukma</p>
          </div>
          <div className="ml-auto text-xs px-2.5 py-1 rounded-full bg-slate-700">Langkah 2 / 4 — Deteksi</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Loader2 className="animate-spin text-slate-700" size={24} />
            <div>
              <p className="font-semibold text-slate-800">{label}</p>
              <p className="text-sm text-slate-500">Citra {Math.min(idx + 1, entries.length)} dari {entries.length}</p>
            </div>
          </div>

          <ol className="space-y-2">
            {STEPS.map((s, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={s} className="flex items-center gap-3 text-sm">
                  {done ? <CheckCircle2 size={18} className="text-emerald-500" /> :
                    active ? <Loader2 size={18} className="animate-spin text-slate-700" /> :
                      <span className="w-[18px] h-[18px] rounded-full border border-slate-300 inline-block" />}
                  <span className={done ? 'text-slate-400 line-through' : active ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                    {s}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-900 transition-all duration-300"
              style={{ width: `${(current / STEPS.length) * 100}%` }} />
          </div>

          {(detections.length > 0 || errors.length > 0) && (
            <div className="mt-6 pt-4 border-t border-slate-100 space-y-1.5">
              {detections.map((d) => (
                <p key={d.id} className="text-xs text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 size={14} /> {d.name} — {d.rings.length} cincin terdeteksi
                </p>
              ))}
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} /> {e}
                </p>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
