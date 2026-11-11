import {
  gaussianFilter,
  gaussianFilter1D,
  maxFilter9,
  madStd,
  percentile,
  percentilePos,
  median,
  distanceTransformEdt,
  label,
  componentSum,
} from './imaging';
import type { BeamStopArm, BeamStopInfo } from './types';

// Info-bar detection — port of deteksi_bar_info
export function detectInfoBar(img: Float64Array, w: number, h: number, maxFrac = 0.25, minConst = 0.5, margin = 3): number | null {
  const batas = Math.floor(h * maxFrac);
  let tepi = h, gap = 0;
  for (let y = h - 1; y > h - batas - 1; y--) {
    const counts = new Map<number, number>();
    let maxCount = 0;
    for (let x = 0; x < w; x++) {
      const k = Math.round(img[y * w + x] * 100);
      const c = (counts.get(k) ?? 0) + 1;
      counts.set(k, c);
      if (c > maxCount) maxCount = c;
    }
    if (maxCount / w >= minConst) {
      tepi = y; gap = 0;
    } else {
      gap += 1;
      if (gap > 3) break;
    }
  }
  if (tepi === h) return null;
  return Math.min(h - tepi + margin, batas);
}

/** Convert File to Float64 grayscale 2D (row-major), supporting TIF via UTIF and PNG/JPG via canvas. */
export async function fileToGrayscale(file: File): Promise<{ data: Float64Array; width: number; height: number }> {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  // TIFF magic: II*\0 (little-endian) atau MM\0* (big-endian)
  const isTiff =
    (u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a) ||
    (u8[0] === 0x4d && u8[1] === 0x4d && u8[3] === 0x2a);
  if (isTiff) {
    const UTIF: any = await import('utif');
    const ifds = UTIF.decode(u8);
    if (!ifds.length) throw new Error('File TIFF tidak berisi gambar.');
    const ifd = ifds[0];
    // decodeImage mengisi ifd.data dengan piksel mentah (tidak perlu decode ulang)
    UTIF.decodeImage(u8, ifd);
    const w: number = ifd.width, hh: number = ifd.height;
    const bps: number = ifd.t258?.[0] ?? 8;
    const spp: number = ifd.t277?.[0] ?? 1;
    const invert = ifd.t262?.[0] === 0; // WhiteIsZero
    const raw: Uint8Array | undefined = ifd.data;
    const out = new Float64Array(w * hh);

    if (raw && spp === 1 && bps === 16 && raw.byteLength >= w * hh * 2) {
      // DataView menghindari masalah alignment byteOffset
      const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      for (let i = 0; i < w * hh; i++) {
        const v = dv.getUint16(i * 2, true);
        out[i] = invert ? 65535 - v : v;
      }
    } else if (raw && spp === 1 && bps === 8 && raw.length >= w * hh) {
      for (let i = 0; i < w * hh; i++) {
        const v = raw[i] * 257; // skala ke rentang 16-bit
        out[i] = invert ? 65535 - v : v;
      }
    } else {
      // Fallback: pratinjau RGBA 8-bit -> luma
      const rgba: Uint8Array = UTIF.toRGBA8(ifd);
      for (let i = 0; i < w * hh; i++) {
        const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
        out[i] = (0.299 * r + 0.587 * g + 0.114 * b) * 257;
      }
    }
    return { data: out, width: w, height: hh };
  }
  // PNG/JPG via canvas
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(blobUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out = new Float64Array(d.length / 4);
    for (let i = 0; i < out.length; i++) {
      out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }
    return { data: out, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Gagal memuat gambar.'));
    img.src = src;
  });
}

/**
 * Margin topeng di sekeliling kepala beam-stop (px citra kerja).
 * Konstanta aslinya (30 px) dibuat untuk citra 2448 px; pada citra yang sudah di-downsample
 * margin itu harus ikut mengecil, kalau tidak cincin terang dekat beam-stop ikut tertutup.
 */
export function beamStopMargin(w: number, h: number): number {
  return 30 * Math.min(w, h) / 2448.0;
}

