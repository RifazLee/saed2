import jsPDF from 'jspdf';
import type { AnalysisResult } from './types';
import { renderOriginalCanvas } from './overlay';

const RING_COLORS: [number, number, number][] = [
  [255, 80, 80], [80, 255, 80], [80, 180, 255], [255, 220, 60], [255, 120, 255],
  [60, 255, 230], [255, 160, 60], [170, 130, 255], [200, 255, 80],
];
const GRAY: [number, number, number] = [150, 150, 150];

// --- Watermark (logo latar belakang) ---
const WATERMARK_URL = '/logo.png';     // watermark latar belakang (folder public/)
const HEADER_LOGO_URL = '/image.png';  // logo kecil di banner header (folder public/)
const WATERMARK_OPACITY = 0.15;         // 30%
const WATERMARK_MAX_W = 0.75;          // maksimum lebar logo (fraksi lebar halaman)
const WATERMARK_MAX_H = 0.75;          // maksimum tinggi logo (fraksi tinggi halaman)
// Panel/kartu dibuat semi-transparan supaya logo di belakangnya tetap terlihat.
const PANEL_OPACITY = 0.6;

// --- Palette ---
const C = {
  ink: [20, 30, 45] as [number, number, number],
  sub: [90, 100, 115] as [number, number, number],
  accent: [30, 64, 120] as [number, number, number],
  accentLight: [232, 238, 248] as [number, number, number],
  panel: [248, 250, 252] as [number, number, number],
  panelBorder: [214, 222, 232] as [number, number, number],
  tableHead: [28, 42, 64] as [number, number, number],
  tableHeadText: [240, 244, 252] as [number, number, number],
  tableRowAlt: [244, 247, 251] as [number, number, number],
  green: [22, 120, 80] as [number, number, number],
  greenLight: [224, 244, 234] as [number, number, number],
  amber: [150, 110, 20] as [number, number, number],
  amberLight: [252, 244, 218] as [number, number, number],
  red: [180, 50, 50] as [number, number, number],
  redLight: [250, 226, 226] as [number, number, number],
};

/** Persentil dari nilai > 0. Memakai Float64Array.sort() (numerik, jauh lebih cepat dari sort number[] dengan comparator). */
function percentilePos(data: Float64Array, p: number): number {
  let cnt = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 0) cnt++;
  if (!cnt) return 1;
  const vals = new Float64Array(cnt);
  let k = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 0) vals[k++] = data[i];
  vals.sort();
  return vals[Math.floor((p / 100) * (cnt - 1))];
}

