import { electronWavelengthNm, resolveDnm, MATERIAL_NAMES } from './physics';
import {
  detectInfoBar,
  fileToGrayscale,
  beamStopMask,
  beamStopMargin,
  detectSpots,
  detectRingPoints,
  mergeSpots,
  findCoarseCenter,
  findFirstRing,
  fitFirstRing,
  findAllRingsHybrid,
  assignRings,
  refineCenterK,
  radialHistogram,
} from './detect';
import { downsample } from './imaging';
import type { AnalysisParams, AnalysisResult, DetectionResult, RingResult } from './types';

export type ProgressFn = (label: string, pct: number) => void;

const MIN_SPOT = 1;
const MAX_RING_ERROR = 0.10;
// Tambahan jarak (kelipatan radius kepala beam-stop) di luar topeng sebelum cincin rim dianggap
// cincin difraksi, bukan halo beam.
const RIM_HALO_FRAC = 0;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Phase 1 — detect rings without any d-standards or hkl assignment.
 * Operator picks the primary ring from this result before calibration.
 *
 * Cincin dideteksi dari DUA sumber:
 *  - bintik/titik diskrit (histogram radial dari spot), dan
 *  - rim kontinu (profil radial azimut) untuk cincin terang yang titiknya sudah merapat.
 * Titik ridge dari cincin rim ditambahkan ke daftar spot supaya cincin tersebut
 * juga ikut dipetakan ke hkl pada fase kalibrasi.
 */