// beam-stop mask detection — port of topeng_beamstop
export function beamStopMask(img: Float64Array, w: number, h: number, arm: BeamStopArm): { mask: Uint8Array; info: BeamStopInfo } {
  const g = gaussianFilter(img, w, h, 6);
  const halo = gaussianFilter(img, w, h, 40);
  let cy = 0, cx = 0, haloMax = -Infinity;
  for (let i = 0; i < halo.length; i++) {
    if (halo[i] > haloMax) { haloMax = halo[i]; cy = Math.floor(i / w); cx = i % w; }
  }
  const mask = new Uint8Array(w * h);
  const rMax = 300 * Math.min(w, h) / 2448.0;
  const rMax2 = rMax * rMax;

  const insideVals: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((y - cy) ** 2 + (x - cx) ** 2 < rMax2) insideVals.push(g[y * w + x]);
    }
  }
  insideVals.sort((a, b) => a - b);
  const p95 = insideVals.length ? insideVals[Math.min(insideVals.length - 1, Math.floor(0.95 * insideVals.length))] : 0;
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const inside = (y - cy) ** 2 + (x - cx) ** 2 < rMax2;
      dark[i] = (inside && g[i] < 0.15 * p95) ? 1 : 0;
    }
  }
  const { labels, count } = label(dark, w, h);
  if (count === 0) return { mask, info: { headX: cx, headY: cy, headRadius: 0, arm: 'none' } };
  const sizes = componentSum(dark, labels, count);
  let biggestLabel = 1;
  for (let l = 2; l <= count; l++) if (sizes[l] > sizes[biggestLabel]) biggestLabel = l;
  const comp = new Uint8Array(w * h);
  for (let i = 0; i < comp.length; i++) comp[i] = labels[i] === biggestLabel ? 1 : 0;
  const dt = distanceTransformEdt(comp, w, h);
  let hy = 0, hx = 0, rHead = 0;
  for (let i = 0; i < dt.length; i++) {
    if (dt[i] > rHead) { rHead = dt[i]; hy = Math.floor(i / w); hx = i % w; }
  }
  const rDisk2 = (rHead + beamStopMargin(w, h)) ** 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((y - hy) ** 2 + (x - hx) ** 2 < rDisk2) mask[y * w + x] = 1;
    }
  }
  const lw = 0.6 * rHead + 25 * Math.min(w, h) / 2448.0;
  let detectedArm: BeamStopArm = arm;
  if (arm === 'auto') {
    const dirs: Record<string, [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
    const vals: Record<string, number> = {};
    for (const [nm, [dx, dy]] of Object.entries(dirs)) {
      const v: number[] = [];
      for (let t = 1.8; t <= 3.0 + 1e-9; t += 0.3) {
        const x = Math.floor(hx + dx * t * rHead), y = Math.floor(hy + dy * t * rHead);
        if (x >= 0 && x < w && y >= 0 && y < h) v.push(g[y * w + x]);
      }
      vals[nm] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : Infinity;
    }
    let lowest = 'right', lv = Infinity;
    for (const k of Object.keys(vals)) if (vals[k] < lv) { lv = vals[k]; lowest = k; }
    const others = Object.entries(vals).filter(([k]) => k !== lowest).map(([, v]) => v).sort((a, b) => a - b);
    const otherMed = others[others.length >> 1] || 1;
    detectedArm = lv < 0.35 * otherMed ? (lowest as BeamStopArm) : 'none';
  }
  if (detectedArm !== 'none') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (detectedArm === 'right' && x >= hx && Math.abs(y - hy) < lw) mask[i] = 1;
        else if (detectedArm === 'left' && x <= hx && Math.abs(y - hy) < lw) mask[i] = 1;
        else if (detectedArm === 'up' && y <= hy && Math.abs(x - hx) < lw) mask[i] = 1;
        else if (detectedArm === 'down' && y >= hy && Math.abs(x - hx) < lw) mask[i] = 1;
      }
    }
  }
  return { mask, info: { headX: hx, headY: hy, headRadius: rHead, arm: detectedArm } };
}

// Spot detection — port of deteksi_spot
export function detectSpots(img: Float64Array, w: number, h: number, mask: Uint8Array, kSigma = 15.0, maxSpot = 3000): { spots: Float64Array; weights: Float64Array } {
  const hp = new Float64Array(w * h);
  const g1 = gaussianFilter(img, w, h, 1.5);
  const g2 = gaussianFilter(img, w, h, 12);
  for (let i = 0; i < hp.length; i++) hp[i] = g1[i] - g2[i];
  const valid = new Uint8Array(w * h);
  for (let i = 0; i < valid.length; i++) valid[i] = mask[i] ? 0 : 1;
  const b = 8;
  for (let y = 0; y < Math.min(b, h); y++) {
    for (let x = 0; x < w; x++) { valid[y * w + x] = 0; valid[(h - 1 - y) * w + x] = 0; }
  }
  for (let x = 0; x < Math.min(b, w); x++) {
    for (let y = 0; y < h; y++) { valid[y * w + x] = 0; valid[y * w + (w - 1 - x)] = 0; }
  }
  const sd = madStd(hp, valid);
  if (!(sd > 0)) return { spots: new Float64Array(0), weights: new Float64Array(0) }; // hindari threshold 0 / NaN
  const mx = maxFilter9(hp, w, h);
  const thr = kSigma * sd;
  const xs: number[] = [], ys: number[] = [], ws: number[] = [];
  for (let i = 0; i < hp.length; i++) {
    if (valid[i] && hp[i] === mx[i] && hp[i] > thr) {
      xs.push(i % w); ys.push((i / w) | 0); ws.push(hp[i]);
    }
  }
  let order = ws.map((_, i) => i);
  if (xs.length > maxSpot) {
    order = order.sort((a, b2) => ws[b2] - ws[a]).slice(0, maxSpot);
  }
  const spots = new Float64Array(order.length * 2);
  const weights = new Float64Array(order.length);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    spots[k * 2] = xs[i]; spots[k * 2 + 1] = ys[i]; weights[k] = ws[i];
  }
  return { spots, weights };
}

/**
 * Detect bright ring pixels directly from the high-pass filtered image.
 * Unlike detectSpots (which finds local maxima), this collects ALL pixels
 * above threshold — essential for continuous rings where there are no
 * discrete spot maxima. Pixels are sampled on a stride to keep the count
 * manageable. Returns points in the same Float64Array [x0,y0,x1,y1,...] format.
 */