/** Render the diffraction image with ring overlay, center marker, and spot dots onto a canvas */
export function renderOverlayCanvas(r: AnalysisResult, maxW = 1000): HTMLCanvasElement {
  const scale = Math.min(1, maxW / r.width);
  const W = Math.max(1, Math.round(r.width * scale)), H = Math.max(1, Math.round(r.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const p99 = percentilePos(r.imageData, 99.5) || 1;
  const img = ctx.createImageData(W, H);
  const sx = new Int32Array(W);
  for (let x = 0; x < W; x++) sx[x] = Math.min(r.width - 1, Math.floor(x / scale));
  for (let y = 0; y < H; y++) {
    const row = Math.min(r.height - 1, Math.floor(y / scale)) * r.width;
    for (let x = 0; x < W; x++) {
      const v = r.imageData[row + sx[x]];
      const n = Math.sqrt(Math.min(1, Math.max(0, v / p99)) || 0);
      const o = (y * W + x) * 4;
      const c = n * 255;
      img.data[o] = c; img.data[o + 1] = c; img.data[o + 2] = c; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const sourceToWorking = 1 / r.pixelScale;
  const cx = r.cx * sourceToWorking * scale, cy = r.cy * sourceToWorking * scale;
  r.rings.forEach((ring, i) => {
    const R = ring.R_px * sourceToWorking * scale;
    const col = ring.used ? RING_COLORS[i % RING_COLORS.length] : GRAY;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.lineWidth = ring.used ? 2 : 1;
    ctx.stroke();
    const ang = (-35 - 9 * i) * Math.PI / 180;
    const tx = cx + R * Math.cos(ang), ty = cy + R * Math.sin(ang);
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.font = '12px sans-serif';
    ctx.fillText(`(${ring.hkl})`, tx + 4, ty - 6);
  });
  ctx.strokeStyle = 'yellow'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const s of r.spots) {
    ctx.beginPath(); ctx.arc(s.x * sourceToWorking * scale, s.y * sourceToWorking * scale, 1, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

type Doc = jsPDF;

function fitBox(srcW: number, srcH: number, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(maxW / srcW, maxH / srcH);
  return { w: srcW * s, h: srcH * s };
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function setFill(doc: Doc, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: Doc, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }
function setDraw(doc: Doc, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]); }

/** Jalankan fn dengan opacity tertentu (0..1), lalu kembalikan state grafis. */
function withOpacity(doc: Doc, opacity: number, fn: () => void) {
  doc.saveGraphicsState();
  doc.setGState(new (doc as any).GState({ opacity }));
  fn();
  doc.restoreGraphicsState();
}

async function loadLogoDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// --- Watermark helpers ---
type Watermark = { dataUrl: string; w: number; h: number } | null;

/** Hitung ukuran logo (aspek rasio dijaga) agar besar tetapi tetap muat di halaman. */
function prepareWatermark(doc: Doc, dataUrl: string | null): Watermark {
  if (!dataUrl) return null;
  try {
    const props = doc.getImageProperties(dataUrl);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const box = fitBox(props.width, props.height, pageW * WATERMARK_MAX_W, pageH * WATERMARK_MAX_H);
    return { dataUrl, w: box.w, h: box.h };
  } catch {
    return null;
  }
}

/** Gambar logo di tengah halaman aktif dengan opacity WATERMARK_OPACITY. */
function drawWatermark(doc: Doc, wm: Watermark) {
  if (!wm) return;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  withOpacity(doc, WATERMARK_OPACITY, () => {
    doc.addImage(wm.dataUrl, 'PNG', (pageW - wm.w) / 2, (pageH - wm.h) / 2, wm.w, wm.h, 'wm-logo');
  });
}

/**
 * Pasang watermark pada halaman pertama dan otomatis pada setiap halaman baru
 * (event 'addPage'), sehingga logo selalu menjadi latar belakang di belakang konten.
 */
function installWatermark(doc: Doc, wm: Watermark) {
  if (!wm) return;
  drawWatermark(doc, wm);
  (doc.internal as any).events.subscribe('addPage', () => drawWatermark(doc, wm));
}

function drawRadialProfile(doc: Doc, r: AnalysisResult, x: number, y: number, w: number, h: number) {
  const prof = r.radialProfile;
  if (!prof.length) return;
  let rmin = Infinity, rmax = -Infinity, dmax = 1e-9;
  for (const p of prof) {
    if (p.r < rmin) rmin = p.r;
    if (p.r > rmax) rmax = p.r;
    if (p.density > dmax) dmax = p.density;
  }
  const span = rmax - rmin || 1;
  const mx = 65, my = 35;
  const mxR = 18, myB = 45;
  const plotL = mx, plotR = w - mxR;
  const plotT = my, plotB = h - myB;
  const plotW = plotR - plotL, plotH = plotB - plotT;
  const S = 2;
  const pc = document.createElement('canvas');
  pc.width = Math.round(w * S); pc.height = Math.round(h * S);
  const pctx = pc.getContext('2d');
  if (!pctx) return;
  pctx.scale(S, S);
  // Latar kanvas dibiarkan transparan agar logo watermark tetap terlihat di belakang grafik.

  // gridlines
  pctx.strokeStyle = 'rgb(225,225,225)'; pctx.lineWidth = 0.8;
  for (let g = 1; g <= 3; g++) {
    const gy = plotT + (plotH * g) / 4;
    pctx.beginPath(); pctx.moveTo(plotL, gy); pctx.lineTo(plotR, gy); pctx.stroke();
  }

  // densitas curve with fill
  pctx.fillStyle = 'rgba(30,60,160,0.10)';
  pctx.beginPath();
  prof.forEach((p, i) => {
    const px = plotL + (p.r - rmin) / span * plotW;
    const py = plotT + plotH - (p.density / dmax) * plotH;
    if (i === 0) pctx.moveTo(px, plotB); else pctx.lineTo(px, py);
  });
  pctx.lineTo(plotR, plotB); pctx.lineTo(plotL, plotB); pctx.closePath(); pctx.fill();

  pctx.strokeStyle = 'rgb(30,60,160)'; pctx.lineWidth = 1.5;
  pctx.beginPath();
  prof.forEach((p, i) => {
    const px = plotL + (p.r - rmin) / span * plotW;
    const py = plotT + plotH - (p.density / dmax) * plotH;
    if (i === 0) pctx.moveTo(px, py); else pctx.lineTo(px, py);
  });
  pctx.stroke();

  // garis & label d(hkl) tiap cincin
  r.rings.forEach(ring => {
    if (!ring.found) return;
    const px = plotL + (ring.R_px - rmin) / span * plotW;
    if (px < plotL || px > plotR) return;
    pctx.strokeStyle = 'rgb(220,60,60)'; pctx.lineWidth = 1;
    pctx.setLineDash([4, 3]);
    pctx.beginPath(); pctx.moveTo(px, plotT); pctx.lineTo(px, plotB); pctx.stroke();
    pctx.setLineDash([]);
    pctx.fillStyle = 'rgb(220,60,60)'; pctx.font = '9px sans-serif';
    pctx.fillText(ring.hkl, px + 3, plotT + 11);
    pctx.font = '8px sans-serif';
    pctx.fillText(`d=${ring.d_nm.toFixed(3)}nm`, px + 3, plotT + 22);
  });

  // axes
  pctx.strokeStyle = 'black'; pctx.lineWidth = 1;
  pctx.beginPath(); pctx.moveTo(plotL, plotB); pctx.lineTo(plotR, plotB); pctx.stroke();
  pctx.beginPath(); pctx.moveTo(plotL, plotT); pctx.lineTo(plotL, plotB); pctx.stroke();

  const xTicks = 5;
  pctx.font = '8px sans-serif'; pctx.fillStyle = 'black';
  for (let t = 0; t <= xTicks; t++) {
    const frac = t / xTicks;
    const px = plotL + frac * plotW;
    pctx.beginPath(); pctx.moveTo(px, plotB); pctx.lineTo(px, plotB + 4); pctx.stroke();
    const val = rmin + frac * span;
    pctx.textAlign = 'center';
    pctx.fillText(val.toFixed(0), px, plotB + 14);
  }
  const yTicks = 4;
  pctx.textAlign = 'right';
  for (let t = 0; t <= yTicks; t++) {
    const frac = t / yTicks;
    const py = plotB - frac * plotH;
    pctx.beginPath(); pctx.moveTo(plotL - 4, py); pctx.lineTo(plotL, py); pctx.stroke();
    pctx.fillText((frac * dmax).toFixed(1), plotL - 6, py + 3);
  }
  pctx.textAlign = 'left';

  pctx.font = '10px sans-serif'; pctx.fillStyle = 'black';
  pctx.textAlign = 'center';
  pctx.fillText('Radius R (piksel)', (plotL + plotR) / 2, plotB + 30);
  pctx.save();
  pctx.translate(16, (plotT + plotB) / 2);
  pctx.rotate(-Math.PI / 2);
  pctx.textAlign = 'center';
  pctx.fillText('Densitas cincin (jumlah spot/bin)', 0, 0);
  pctx.restore();
  pctx.textAlign = 'left';

  pctx.font = '9px sans-serif'; pctx.fillStyle = 'rgb(80,80,80)';
  const dhklLines = [
    `Rentang R: ${rmin.toFixed(0)} - ${rmax.toFixed(0)} px`,
    `K = ${r.K.toFixed(1)} nm.px`,
  ];
  dhklLines.forEach((line, i) => {
    pctx.fillText(line, plotR - 110, plotT - 8 + i * 12);
  });

  doc.addImage(pc.toDataURL('image/png'), 'PNG', x, y, w, h);
}

// --- Header banner (top of every page) ---
function drawHeader(doc: Doc, pageW: number, r: AnalysisResult, logoDataUrl: string | null): number {
  const margin = 48;
  const bannerH = 52;
  setFill(doc, C.accent);
  doc.rect(0, 0, pageW, bannerH, 'F');
  // accent stripe
  setFill(doc, [60, 110, 180]);
  doc.rect(0, bannerH, pageW, 3, 'F');
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 12, 8, 36, 36);
  }
  // title
  setText(doc, [255, 255, 255]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('Hasil Analisis Difraksi Elektron (SAED)', margin, 24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  setText(doc, [200, 214, 240]);
  doc.text(r.name, margin, 40);

  // copyright (di atas tanggal, rata kanan)
  setText(doc, [200, 214, 240]);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('©2026 Rifaz Muhammad Sukma', pageW - margin, 26, { align: 'right' });

  // date on the right
  const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  setText(doc, [200, 214, 240]);
  doc.text(`Tanggal: ${dateStr}`, pageW - margin, 40, { align: 'right' });
  return bannerH + 18; // content start Y
}

// --- Calibration summary as a row of stat cards ---
function drawStatCards(doc: Doc, x: number, y: number, totalW: number, r: AnalysisResult): number {
  const stats: Array<[string, string]> = [
    ['Tegangan', `${r.kv} kV`],
    ['Camera length', `${r.cameraLengthM} m`],
    ['lambda (relativistik)', `${r.lambda_nm.toFixed(6)} nm`],
    ['lambda * L', `${(r.lambda_nm * r.cameraLengthM).toExponential(4)} nm.m`],
    ['Titik tengah', `(${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}) px`],
    ['K (fit)', `${r.K.toFixed(2)} nm.px`],
    ['g (resiprokal)', `${r.g.toFixed(6)} nm^-1/px`],
    ['Ukuran piksel', `${r.pix_um.toFixed(3)} um/px`],
    ['Ukuran gambar asli', `${r.originalWidth} x ${r.originalHeight} px`],
    ['Cincin dipakai', `${r.nCincin}`],
    ['Sebaran K', `${r.sebaranPct.toFixed(2)} %`],
  ];
  const cols = 5;
  const gap = 8;
  const cardW = (totalW - gap * (cols - 1)) / cols;
  const cardH = 42;
  const rowH = cardH + gap;
  const rows = Math.ceil(stats.length / cols);

  for (let i = 0; i < stats.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * rowH;
    // isi kartu semi-transparan agar logo di belakangnya tetap terlihat
    withOpacity(doc, PANEL_OPACITY, () => {
      setFill(doc, C.panel);
      doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'F');
    });
    setDraw(doc, C.panelBorder);
    doc.setLineWidth(0.8);
    doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'S');
    // accent bar on left
    setFill(doc, C.accent);
    doc.roundedRect(cx, cy, 3, cardH, 1.5, 1.5, 'F');
    // label
    setText(doc, C.sub);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(stats[i][0], cx + 8, cy + 13);
    // value
    setText(doc, C.ink);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(stats[i][1], cx + 8, cy + 30);
  }
  return y + rows * rowH;
}

// --- Ring table with styled header and alternating rows ---
function drawRingTable(doc: Doc, x: number, y: number, totalW: number, pageW: number, pageH: number, r: AnalysisResult, logoDataUrl: string | null): number {
  const cols = ['hkl', 'd_std', 'd_pred', 'd_sel', 'd_%', 'R pred', 'R meas', 'R_%', 'nSpot', 'K=R*d', 'catatan'];
  const colW = [
    42, 52, 52, 52, 44, 50, 50, 44, 38, 52, 70,
  ];
  // scale to fit totalW
  const totalColW = colW.reduce((a, b) => a + b, 0);
  const scaleF = totalW / totalColW;
  const colX: number[] = [];
  let acc = 0;
  for (let i = 0; i < colW.length; i++) { colX.push(x + acc * scaleF); acc += colW[i]; }
  const rowH = 16;
  const headH = 22;

  let yy = y;
  // header bar
  setFill(doc, C.tableHead);
  doc.rect(x, yy, totalW, headH, 'F');
  setText(doc, C.tableHeadText);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  for (let i = 0; i < cols.length; i++) {
    const align = i === 0 || i === cols.length - 1 ? 'left' : 'right';
    const offset = align === 'right' ? -4 : 4;
    doc.text(cols[i], align === 'right' ? colX[i] + colW[i] * scaleF + offset : colX[i] + offset, yy + 14, { align: align as 'left' | 'right' });
  }
  yy += headH;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  for (let ri = 0; ri < r.rings.length; ri++) {
    const ring = r.rings[ri];
    // page break
    if (yy + rowH > pageH - 48) {
      doc.addPage();
      yy = drawHeader(doc, pageW, r, logoDataUrl) + 8;
      // repeat header
      setFill(doc, C.tableHead);
      doc.rect(x, yy, totalW, headH, 'F');
      setText(doc, C.tableHeadText);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      for (let i = 0; i < cols.length; i++) {
        const align = i === 0 || i === cols.length - 1 ? 'left' : 'right';
        const offset = align === 'right' ? -4 : 4;
        doc.text(cols[i], align === 'right' ? colX[i] + colW[i] * scaleF + offset : colX[i] + offset, yy + 14, { align: align as 'left' | 'right' });
      }
      yy += headH;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    }

    // alternating row (semi-transparan agar logo terlihat)
    if (ri % 2 === 1) {
      withOpacity(doc, PANEL_OPACITY, () => {
        setFill(doc, C.tableRowAlt);
        doc.rect(x, yy, totalW, rowH, 'F');
      });
    }

    const cells = [
      ring.hkl,
      ring.d_nm.toFixed(4),
      ring.found ? ring.d_pred_nm.toFixed(4) : '-',
      ring.found ? ring.d_selisih_nm.toFixed(4) : '-',
      ring.found ? ring.d_selisihPct.toFixed(2) : '-',
      ring.R_pred.toFixed(1),
      ring.found ? ring.R_px.toFixed(1) : '-',
      ring.found ? ring.selisihPct.toFixed(2) : '-',
      String(ring.nSpot),
      ring.found ? ring.K.toFixed(2) : '-',
      ring.used ? 'dipakai' : ring.found ? 'lemah' : 'tidak ada',
    ];
    for (let i = 0; i < cells.length; i++) {
      const align = i === 0 || i === cols.length - 1 ? 'left' : 'right';
      const offset = align === 'right' ? -4 : 4;
      if (i === cols.length - 1) {
        if (ring.used) setText(doc, C.green); else if (ring.found) setText(doc, C.amber); else setText(doc, C.red);
        doc.setFont('helvetica', 'bold');
      } else {
        setText(doc, C.ink);
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      }
      doc.text(cells[i], align === 'right' ? colX[i] + colW[i] * scaleF + offset : colX[i] + offset, yy + 11, { align: align as 'left' | 'right' });
    }
    yy += rowH;
  }
  // bottom border
  setDraw(doc, C.panelBorder); doc.setLineWidth(0.8);
  doc.line(x, yy, x + totalW, yy);
  return yy + 8;
}

async function writeResultToDoc(doc: Doc, r: AnalysisResult, logoDataUrl: string | null) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;

  // --- Page 1: Summary + Table ---
  let y = drawHeader(doc, pageW, r, logoDataUrl);
  y += 4;

  // section label
  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Ringkasan Kalibrasi', margin, y);
  y += 8;
  // accent underline
  setDraw(doc, C.accent); doc.setLineWidth(2);
  doc.line(margin, y, margin + 110, y);
  y += 14;

  y = drawStatCards(doc, margin, y, pageW - 2 * margin, r);
  y += 16;

  // section label: table
  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Tabel Cincin', margin, y);
  y += 8;
  setDraw(doc, C.accent); doc.setLineWidth(2);
  doc.line(margin, y, margin + 90, y);
  y += 14;

  y = drawRingTable(doc, margin, y, pageW - 2 * margin, pageW, pageH, r, logoDataUrl);
  y += 10;

  // footnote
  setText(doc, C.sub);
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5);
  doc.text('Lingkaran berwarna = cincin hasil analisis;  abu-abu = cincin lemah;  + kuning = titik tengah.', margin, y);

  // --- Page 2: Original and overlay comparison ---
  doc.addPage();
  y = drawHeader(doc, pageW, r, logoDataUrl);
  y += 4;
  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Perbandingan Citra Difraksi', margin, y);
  y += 8;
  setDraw(doc, C.accent); doc.setLineWidth(2);
  doc.line(margin, y, margin + 150, y);
  y += 16;

  const gap = 12;
  const imageW = (pageW - 2 * margin - gap) / 2;
  const imageH = pageH - y - margin - 24;
  const originalCanvas = renderOriginalCanvas(r, imageW);
  const overlayCanvas = renderOverlayCanvas(r, imageW);
  const originalBox = fitBox(originalCanvas.width, originalCanvas.height, imageW, imageH);
  const overlayBox = fitBox(overlayCanvas.width, overlayCanvas.height, imageW, imageH);
  const originalX = margin + (imageW - originalBox.w) / 2;
  const overlayX = margin + imageW + gap + (imageW - overlayBox.w) / 2;

  setText(doc, C.sub);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Citra asli', originalX, y - 5);
  doc.text('Dengan overlay cincin', overlayX, y - 5);
  withOpacity(doc, PANEL_OPACITY, () => {
    setFill(doc, [245, 247, 250]);
    doc.roundedRect(originalX - 4, y - 1, originalBox.w + 8, originalBox.h + 8, 4, 4, 'F');
    doc.roundedRect(overlayX - 4, y - 1, overlayBox.w + 8, overlayBox.h + 8, 4, 4, 'F');
  });
  doc.addImage(originalCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', originalX, y + 3, originalBox.w, originalBox.h);
  doc.addImage(overlayCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', overlayX, y + 3, overlayBox.w, overlayBox.h);

  // --- Page 3: Radial profile ---
  doc.addPage();
  y = drawHeader(doc, pageW, r, logoDataUrl);
  y += 4;
  setText(doc, C.ink);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Profil Radial', margin, y);
  y += 8;
  setDraw(doc, C.accent); doc.setLineWidth(2);
  doc.line(margin, y, margin + 90, y);
  y += 14;

  // panel behind plot (semi-transparan)
  const plotW = pageW - 2 * margin;
  const plotH = pageH - y - margin - 10;
  withOpacity(doc, PANEL_OPACITY, () => {
    setFill(doc, C.panel);
    doc.roundedRect(margin - 6, y - 6, plotW + 12, plotH + 12, 6, 6, 'F');
  });
  setDraw(doc, C.panelBorder);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin - 6, y - 6, plotW + 12, plotH + 12, 6, 6, 'S');
  drawRadialProfile(doc, r, margin, y, plotW, plotH);
}

/** PDF for a single result */
export async function buildResultPdf(r: AnalysisResult): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const logoDataUrl = await loadLogoDataUrl(HEADER_LOGO_URL);
  const watermarkDataUrl = await loadLogoDataUrl(WATERMARK_URL);
  installWatermark(doc, prepareWatermark(doc, watermarkDataUrl));
  await writeResultToDoc(doc, r, logoDataUrl);
  return doc.output('blob');
}

/** Combined PDF for all results */
export async function buildAllPdf(results: AnalysisResult[]): Promise<Blob> {
  if (results.length === 0) throw new Error('Tidak ada hasil untuk diekspor.');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const logoDataUrl = await loadLogoDataUrl(HEADER_LOGO_URL);
  const watermarkDataUrl = await loadLogoDataUrl(WATERMARK_URL);
  installWatermark(doc, prepareWatermark(doc, watermarkDataUrl));
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;

  if (results.length === 1) {
    await writeResultToDoc(doc, results[0], logoDataUrl);
  } else {
    // --- Summary overview page ---
    let y = drawHeader(doc, pageW, results[0], logoDataUrl); // use first result for date
    y += 4;
    setText(doc, C.ink);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('Ringkasan Semua Citra', margin, y);
    y += 8;
    setDraw(doc, C.accent); doc.setLineWidth(2);
    doc.line(margin, y, margin + 150, y);
    y += 16;

    const colDefs: Array<[string, number, 'l' | 'r']> = [
      ['Citra', 30, 'l'], ['kV', 5, 'r'], ['L(m)', 5, 'r'], ['pusat_x', 8, 'r'], ['pusat_y', 8, 'r'],
      ['K(nm.px)', 9, 'r'], ['nm^-1/px', 10, 'r'], ['um/px', 8, 'r'], ['cincin', 6, 'r'], ['sebaran%', 8, 'r'],
    ];
    const totalColW = colDefs.reduce((a, c) => a + c[1], 0);
    const scaleF = (pageW - 2 * margin) / totalColW;
    const colX: number[] = [];
    let acc = 0;
    for (let i = 0; i < colDefs.length; i++) { colX.push(margin + acc * scaleF); acc += colDefs[i][1]; }

    const drawSummaryHeader = () => {
      setFill(doc, C.tableHead);
      doc.rect(margin, y, pageW - 2 * margin, 22, 'F');
      setText(doc, C.tableHeadText);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      for (let i = 0; i < colDefs.length; i++) {
        const align = colDefs[i][2] === 'r' ? 'right' : 'left';
        const offset = colDefs[i][2] === 'r' ? -4 : 4;
        doc.text(colDefs[i][0], colDefs[i][2] === 'r' ? colX[i] + colDefs[i][1] * scaleF + offset : colX[i] + offset, y + 14, { align });
      }
      y += 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    };
    drawSummaryHeader();
    for (let ri = 0; ri < results.length; ri++) {
      const r = results[ri];
      if (y > pageH - margin - 20) { doc.addPage(); y = drawHeader(doc, pageW, r, logoDataUrl) + 4; drawSummaryHeader(); }
      if (ri % 2 === 1) {
        const rowY = y;
        withOpacity(doc, PANEL_OPACITY, () => {
          setFill(doc, C.tableRowAlt);
          doc.rect(margin, rowY, pageW - 2 * margin, 16, 'F');
        });
      }
      setText(doc, C.ink);
      const cells = [
        r.name.slice(0, 30),
        String(r.kv),
        String(r.cameraLengthM),
        r.cx.toFixed(2),
        r.cy.toFixed(2),
        r.K.toFixed(2),
        r.g.toFixed(6),
        r.pix_um.toFixed(3),
        String(r.nCincin),
        r.sebaranPct.toFixed(2),
      ];
      for (let i = 0; i < cells.length; i++) {
        const align = colDefs[i][2] === 'r' ? 'right' : 'left';
        const offset = colDefs[i][2] === 'r' ? -4 : 4;
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        doc.text(cells[i], colDefs[i][2] === 'r' ? colX[i] + colDefs[i][1] * scaleF + offset : colX[i] + offset, y + 11, { align });
      }
      y += 16;
    }

    // detail pages for each result
    for (const r of results) {
      doc.addPage();
      await writeResultToDoc(doc, r, logoDataUrl);
    }
  }
  return doc.output('blob');
}

/** CSV for a single result */
export function buildResultCsv(r: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(`# ${r.name}`);
  lines.push(`# kv_kV,${r.kv}`);
  lines.push(`# camera_length_m,${r.cameraLengthM}`);
  lines.push(`# lambda_nm,${r.lambda_nm}`);
  lines.push(`# center_x_px,${r.cx}`);
  lines.push(`# center_y_px,${r.cy}`);
  lines.push(`# K_nm.px,${r.K}`);
  lines.push(`# g_nm^-1_per_px,${r.g}`);
  lines.push(`# pixel_um,${r.pix_um}`);
  lines.push(`# n_rings_used,${r.nCincin}`);
  lines.push(`# spread_pct,${r.sebaranPct}`);
  lines.push('');
  lines.push('hkl,d_std_nm,d_pred_nm,selisih_d_nm,selisih_d_pct,R_pred_px,R_meas_px,selisih_R_pct,n_spot,K_nm.px,used');
  for (const ring of r.rings) {
    lines.push([
      ring.hkl, ring.d_nm.toFixed(6),
      ring.found ? ring.d_pred_nm.toFixed(6) : '',
      ring.found ? ring.d_selisih_nm.toFixed(6) : '',
      ring.found ? ring.d_selisihPct.toFixed(4) : '',
      ring.R_pred.toFixed(3),
      ring.found ? ring.R_px.toFixed(3) : '',
      ring.found ? ring.selisihPct.toFixed(4) : '',
      String(ring.nSpot),
      ring.found ? ring.K.toFixed(4) : '',
      ring.used ? '1' : '0',
    ].join(','));
  }
  return lines.join('\n');
}

/** Combined CSV for all results */
export function buildAllCsv(results: AnalysisResult[]): string {
  return results.map(buildResultCsv).join('\n\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPdf(r: AnalysisResult): Promise<void> {
  downloadBlob(await buildResultPdf(r), `hasil_analisis_difraksi_${stripExt(r.name)}.pdf`);
}
export async function downloadAllPdf(results: AnalysisResult[]): Promise<void> {
  downloadBlob(await buildAllPdf(results), 'hasil_analisis_difraksi_semua.pdf');
}
export function downloadCsv(r: AnalysisResult) {
  downloadBlob(new Blob([buildResultCsv(r)], { type: 'text/csv;charset=utf-8' }), `hasil_analisis_difraksi_${stripExt(r.name)}.csv`);
}
export function downloadAllCsv(results: AnalysisResult[]) {
  downloadBlob(new Blob([buildAllCsv(results)], { type: 'text/csv;charset=utf-8' }), 'hasil_analisis_difraksi_semua.csv');
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}