export async function detectRings(
  file: File,
  params: AnalysisParams,
  onProgress?: ProgressFn,
): Promise<DetectionResult> {
  const report: string[] = [];
  const log = (s = '') => { report.push(s); };

  onProgress?.('Membaca citra', 5);
  const { data: raw, width: w0, height: h0 } = await fileToGrayscale(file);
  await nextFrame();

  let crop = params.cropBottom;
  if (crop == null) {
    crop = detectInfoBar(raw, w0, h0);
    if (crop == null) crop = Math.round(h0 * 0.045);
  }
  crop = Math.min(Math.max(0, Math.round(crop)), Math.floor(h0 * 0.5));

  const croppedW = w0;
  const croppedH = h0 - crop;
  const cropped = crop > 0 ? raw.slice(0, croppedW * croppedH) : raw;

  const scaleFactor = Math.max(1, Math.ceil(Math.max(croppedW, croppedH) / 1024));
  const resized = downsample(cropped, croppedW, croppedH, scaleFactor);
  const img = resized.data;
  const w = resized.w;
  const h = resized.h;
  log(`Image: ${file.name}  (${croppedW}x${croppedH} -> ${w}x${h} px, scale 1/${scaleFactor}, crop ${crop})`);
  await nextFrame();

  onProgress?.('Mendeteksi beam-stop', 20);
  const { mask, info: bs } = beamStopMask(img, w, h, params.arm);
  log(`Beam-stop: head=(${bs.headX},${bs.headY}) r=${bs.headRadius.toFixed(0)}px arm=${bs.arm}`);
  await nextFrame();

  onProgress?.('Mendeteksi bintik & cincin difraksi', 40);
  const spotRes = detectSpots(img, w, h, mask, params.kSigma);
  const ringRes = detectRingPoints(img, w, h, mask, params.kSigma);
  const spots = mergeSpots(spotRes.spots, ringRes.spots);
  log(`Discrete spots: ${spotRes.spots.length >> 1}, ring pixels: ${ringRes.spots.length >> 1}, merged: ${spots.length >> 1}`);
  if ((spots.length >> 1) < 30) throw new Error('Too few features detected; lower k-sigma.');
  await nextFrame();

  const rMin = params.rMin == null
    ? Math.max(1.3 * bs.headRadius, 150 / scaleFactor)
    : params.rMin / scaleFactor;
  const rMax = params.rMax == null
    ? 0.45 * Math.min(w, h)
    : params.rMax / scaleFactor;
  if (!(rMax > rMin)) throw new Error('Invalid radius range (rMax must be greater than rMin).');

  // Batas dalam khusus cincin rim: tepat di luar topeng beam-stop (cakram r_head + 30),
  // sehingga cincin terang yang menempel di beam-stop tidak terpotong oleh rMin spot.
  // Jika operator mengisi rMin manual, rMin itu dipakai juga untuk rim.
  const maskEdge = bs.headRadius + beamStopMargin(w, h); // tepi cakram topeng (px citra kerja)
  const rMinRim = params.rMin == null ? maskEdge + 2 : rMin;
  // Cincin rim dengan R di bawah radius ini dibuang sebagai halo beam. Default RIM_HALO_FRAC = 0
  // (hanya mengandalkan syarat bentuk puncak). Naikkan jika halo beam masih lolos.
  const rimMinRadius = params.rMin == null ? maskEdge + RIM_HALO_FRAC * bs.headRadius : rMin;
  log(`Beam-stop mask edge=${maskEdge.toFixed(1)}px  rim search from ${rMinRim.toFixed(1)}px`);

  onProgress?.('Mencari pusat & cincin', 60);
  const c0 = findCoarseCenter(spots, [bs.headX + 40 / scaleFactor, bs.headY], rMin, rMax);
  await nextFrame();
  const first = findFirstRing(spots, c0[0], c0[1], rMin, rMax);
  const fit1 = fitFirstRing(spots, c0[0], c0[1], first.R1);
  let cx = fit1.center[0];
  let cy = fit1.center[1];
  log(`Coarse center=(${cx.toFixed(1)},${cy.toFixed(1)})  R1=${fit1.R.toFixed(1)}px`);
  await nextFrame();

  onProgress?.('Mendeteksi semua cincin', 80);
  const hybrid = findAllRingsHybrid(img, w, h, mask, spots, cx, cy, rMin, rMax, {
    rMinRim,
    refineCenter: true,
    rim: { bgSigmaPx: Math.max(15, 100 / scaleFactor), minRadius: rimMinRadius },
  });
  const detected = hybrid.rings;
  if (Math.hypot(hybrid.center[0] - cx, hybrid.center[1] - cy) > 1e-6) {
    cx = hybrid.center[0];
    cy = hybrid.center[1];
    log(`Center refined from rim rings=(${cx.toFixed(1)},${cy.toFixed(1)})`);
  }
  const nRim = detected.filter((r) => r.kind === 'rim').length;
  log(`Rings detected: ${detected.length} (spot=${detected.length - nRim}, rim=${nRim})`);
  for (const ring of detected) {
    const cov = ring.coverage != null ? `  coverage=${(100 * ring.coverage).toFixed(0)}%` : '';
    const rel = bs.headRadius > 0 ? `  R/r_stop=${(ring.R_px / bs.headRadius).toFixed(2)}` : '';
    log(`  [${ring.kind}] R=${ring.R_px.toFixed(1)}px  nSpot=${ring.nSpot}  center=(${ring.cx.toFixed(1)},${ring.cy.toFixed(1)})${cov}${rel}`);
  }
  if (detected.length === 0) throw new Error('No rings detected; lower k-sigma or check image.');
  await nextFrame();

  // Tambahkan titik ridge cincin rim ke daftar spot agar ikut dipetakan ke hkl.
  let allSpots = spots;
  for (const ring of detected) {
    if (ring.kind === 'rim' && ring.points && ring.points.length > 0) {
      allSpots = mergeSpots(allSpots, ring.points);
    }
  }
  if (allSpots !== spots) log(`Spots incl. rim ridge points: ${allSpots.length >> 1}`);

  const prof = radialHistogram(allSpots, cx, cy, rMinRim, rMax);
  const radialProfile = Array.from(prof.ctr, (radius, i) => ({ r: radius * scaleFactor, density: prof.dens[i] }));

  onProgress?.('Menyusun hasil deteksi', 95);
  await nextFrame();

  const nn = allSpots.length >> 1;
  const spotArr: Array<{ x: number; y: number }> = new Array(nn);
  for (let i = 0; i < nn; i++) {
    spotArr[i] = { x: allSpots[i * 2] * scaleFactor, y: allSpots[i * 2 + 1] * scaleFactor };
  }

  const sourceRings = detected.map((ring, i) => ({
    index: i,
    R_px: ring.R_px * scaleFactor,
    nSpot: ring.nSpot,
    cx: ring.cx * scaleFactor,
    cy: ring.cy * scaleFactor,
  }));

  return {
    id: `${file.name}-${Date.now()}`,
    name: file.name,
    kv: params.kv,
    cameraLengthM: params.cameraLengthM,
    cx: cx * scaleFactor,
    cy: cy * scaleFactor,
    rings: sourceRings,
    spots: spotArr,
    imageData: img,
    width: w,
    height: h,
    originalWidth: w0,
    originalHeight: h0,
    pixelScale: scaleFactor,
    report,
    radialProfile,
  };
}