export function detectRingPoints(
  img: Float64Array,
  w: number,
  h: number,
  mask: Uint8Array,
  kSigma = 15.0,
  maxPoints = 4000,
): { spots: Float64Array; weights: Float64Array } {
  const g1 = gaussianFilter(img, w, h, 1.5);
  const g2 = gaussianFilter(img, w, h, 12);
  const hp = new Float64Array(w * h);
  for (let i = 0; i < hp.length; i++) hp[i] = g1[i] - g2[i];

  const valid = new Uint8Array(w * h);
  for (let i = 0; i < valid.length; i++) valid[i] = mask[i] ? 0 : 1;
  const b = 8;
  for (let y = 0; y < Math.min(b, h); y++) {
    for (let x = 0; x < w; x++) { valid[y * w + x] = 0; valid[(h - 1 - y) * w + x] = 0; }
  }
  for (let x = 0; x < Math.min(b, w); x++) {
    for (let y = 0; y < h; y++) { valid[y * w + x] = 0; valid[y * w + (w - 1 - x)] = 0; }
  }

  const sd = madStd(hp, valid);
  if (!(sd > 0)) return { spots: new Float64Array(0), weights: new Float64Array(0) };
  const thr = kSigma * sd;

  // Adaptive stride: sample enough pixels to represent rings but cap total count
  const totalValid = valid.reduce((s, v) => s + v, 0);
  const stride = Math.max(1, Math.round(Math.sqrt(totalValid / maxPoints)));

  const xs: number[] = [], ys: number[] = [], ws: number[] = [];
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      const i = y * w + x;
      if (valid[i] && hp[i] > thr) {
        xs.push(x); ys.push(y); ws.push(hp[i]);
      }
    }
  }

  const spots = new Float64Array(xs.length * 2);
  const weights = new Float64Array(xs.length);
  for (let k = 0; k < xs.length; k++) {
    spots[k * 2] = xs[k];
    spots[k * 2 + 1] = ys[k];
    weights[k] = ws[k];
  }
  return { spots, weights };
}

/** Merge two spot arrays into one, deduplicating nearby points. */
export function mergeSpots(
  spotsA: Float64Array,
  spotsB: Float64Array,
  dedupRadius = 3.0,
): Float64Array {
  const na = spotsA.length >> 1;
  const nb = spotsB.length >> 1;
  if (na === 0) return spotsB;
  if (nb === 0) return spotsA;
  const r2 = dedupRadius * dedupRadius;
  const merged: number[] = [];
  for (let i = 0; i < na; i++) {
    merged.push(spotsA[i * 2], spotsA[i * 2 + 1]);
  }
  for (let j = 0; j < nb; j++) {
    const bx = spotsB[j * 2], by = spotsB[j * 2 + 1];
    let dup = false;
    for (let i = 0; i < na; i++) {
      const dx = spotsA[i * 2] - bx, dy = spotsA[i * 2 + 1] - by;
      if (dx * dx + dy * dy < r2) { dup = true; break; }
    }
    if (!dup) merged.push(bx, by);
  }
  return Float64Array.from(merged);
}

function numBins(rMin: number, rMax: number, binW: number): number {
  return Math.max(1, Math.ceil((rMax - rMin) / binW));
}

// Scoring center — port of skor_pusat / cari_pusat_kasar
function scoreCenter(spots: Float64Array, cx: number, cy: number, rMin: number, rMax: number, binW = 3.0): number {
  const nb = numBins(rMin, rMax, binW);
  const hist = new Float64Array(nb);
  const n = spots.length >> 1;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(spots[i * 2] - cx, spots[i * 2 + 1] - cy);
    if (r > rMin && r < rMax) {
      const bi = Math.floor((r - rMin) / binW);
      if (bi >= 0 && bi < nb) hist[bi]++;
    }
  }
  let s = 0;
  for (let i = 0; i < nb; i++) s += hist[i] * hist[i];
  return s;
}

export function findCoarseCenter(spots: Float64Array, c0: [number, number], rMin: number, rMax: number): [number, number] {
  let best = -1, bc: [number, number] = [c0[0], c0[1]];
  const passes: [number, number][] = [[350, 12], [14, 2], [2.5, 0.5]];
  for (const [rng, step] of passes) {
    const [cx0, cy0] = bc;
    const steps = Math.round((2 * rng) / step); // loop integer: tidak ada drift floating point
    for (let i = 0; i <= steps; i++) {
      const cx = cx0 - rng + i * step;
      for (let j = 0; j <= steps; j++) {
        const cy = cy0 - rng + j * step;
        const s = scoreCenter(spots, cx, cy, rMin, rMax);
        if (s > best) { best = s; bc = [cx, cy]; }
      }
    }
  }
  return bc;
}

// Radial histogram — port of histogram_radial
export function radialHistogram(spots: Float64Array, cx: number, cy: number, rMin: number, rMax: number, binW = 2.0, sigma = 1.2): { ctr: Float64Array; dens: Float64Array } {
  const nb = numBins(rMin, rMax, binW);
  const h = new Float64Array(nb);
  const n = spots.length >> 1;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(spots[i * 2] - cx, spots[i * 2 + 1] - cy);
    const bi = Math.floor((r - rMin) / binW);
    if (bi >= 0 && bi < nb) h[bi]++;
  }
  const ctr = new Float64Array(nb);
  const dens = new Float64Array(nb);
  for (let i = 0; i < nb; i++) {
    ctr[i] = rMin + (i + 0.5) * binW;
    dens[i] = ctr[i] > 0 ? h[i] / (2 * Math.PI * ctr[i]) : 0;
  }
  return { ctr, dens: gaussianFilter1D(dens, sigma) };
}

