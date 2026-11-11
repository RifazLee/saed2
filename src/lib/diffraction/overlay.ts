import type { AnalysisResult, DetectionResult } from './types';

type HasImage = {
  imageData: Float64Array;
  width: number;
  height: number;
  pixelScale: number;
  cx: number;
  cy: number;
  spots: Array<{ x: number; y: number }>;
};

function percentilePos(data: Float64Array, p: number): number {
  let count = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 0) count++;
  if (count === 0) return 1;
  const values = new Float64Array(count);
  let index = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > 0) values[index++] = data[i];
  values.sort();
  return values[Math.floor((p / 100) * (count - 1))] || 1;
}

function createGrayscaleCanvas(r: HasImage, maxW: number): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, maxW / r.width);
  const width = Math.max(1, Math.round(r.width * scale));
  const height = Math.max(1, Math.round(r.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const p99 = percentilePos(r.imageData, 99.5);
  const image = ctx.createImageData(width, height);
  const sourceX = new Int32Array(width);
  for (let x = 0; x < width; x++) sourceX[x] = Math.min(r.width - 1, Math.floor(x / scale));
  for (let y = 0; y < height; y++) {
    const row = Math.min(r.height - 1, Math.floor(y / scale)) * r.width;
    for (let x = 0; x < width; x++) {
      const value = r.imageData[row + sourceX[x]];
      const normalized = Math.sqrt(Math.min(1, Math.max(0, value / p99)) || 0);
      const offset = (y * width + x) * 4;
      const color = normalized * 255;
      image.data[offset] = color;
      image.data[offset + 1] = color;
      image.data[offset + 2] = color;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, scale };
}

function drawCenterAndSpots(ctx: CanvasRenderingContext2D, r: HasImage, scale: number) {
  const sourceToWorking = 1 / r.pixelScale;
  const cx = r.cx * sourceToWorking * scale;
  const cy = r.cy * sourceToWorking * scale;
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const spot of r.spots) {
    ctx.beginPath();
    ctx.arc(spot.x * sourceToWorking * scale, spot.y * sourceToWorking * scale, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  return { cx, cy, sourceToWorking };
}

export function renderOriginalCanvas(r: AnalysisResult | DetectionResult, maxW = 1000): HTMLCanvasElement {
  return createGrayscaleCanvas(r, maxW).canvas;
}

/** Overlay for a DetectionResult — shows all detected rings without hkl labels. */
export function renderDetectionOverlay(
  r: DetectionResult,
  maxW = 1000,
  highlightIndex?: number,
): HTMLCanvasElement {
  const { canvas, scale } = createGrayscaleCanvas(r, maxW);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const sourceToWorking = 1 / r.pixelScale;
  const cx = r.cx * sourceToWorking * scale;
  const cy = r.cy * sourceToWorking * scale;

  r.rings.forEach((ring, index) => {
    const radius = ring.R_px * sourceToWorking * scale;
    const dimmed = highlightIndex !== undefined && highlightIndex !== index;
    const baseColor = `hsl(${index * 47}, 80%, 62%)`;
    const color = dimmed ? 'rgba(120,120,120,0.25)' : baseColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = highlightIndex === index ? 3 : 2;
    ctx.stroke();
    if (highlightIndex === index) {
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const angle = (-35 - 12 * index) * Math.PI / 180;
    const tx = cx + radius * Math.cos(angle);
    const ty = cy + radius * Math.sin(angle);
    ctx.fillStyle = dimmed ? 'rgba(120,120,120,0.25)' : color;
    ctx.font = highlightIndex === index ? 'bold 13px sans-serif' : '12px sans-serif';
    ctx.fillText(`Cincin ${index + 1}`, tx + 4, ty - 6);
  });

  drawCenterAndSpots(ctx, r, scale);
  return canvas;
}

/** Overlay showing only the standard/predicted rings (R_pred = K / d_std). */
export function renderStandardRingsOverlay(r: AnalysisResult, maxW = 1000): HTMLCanvasElement {
  const { canvas, scale } = createGrayscaleCanvas(r, maxW);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const sourceToWorking = 1 / r.pixelScale;
  const cx = r.cx * sourceToWorking * scale;
  const cy = r.cy * sourceToWorking * scale;

  ctx.setLineDash([6, 4]);
  r.rings.forEach((ring, index) => {
    const radius = ring.R_pred * sourceToWorking * scale;
    if (!Number.isFinite(radius) || radius <= 0) return;
    const color = `hsl(${index * 43}, 70%, 55%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const angle = (-35 - 9 * index) * Math.PI / 180;
    const tx = cx + radius * Math.cos(angle);
    const ty = cy + radius * Math.sin(angle);
    ctx.fillStyle = color;
    ctx.font = '11px sans-serif';
    ctx.fillText(`(${ring.hkl})`, tx + 4, ty - 6);
  });
  ctx.setLineDash([]);

  drawCenterAndSpots(ctx, r, scale);
  return canvas;
}

/** Overlay showing only the measured/detected rings (R_px from spots). */
export function renderMeasuredRingsOverlay(r: AnalysisResult, maxW = 1000): HTMLCanvasElement {
  const { canvas, scale } = createGrayscaleCanvas(r, maxW);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const sourceToWorking = 1 / r.pixelScale;
  const cx = r.cx * sourceToWorking * scale;
  const cy = r.cy * sourceToWorking * scale;

  r.rings.forEach((ring, index) => {
    if (!ring.found) return;
    const radius = ring.R_px * sourceToWorking * scale;
    if (!Number.isFinite(radius) || radius <= 0) return;
    const color = `hsl(${index * 43}, 85%, 65%)`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    const angle = (-35 - 9 * index) * Math.PI / 180;
    const tx = cx + radius * Math.cos(angle);
    const ty = cy + radius * Math.sin(angle);
    ctx.fillStyle = color;
    ctx.font = '11px sans-serif';
    ctx.fillText(`(${ring.hkl})`, tx + 4, ty - 6);
  });

  drawCenterAndSpots(ctx, r, scale);
  return canvas;
}

/** Overlay for a fully calibrated AnalysisResult — shows hkl-labeled rings. */
export function renderOverlayCanvas(r: AnalysisResult, maxW = 1000, highlightIndex?: number): HTMLCanvasElement {
  const { canvas, scale } = createGrayscaleCanvas(r, maxW);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');
  const sourceToWorking = 1 / r.pixelScale;
  const cx = r.cx * sourceToWorking * scale;
  const cy = r.cy * sourceToWorking * scale;

  r.rings.forEach((ring, index) => {
    const radius = ring.R_px * sourceToWorking * scale;
    const dimmed = highlightIndex !== undefined && highlightIndex !== index;
    const baseColor = ring.found ? `hsl(${index * 43}, 80%, 62%)` : 'rgb(150,150,150)';
    const color = dimmed ? 'rgba(120,120,120,0.25)' : baseColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = highlightIndex === index ? 3 : ring.found ? 2 : 1;
    ctx.stroke();
    if (highlightIndex === index) {
      ctx.shadowColor = baseColor;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const angle = (-35 - 9 * index) * Math.PI / 180;
    const tx = cx + radius * Math.cos(angle);
    const ty = cy + radius * Math.sin(angle);
    ctx.fillStyle = dimmed ? 'rgba(120,120,120,0.25)' : color;
    ctx.font = highlightIndex === index ? 'bold 13px sans-serif' : '12px sans-serif';
    ctx.fillText(`(${ring.hkl})`, tx + 4, ty - 6);
  });

  drawCenterAndSpots(ctx, r, scale);
  return canvas;
}