/**
 * Phase 2 — calibrate using the operator-selected primary ring as reference.
 * The primary ring's R * d_primary becomes K, then all other rings are matched
 * to d-standards and the full calibration table is computed.
 */
export async function calibrateWithSelection(
  det: DetectionResult,
  primaryRingIndex: number,
  params: AnalysisParams,
  onProgress?: ProgressFn,
): Promise<AnalysisResult> {
  const report: string[] = [...det.report];
  const log = (s = '') => { report.push(s); };

  const scaleFactor = det.pixelScale;
  const primary = det.rings[primaryRingIndex];
  if (!primary) throw new Error('Primary ring index out of range.');

  onProgress?.('Menyiapkan d-standar', 10);
  const dMap = resolveDnm(params.material, params.customA_nm, params.hklList, params.referenceDnm);
  const entries = params.hklList
    .map((k) => ({ k, d: dMap[k] }))
    .filter((e) => Number.isFinite(e.d) && e.d > 0)
    .sort((a, b) => b.d - a.d);
  if (entries.length === 0) throw new Error('No valid hkl / d-spacing for the selected material.');
  const hkl = entries.map((e) => e.k);
  const dArr = Float64Array.from(entries.map((e) => e.d));
  await nextFrame();

  // K from the operator-selected primary ring, paired with the largest d (first ring).
  // K is computed in WORKING-image pixels (same scale as spots/center used below).
  const sourceToWorking = 1 / scaleFactor;
  const R1_working = primary.R_px * sourceToWorking;
  let K = R1_working * dArr[0];
  let cx = primary.cx;
  let cy = primary.cy;
  log(`Primary ring: R=${primary.R_px.toFixed(1)}px  ->  K=${(K * scaleFactor).toFixed(2)} nm.px  (d_ref=${dArr[0].toFixed(4)} nm, hkl=${hkl[0]})`);
  log(`Center from primary ring fit: (${cx.toFixed(1)},${cy.toFixed(1)})`);

  // Convert spots back to working-image coordinates for assignment
  const nn = det.spots.length;
  const spots = new Float64Array(nn * 2);
  for (let i = 0; i < nn; i++) {
    spots[i * 2] = det.spots[i].x * sourceToWorking;
    spots[i * 2 + 1] = det.spots[i].y * sourceToWorking;
  }
  let cxW = cx * sourceToWorking;
  let cyW = cy * sourceToWorking;

  onProgress?.('Penyempurnaan pusat & penempatan cincin', 30);
  const tol = Math.min(params.tolerance, MAX_RING_ERROR);
  if (params.refineCenter) {
    for (let it = 0; it < 6; it++) {
      const a = assignRings(spots, cxW, cyW, K, dArr, tol);
      const okIdx: number[] = [];
      for (let i = 0; i < a.ok.length; i++) if (a.ok[i]) okIdx.push(i);
      if (okIdx.length < 10) break;
      const sub = new Float64Array(okIdx.length * 2);
      const subIdx = new Int32Array(okIdx.length);
      for (let i = 0; i < okIdx.length; i++) {
        sub[i * 2] = spots[okIdx[i] * 2];
        sub[i * 2 + 1] = spots[okIdx[i] * 2 + 1];
        subIdx[i] = a.idx[okIdx[i]];
      }
      const ref = refineCenterK(sub, subIdx, dArr, [cxW, cyW], K);
      if (![ref.center[0], ref.center[1], ref.K].every(Number.isFinite) || ref.K <= 0) break;
      const shift = Math.hypot(ref.center[0] - cxW, ref.center[1] - cyW);
      const dK = Math.abs(ref.K / K - 1);
      cxW = ref.center[0];
      cyW = ref.center[1];
      K = ref.K;
      if (shift < 0.01 && dK < 1e-5) break;
    }
    cx = cxW * scaleFactor;
    cy = cyW * scaleFactor;
    log(`Refined center=(${cx.toFixed(1)},${cy.toFixed(1)})  K=${(K * scaleFactor).toFixed(2)}`);
  }
  await nextFrame();

  onProgress?.('Menghitung kalibrasi', 60);
  const Ksrc = K * scaleFactor;
  const asg = assignRings(spots, cxW, cyW, K, dArr, tol);
  const rings: RingResult[] = [];
  for (let n = 0; n < hkl.length; n++) {
    const rs: number[] = [];
    for (let i = 0; i < asg.ok.length; i++) {
      if (asg.ok[i] && asg.idx[i] === n) rs.push(asg.rAll[i] * scaleFactor);
    }
    const Rpred = Ksrc / dArr[n];
    let Rpx = Rpred, sd = 0, found = false, nSpot = 0;
    if (rs.length >= MIN_SPOT) {
      found = true;
      rs.sort((a, b) => a - b);
      Rpx = rs[rs.length >> 1];
      const m = Rpx;
      sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length);
      nSpot = rs.length;
    }
    const dPred = found ? Ksrc / Rpx : NaN;
    const dSel = found ? dPred - dArr[n] : NaN;
    rings.push({
      hkl: hkl[n],
      d_nm: dArr[n],
      d_pred_nm: dPred,
      d_selisih_nm: dSel,
      d_selisihPct: found ? 100 * (dPred / dArr[n] - 1) : NaN,
      R_pred: Rpred,
      R_px: Rpx,
      found,
      nSpot,
      sd,
      used: found && nSpot >= MIN_SPOT && Math.abs(Rpx / Rpred - 1) < MAX_RING_ERROR,
      K: found ? Rpx * dArr[n] : NaN,
      selisihPct: found ? 100 * (Rpx / Rpred - 1) : NaN,
    });
  }

  onProgress?.('Finalisasi kalibrasi', 85);
  const usedRings = rings.filter((r) => r.used);
  if (usedRings.length === 0) throw new Error('No ring has a spot within the 10% reference tolerance.');
  const Ks = usedRings.map((r) => r.K);
  const Kc = weightedAvg(Ks, usedRings.map((r) => r.nSpot));
  const Ksd = Math.sqrt(Ks.reduce((a, b) => a + (b - Kc) ** 2, 0) / Ks.length);
  const Kfinal = params.refineCenter ? Ksrc : Kc;
  const g = 1.0 / Kfinal;
  const lam = electronWavelengthNm(params.kv);
  const lamL = lam * 1e-9 * params.cameraLengthM;
  const pixM = lamL / (Kfinal * 1e-9);
  const spread = 100 * (Math.max(...Ks) - Math.min(...Ks)) / Kc;

  const matName = MATERIAL_NAMES[params.material] ?? params.material;
  log(`Material: ${params.material === 'custom' ? `a=${params.customA_nm} nm` : matName}`);
  log(`lambda(${params.kv} kV)=${lam.toFixed(6)} nm  lambda*L=${(lam * params.cameraLengthM).toExponential(4)} nm.m`);
  log(`Center=(${cx.toFixed(2)},${cy.toFixed(2)})  K=${Kfinal.toFixed(2)} nm.px  K_cincin=${Kc.toFixed(2)}  sd=${Ksd.toFixed(2)}`);
  log(`g=${g.toFixed(6)} nm^-1/px  pixel=${(pixM * 1e6).toFixed(3)} um/px  spread=${spread.toFixed(2)}%`);
  log(`hkl    d_std  d_pred  d_selisih  R_pred  R_meas  R_selisih%  nSpot   K=R*d`);
  for (const r of rings) {
    if (r.found) {
      log(`${r.hkl}  ${r.d_nm.toFixed(4)}  ${r.d_pred_nm.toFixed(4)}  ${r.d_selisih_nm.toFixed(4)}  ${r.R_pred.toFixed(1)}  ${r.R_px.toFixed(1)}  ${r.selisihPct.toFixed(2)}  ${r.nSpot}  ${r.K.toFixed(2)}${r.used ? '' : '  lemah'}`);
    } else {
      log(`${r.hkl}  ${r.d_nm.toFixed(4)}  -  -  ${r.R_pred.toFixed(1)}  -  -  0  -`);
    }
  }
  await nextFrame();

  onProgress?.('Selesai', 100);
  return {
    id: det.id,
    name: det.name,
    kv: det.kv,
    cameraLengthM: det.cameraLengthM,
    lambda_nm: lam,
    cx,
    cy,
    K: Kfinal,
    g,
    pix_um: pixM * 1e6,
    nCincin: usedRings.length,
    sebaranPct: spread,
    rings,
    spots: det.spots,
    imageData: det.imageData,
    width: det.width,
    height: det.height,
    originalWidth: det.originalWidth,
    originalHeight: det.originalHeight,
    pixelScale: det.pixelScale,
    report,
    radialProfile: det.radialProfile,
  };
}

function weightedAvg(vals: number[], wts: number[]): number {
  let s = 0, w = 0;
  for (let i = 0; i < vals.length; i++) { s += vals[i] * wts[i]; w += wts[i]; }
  return w > 0 ? s / w : 0;
}