// Find first ring — port of cari_cincin_pertama
export function findFirstRing(spots: Float64Array, cx: number, cy: number, rMin: number, rMax: number): { R1: number; ctr: Float64Array; dens: Float64Array } {
  const { ctr, dens } = radialHistogram(spots, cx, cy, rMin, rMax);
  const n = dens.length;
  let dmax = 0;
  for (let i = 0; i < n; i++) if (dens[i] > dmax) dmax = dens[i];
  const pos = dens.filter(v => v > 0);
  const base = pos.length ? median(Float64Array.from(pos)) : 0;
  const heights = Math.max(3 * base, 0.15 * dmax);
  const prom = 0.08 * dmax;

  // minimum prefix/suffix agar prominence O(n), bukan O(n^2)
  const preMin = new Float64Array(n), sufMin = new Float64Array(n);
  for (let i = 0; i < n; i++) preMin[i] = i === 0 ? dens[0] : Math.min(preMin[i - 1], dens[i]);
  for (let i = n - 1; i >= 0; i--) sufMin[i] = i === n - 1 ? dens[i] : Math.min(sufMin[i + 1], dens[i]);

  for (let i = 1; i < n - 1; i++) {
    if (dens[i] > heights && dens[i] >= dens[i - 1] && dens[i] > dens[i + 1]) {
      const prominence = dens[i] - Math.max(preMin[i], sufMin[i]);
      if (prominence > prom) return { R1: ctr[i], ctr, dens };
    }
  }
  throw new Error('Ring not detected; lower k-sigma or check image.');
}

/**
 * Detect ALL rings as peaks in the radial histogram, then fit each independently
 * using fitFirstRing. Returns rings sorted by radius (smallest first).
 * No hkl/d-standards involved — pure geometry from the spot pattern.
 */
export function findAllRings(
  spots: Float64Array,
  cx: number,
  cy: number,
  rMin: number,
  rMax: number,
): { rings: Array<{ R_px: number; nSpot: number; cx: number; cy: number }>; ctr: Float64Array; dens: Float64Array } {
  const { ctr, dens } = radialHistogram(spots, cx, cy, rMin, rMax);
  const n = dens.length;
  let dmax = 0;
  for (let i = 0; i < n; i++) if (dens[i] > dmax) dmax = dens[i];
  const pos = dens.filter((v) => v > 0);
  const base = pos.length ? median(Float64Array.from(pos)) : 0;
  const heightThr = Math.max(3 * base, 0.10 * dmax);
  const promThr = 0.06 * dmax;

  const preMin = new Float64Array(n), sufMin = new Float64Array(n);
  for (let i = 0; i < n; i++) preMin[i] = i === 0 ? dens[0] : Math.min(preMin[i - 1], dens[i]);
  for (let i = n - 1; i >= 0; i--) sufMin[i] = i === n - 1 ? dens[i] : Math.min(sufMin[i + 1], dens[i]);

  const peakRadii: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (dens[i] > heightThr && dens[i] >= dens[i - 1] && dens[i] > dens[i + 1]) {
      const prominence = dens[i] - Math.max(preMin[i], sufMin[i]);
      if (prominence > promThr) peakRadii.push(ctr[i]);
    }
  }

  const rings: Array<{ R_px: number; nSpot: number; cx: number; cy: number }> = [];
  for (const R0 of peakRadii) {
    try {
      const fit = fitFirstRing(spots, cx, cy, R0);
      if (!Number.isFinite(fit.R) || fit.R <= 0) continue;
      let nSpot = 0;
      for (let i = 0; i < fit.sel.length; i++) nSpot += fit.sel[i];
      if (nSpot < 1) continue;
      rings.push({ R_px: fit.R, nSpot, cx: fit.center[0], cy: fit.center[1] });
    } catch {
      // ring fit failed — skip
    }
  }

  rings.sort((a, b) => a.R_px - b.R_px);
  return { rings, ctr, dens };
}

// Circle fit (Kasa) — port of fit_lingkaran
// Koordinat dipusatkan dulu agar persamaan normal tidak ill-conditioned.
export function fitCircle(pts: Float64Array): { cx: number; cy: number; R: number } {
  const n = pts.length >> 1;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += pts[i * 2]; my += pts[i * 2 + 1]; }
  mx /= n || 1; my /= n || 1;
  const A = new Float64Array(n * 3);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2] - mx, y = pts[i * 2 + 1] - my;
    A[i * 3] = 2 * x; A[i * 3 + 1] = 2 * y; A[i * 3 + 2] = 1;
    b[i] = x * x + y * y;
  }
  const sol = lstsq3(A, b, n);
  const cxc = sol[0], cyc = sol[1];
  const R = Math.sqrt(Math.max(0, sol[2] + cxc * cxc + cyc * cyc));
  return { cx: cxc + mx, cy: cyc + my, R };
}

function lstsq3(A: Float64Array, b: Float64Array, n: number): Float64Array {
  const AtA = new Float64Array(9), Atb = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < 3; r++) {
      Atb[r] += A[i * 3 + r] * b[i];
      for (let c = 0; c < 3; c++) AtA[r * 3 + c] += A[i * 3 + r] * A[i * 3 + c];
    }
  }
  return solve3x3(AtA, Atb);
}

function solve3x3(A: Float64Array, b: Float64Array): Float64Array {
  const det = A[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * A[7] - A[4] * A[6]);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return new Float64Array([0, 0, 0]);
  const inv = 1 / det;
  const x = (b[0] * (A[4] * A[8] - A[5] * A[7]) - A[1] * (b[1] * A[8] - A[5] * b[2]) + A[2] * (b[1] * A[7] - A[4] * b[2])) * inv;
  const y = (A[0] * (b[1] * A[8] - A[5] * b[2]) - b[0] * (A[3] * A[8] - A[5] * A[6]) + A[2] * (A[3] * b[2] - b[1] * A[6])) * inv;
  const z = (A[0] * (A[4] * b[2] - b[1] * A[7]) - A[1] * (A[3] * b[2] - b[1] * A[6]) + b[0] * (A[3] * A[7] - A[4] * A[6])) * inv;
  return new Float64Array([x, y, z]);
}

// Fit first ring with iterative outlier rejection — port of fit_cincin_pertama
export function fitFirstRing(spots: Float64Array, cx0: number, cy0: number, rInitial: number, iter = 8): { center: [number, number]; R: number; sel: Uint8Array } {
  let cx = cx0, cy = cy0, R = rInitial, lebar = 0.06;
  const n = spots.length >> 1;
  for (let it = 0; it < iter; it++) {
    const idxs: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(spots[i * 2] - cx, spots[i * 2 + 1] - cy);
      if (Math.abs(r - R) < lebar * R) idxs.push(i);
    }
    if (idxs.length < 8) break;
    const sub = new Float64Array(idxs.length * 2);
    for (let i = 0; i < idxs.length; i++) {
      sub[i * 2] = spots[idxs[i] * 2]; sub[i * 2 + 1] = spots[idxs[i] * 2 + 1];
    }
    const fit = fitCircle(sub);
    if (!Number.isFinite(fit.R) || fit.R <= 0) break;
    cx = fit.cx; cy = fit.cy; R = fit.R;
    const res: number[] = [];
    for (let i = 0; i < idxs.length; i++) {
      const r = Math.hypot(spots[idxs[i] * 2] - cx, spots[idxs[i] * 2 + 1] - cy);
      res.push(Math.abs(r - R));
    }
    const sd = stdDev(res);
    lebar = Math.max(0.012, Math.min(lebar, 3.0 * sd / R));
  }
  const sel = new Uint8Array(n);
  const wFinal = Math.max(lebar, 0.012);
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(spots[i * 2] - cx, spots[i * 2 + 1] - cy);
    sel[i] = Math.abs(r - R) < wFinal * R ? 1 : 0;
  }
  return { center: [cx, cy], R, sel };
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// =====================================================================
//  Deteksi cincin KONTINU (rim) — berbasis profil radial azimut
//  Untuk cincin yang titiknya sudah sangat rapat sehingga membentuk
//  pita terang kontinu (tidak ada maksimum lokal / bintik terpisah).
// =====================================================================

export type RingInfo = {
  R_px: number;
  nSpot: number; // rim: jumlah titik ridge inlier
  cx: number;
  cy: number;
  kind: 'spot' | 'rim';
  coverage?: number; // rim: fraksi sektor sudut yang terpakai
  points?: Float64Array; // rim: titik ridge inlier [x0,y0,x1,y1,...] (untuk penempatan hkl)
};

export type RimOptions = {
  binW?: number;
  bgSigmaPx?: number; // lebar penghalus baseline (px citra kerja); harus > lebar cincin
  kRim?: number; // ambang puncak = kRim * noise
  relMin?: number; // ambang relatif terhadap puncak terkuat
  useLog?: boolean;
  minRadius?: number; // cincin rim dengan R di bawah ini diabaikan (halo beam); px citra kerja
};

function validFromMask(mask: Uint8Array, w: number, h: number, border = 8): Uint8Array {
  const valid = new Uint8Array(w * h);
  for (let i = 0; i < valid.length; i++) valid[i] = mask[i] ? 0 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < border || y < border || x >= w - border || y >= h - border) valid[y * w + x] = 0;
    }
  }
  return valid;
}

function robustStd(a: ArrayLike<number>): number {
  const f = Float64Array.from(a as ArrayLike<number>);
  if (f.length === 0) return 0;
  const m = median(Float64Array.from(f));
  const d = new Float64Array(f.length);
  for (let i = 0; i < f.length; i++) d[i] = Math.abs(f[i] - m);
  return 1.4826 * median(d);
}

/** Isi NaN dengan interpolasi linear (in-place). */
function fillNaN(a: Float64Array): void {
  const n = a.length;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(a[i])) continue;
    if (last === -1) {
      for (let j = 0; j < i; j++) a[j] = a[i];
    } else if (i - last > 1) {
      for (let j = last + 1; j < i; j++) a[j] = a[last] + ((a[i] - a[last]) * (j - last)) / (i - last);
    }
    last = i;
  }
  if (last === -1) a.fill(0);
  else for (let j = last + 1; j < n; j++) a[j] = a[last];
}

/** Rata-rata intensitas per bin radius, hanya piksel valid. Bin dengan cakupan sedikit -> NaN. */
function azimuthalProfile(
  img: Float64Array, w: number, h: number, valid: Uint8Array,
  cx: number, cy: number, rMin: number, rMax: number, binW: number,
): { ctr: Float64Array; mean: Float64Array } {
  const nb = numBins(rMin, rMax, binW);
  const sum = new Float64Array(nb), cnt = new Float64Array(nb);
  const x0 = Math.max(0, Math.floor(cx - rMax)), x1 = Math.min(w - 1, Math.ceil(cx + rMax));
  const y0 = Math.max(0, Math.floor(cy - rMax)), y1 = Math.min(h - 1, Math.ceil(cy + rMax));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!valid[i]) continue;
      const r = Math.hypot(x - cx, y - cy);
      if (r < rMin || r >= rMax) continue;
      const bi = Math.floor((r - rMin) / binW);
      if (bi >= 0 && bi < nb) { sum[bi] += img[i]; cnt[bi]++; }
    }
  }
  const ctr = new Float64Array(nb), mean = new Float64Array(nb);
  for (let i = 0; i < nb; i++) {
    ctr[i] = rMin + (i + 0.5) * binW;
    const expected = 2 * Math.PI * ctr[i] * binW;
    mean[i] = cnt[i] >= Math.max(5, 0.08 * expected) ? sum[i] / cnt[i] : NaN;
  }
  return { ctr, mean };
}

/** Baseline = envelope bawah yang halus (clipping iteratif); sigma dalam satuan bin. */
function clippedBaseline(y: Float64Array, sigmaBins: number, iters = 15): Float64Array {
  const base = Float64Array.from(y);
  for (let it = 0; it < iters; it++) {
    const sm = gaussianFilter1D(base, sigmaBins);
    for (let i = 0; i < base.length; i++) base[i] = Math.min(base[i], sm[i]);
  }
  return base;
}

/**
 * Cari punggung (ridge) cincin per sektor sudut di sekitar R0 ± winHalf,
 * lalu fit lingkaran robust. Return null bila cakupan terlalu sedikit.
 */
function fitRimRing(
  img: Float64Array, w: number, h: number, valid: Uint8Array,
  cx: number, cy: number, R0: number, winHalf: number,
  nSector = 90, binW = 0.5,
): { cx: number; cy: number; R: number; nPts: number; coverage: number; points: Float64Array } | null {
  const nb = Math.max(8, Math.ceil((2 * winHalf) / binW));
  const rLo = R0 - winHalf, rHi = R0 + winHalf;
  const sum = new Float64Array(nSector * nb), cnt = new Float64Array(nSector * nb);
  const x0 = Math.max(0, Math.floor(cx - rHi)), x1 = Math.min(w - 1, Math.ceil(cx + rHi));
  const y0 = Math.max(0, Math.floor(cy - rHi)), y1 = Math.min(h - 1, Math.ceil(cy + rHi));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      if (!valid[i]) continue;
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r < rLo || r >= rHi) continue;
      const bi = Math.floor((r - rLo) / binW);
      if (bi < 0 || bi >= nb) continue;
      let s = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * nSector);
      if (s >= nSector) s = nSector - 1;
      sum[s * nb + bi] += img[i];
      cnt[s * nb + bi] += 1;
    }
  }

  const pts: number[] = [];
  for (let s = 0; s < nSector; s++) {
    const prof = new Float64Array(nb);
    let good = 0;
    for (let b = 0; b < nb; b++) {
      const c = cnt[s * nb + b];
      if (c > 0) { prof[b] = sum[s * nb + b] / c; good++; } else prof[b] = NaN;
    }
    if (good < 0.7 * nb) continue; // sektor tertutup beam-stop / di luar citra
    fillNaN(prof);
    const sm = gaussianFilter1D(prof, 3); // ~1.5 px
    // buang kemiringan latar secara linear
    const e = 3;
    let a0 = 0, a1 = 0;
    for (let k = 0; k < e; k++) { a0 += sm[k]; a1 += sm[nb - 1 - k]; }
    a0 /= e; a1 /= e;
    const sub = new Float64Array(nb);
    for (let b = 0; b < nb; b++) sub[b] = sm[b] - (a0 + (a1 - a0) * (b / (nb - 1)));
    let kmax = -1, vmax = -Infinity;
    for (let b = 2; b < nb - 2; b++) if (sub[b] > vmax) { vmax = sub[b]; kmax = b; }
    if (kmax < 0) continue;
    const noise = robustStd(sub);
    if (!(vmax > 3 * noise) || vmax <= 0) continue;
    const y0v = sub[kmax - 1], y1v = sub[kmax], y2v = sub[kmax + 1];
    const den = y0v - 2 * y1v + y2v;
    const off = den !== 0 ? Math.max(-1, Math.min(1, (0.5 * (y0v - y2v)) / den)) : 0;
    const r = rLo + (kmax + 0.5 + off) * binW;
    const ang = -Math.PI + ((s + 0.5) * 2 * Math.PI) / nSector;
    pts.push(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
  }

  const used = pts.length >> 1;
  if (used < Math.max(10, 0.12 * nSector)) return null;
  const coverage = used / nSector;

  // fit lingkaran robust (buang outlier iteratif)
  let P = Float64Array.from(pts);
  let fit = { cx, cy, R: R0 };
  for (let it = 0; it < 5; it++) {
    const f = fitCircle(P);
    if (!Number.isFinite(f.R) || f.R <= 0) break;
    fit = f;
    const n = P.length >> 1;
    const res = new Float64Array(n);
    for (let i = 0; i < n; i++) res[i] = Math.abs(Math.hypot(P[i * 2] - fit.cx, P[i * 2 + 1] - fit.cy) - fit.R);
    const thr = Math.max(1.5, 2.5 * 1.4826 * median(Float64Array.from(res)));
    const keep: number[] = [];
    for (let i = 0; i < n; i++) if (res[i] <= thr) keep.push(P[i * 2], P[i * 2 + 1]);
    if (keep.length >> 1 < 10 || keep.length === P.length) break;
    P = Float64Array.from(keep);
  }

  // busur parsial / pusat melenceng jauh -> kunci pusat, fit R saja
  const shift = Math.hypot(fit.cx - cx, fit.cy - cy);
  if (coverage < 0.6 || shift > 0.05 * R0) {
    const n = P.length >> 1;
    const rr = new Float64Array(n);
    for (let i = 0; i < n; i++) rr[i] = Math.hypot(P[i * 2] - cx, P[i * 2 + 1] - cy);
    fit = { cx, cy, R: median(rr) };
  }
  if (!Number.isFinite(fit.R) || fit.R <= 0) return null;
  return { cx: fit.cx, cy: fit.cy, R: fit.R, nPts: P.length >> 1, coverage, points: P };
}

/**
 * Deteksi cincin kontinu (rim) sebagai puncak pada profil radial azimut.
 * Tidak butuh bintik spot, jadi cincin tebal/terang ikut terdeteksi.
 */
export function findRimRings(
  img: Float64Array, w: number, h: number, mask: Uint8Array,
  cx: number, cy: number, rMin: number, rMax: number,
  opts: RimOptions = {},
): { rings: RingInfo[]; ctr: Float64Array; profile: Float64Array; baseline: Float64Array } {
  const { binW = 1, bgSigmaPx = 30, kRim = 6, relMin = 0.03, useLog = true, minRadius = 0 } = opts;
  const valid = validFromMask(mask, w, h);
  const { ctr, mean } = azimuthalProfile(img, w, h, valid, cx, cy, rMin, rMax, binW);
  const n = mean.length;
  const prof = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    prof[i] = Number.isNaN(mean[i]) ? NaN : useLog ? Math.log(Math.max(mean[i], 1)) : mean[i];
  }
  fillNaN(prof);
  const baseline = clippedBaseline(prof, bgSigmaPx / binW);
  const sig = new Float64Array(n);
  for (let i = 0; i < n; i++) sig[i] = prof[i] - baseline[i];
  const sm = gaussianFilter1D(sig, 1.5 / binW);
  const noise = Math.max(robustStd(sm), 1e-9);
  let smax = 0;
  for (let i = 0; i < n; i++) if (sm[i] > smax) smax = sm[i];

  const preMin = new Float64Array(n), sufMin = new Float64Array(n);
  for (let i = 0; i < n; i++) preMin[i] = i === 0 ? sm[0] : Math.min(preMin[i - 1], sm[i]);
  for (let i = n - 1; i >= 0; i--) sufMin[i] = i === n - 1 ? sm[i] : Math.min(sufMin[i + 1], sm[i]);

  const found: RingInfo[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(sm[i] >= sm[i - 1] && sm[i] > sm[i + 1])) continue;
    if (sm[i] < kRim * noise || sm[i] < relMin * smax) continue;
    const prominence = sm[i] - Math.max(preMin[i], sufMin[i]);
    if (prominence < Math.max(3 * noise, 0.02 * smax)) continue;

    // lebar setengah-maksimum -> jendela pencarian ridge
    const half = sm[i] * 0.5;
    let l = i, r = i;
    while (l > 0 && sm[l] > half) l--;
    while (r < n - 1 && sm[r] > half) r++;
    // Sisi luar harus turun ke setengah tinggi. Sisi dalam boleh terpotong topeng beam-stop,
    // tetapi puncaknya harus benar-benar naik dari tepi (bukan halo yang meluruh monoton).
    if (sm[r] > half) continue;
    const innerOpen = sm[l] > half;
    if (innerOpen && (i < 3 || sm[0] > 0.7 * sm[i])) continue;
    const fwhm = (r - l) * binW;
    const R0 = ctr[i];
    if (R0 < minRadius) continue;
    const winHalf = Math.max(6, Math.min(2 * fwhm, 0.2 * R0));

    const fit = fitRimRing(img, w, h, valid, cx, cy, R0, winHalf);
    if (!fit) continue;
    found.push({
      R_px: fit.R, nSpot: fit.nPts, cx: fit.cx, cy: fit.cy,
      kind: 'rim', coverage: fit.coverage, points: fit.points,
    });
  }

  // buang duplikat (dua puncak jatuh ke cincin yang sama)
  found.sort((a, b) => a.R_px - b.R_px);
  const rings: RingInfo[] = [];
  for (const f of found) {
    const prev = rings[rings.length - 1];
    if (prev && Math.abs(prev.R_px - f.R_px) < 0.01 * f.R_px) {
      if ((f.coverage ?? 0) > (prev.coverage ?? 0)) rings[rings.length - 1] = f;
    } else rings.push(f);
  }
  return { rings, ctr, profile: prof, baseline };
}

/**
 * Gabungan: cincin berbasis bintik (findAllRings) + cincin kontinu (findRimRings).
 * - rMinRim: batas dalam khusus rim (default = rMin). Set tepat di luar topeng beam-stop
 *   agar cincin yang menempel di beam-stop ikut terdeteksi.
 * - refineCenter: pusat dihitung ulang dari median pusat cincin rim yang busurnya hampir penuh.
 * Jika dua cincin berjarak < tolRel*R, cincin hasil bintik dipertahankan.
 */
export function findAllRingsHybrid(
  img: Float64Array, w: number, h: number, mask: Uint8Array,
  spots: Float64Array, cx: number, cy: number, rMin: number, rMax: number,
  opts: { rMinRim?: number; tolRel?: number; refineCenter?: boolean; rim?: RimOptions } = {},
): { rings: RingInfo[]; ctr: Float64Array; dens: Float64Array; center: [number, number] } {
  const { tolRel = 0.02, refineCenter = true, rim: rimOpts = {} } = opts;
  const rMinRim = opts.rMinRim != null && opts.rMinRim < rMax ? opts.rMinRim : rMin;

  let ccx = cx, ccy = cy;
  let rim = findRimRings(img, w, h, mask, ccx, ccy, rMinRim, rMax, rimOpts);
  if (refineCenter) {
    const good = rim.rings.filter((r) => (r.coverage ?? 0) >= 0.8);
    if (good.length > 0) {
      const mx = median(Float64Array.from(good.map((r) => r.cx)));
      const my = median(Float64Array.from(good.map((r) => r.cy)));
      const shift = Math.hypot(mx - ccx, my - ccy);
      if (shift > 0.3 && shift < 0.05 * rMax) {
        ccx = mx; ccy = my;
        rim = findRimRings(img, w, h, mask, ccx, ccy, rMinRim, rMax, rimOpts);
      }
    }
  }

  const spotRes = findAllRings(spots, ccx, ccy, rMin, rMax);
  const rings: RingInfo[] = spotRes.rings.map((r) => ({ ...r, kind: 'spot' as const }));
  for (const r of rim.rings) {
    const dup = rings.some((s) => Math.abs(s.R_px - r.R_px) < tolRel * r.R_px);
    if (!dup) rings.push(r);
  }
  rings.sort((a, b) => a.R_px - b.R_px);
  return { rings, ctr: spotRes.ctr, dens: spotRes.dens, center: [ccx, ccy] };
}

// Assign spots to rings — port of tetapkan_cincin
export function assignRings(spots: Float64Array, cx: number, cy: number, K: number, dArr: Float64Array, tol: number): { idx: Int32Array; ok: Uint8Array; rAll: Float64Array } {
  const n = spots.length >> 1;
  const rAll = new Float64Array(n);
  for (let i = 0; i < n; i++) rAll[i] = Math.hypot(spots[i * 2] - cx, spots[i * 2 + 1] - cy);
  const Rn = new Float64Array(dArr.length);
  for (let i = 0; i < dArr.length; i++) Rn[i] = K / dArr[i];
  const idx = new Int32Array(n);
  const ok = new Uint8Array(n);
  const lebar = new Float64Array(Rn.length).fill(tol);
  for (let i = 0; i < Rn.length; i++) {
    const dists: number[] = [];
    for (const j of [i - 1, i + 1]) {
      if (j >= 0 && j < Rn.length) dists.push(Math.abs(Rn[i] - Rn[j]) / Rn[i]);
    }
    if (dists.length) lebar[i] = Math.min(tol, 0.45 * Math.min(...dists));
  }
  for (let i = 0; i < n; i++) {
    let bestK = 0, bestDist = Infinity;
    for (let k = 0; k < Rn.length; k++) {
      const d = Math.abs(rAll[i] - Rn[k]);
      if (d < bestDist) { bestDist = d; bestK = k; }
    }
    idx[i] = bestK;
    ok[i] = bestDist < lebar[bestK] * Rn[bestK] ? 1 : 0;
  }
  return { idx, ok, rAll };
}

// Refine center+K with robust least squares (soft_l1) — port of sempurnakan_pusat_K
// Levenberg–Marquardt + IRLS. Residual: r_i = |p_i - c| - K / d_idx(i)
export function refineCenterK(spots: Float64Array, idx: Int32Array, dArr: Float64Array, c0: [number, number], K0: number): { center: [number, number]; K: number } {
  const n = spots.length >> 1;
  let cx = c0[0], cy = c0[1], K = K0;
  if (n < 3) return { center: [cx, cy], K };
  const fScale = 3.0;

  // biaya soft_l1: 2 f^2 (sqrt(1 + (r/f)^2) - 1)
  const cost = (px: number, py: number, k: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(spots[i * 2] - px, spots[i * 2 + 1] - py) - k / dArr[idx[i]];
      const z = r / fScale;
      s += 2 * fScale * fScale * (Math.sqrt(1 + z * z) - 1);
    }
    return s;
  };

  let lambda = 1e-3;
  let costCur = cost(cx, cy, K);

  for (let iter = 0; iter < 50; iter++) {
    const A = new Float64Array(9), g = new Float64Array(3);
    for (let i = 0; i < n; i++) {
      const dx = spots[i * 2] - cx, dy = spots[i * 2 + 1] - cy;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const r = dist - K / dArr[idx[i]];
      const J0 = -dx / dist, J1 = -dy / dist, J2 = -1 / dArr[idx[i]];
      const z = r / fScale;
      const w = 1 / Math.sqrt(1 + z * z); // bobot IRLS soft_l1
      const J = [J0, J1, J2];
      for (let a = 0; a < 3; a++) {
        g[a] += w * r * J[a];
        for (let c = 0; c < 3; c++) A[a * 3 + c] += w * J[a] * J[c];
      }
    }

    let improved = false, converged = false;
    for (let tries = 0; tries < 12; tries++) {
      const Ad = Float64Array.from(A);
      for (let a = 0; a < 3; a++) Ad[a * 3 + a] += lambda * (A[a * 3 + a] || 1);
      const sol = solve3x3(Ad, g);
      // Gauss–Newton: delta = -(J^T W J)^-1 J^T W r  (tanda minus penting!)
      const cxN = cx - sol[0], cyN = cy - sol[1], kN = K - sol[2];
      const cN = cost(cxN, cyN, kN);
      if (Number.isFinite(cN) && cN < costCur) {
        converged = (costCur - cN) < 1e-9 * (costCur + 1);
        cx = cxN; cy = cyN; K = kN; costCur = cN;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        break;
      }
      lambda *= 4;
    }
    if (!improved || converged) break;
  }
  return { center: [cx, cy], K };
}

export { percentile, percentilePos };