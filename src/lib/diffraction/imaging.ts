// Image processing helpers: gaussian blur, separable filters, etc.
// Optimized for browser performance: large-sigma Gaussian via repeated box blur,
// separable max filter, and sampled median.

/** 1D gaussian kernel (only used for small sigma) */
function gaussianKernel(sigma: number): Float64Array {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float64Array(2 * r + 1);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / s2);
    k[i + r] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

function conv1DSmall(data: Float64Array, w: number, h: number, kernel: Float64Array, axis: 'x' | 'y'): Float64Array {
  const r = (kernel.length - 1) >> 1;
  const out = new Float64Array(data.length);
  if (axis === 'x') {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          let xi = x + k;
          if (xi < 0) xi = 0;
          else if (xi >= w) xi = w - 1;
          s += data[row + xi] * kernel[k + r];
        }
        out[row + x] = s;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) {
          let yi = y + k;
          if (yi < 0) yi = 0;
          else if (yi >= h) yi = h - 1;
          s += data[yi * w + x] * kernel[k + r];
        }
        out[y * w + x] = s;
      }
    }
  }
  return out;
}

/**
 * Radius kotak untuk n-pass box blur yang mendekati Gaussian dengan sigma tertentu
 * (metode "boxes for gauss"). Lebar kotak dipilih dari dua ukuran ganjil (wl dan wl+2)
 * sehingga sigma efektif sangat dekat dengan sigma yang diminta.
 * Versi lama memakai r = 0.84*sigma, yang menghasilkan blur terlalu sempit
 * (sigma efektif ~15-20% lebih kecil) sehingga halo dan high-pass bergeser.
 */
function boxRadii(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  wl = Math.max(1, wl);
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const radii: number[] = [];
  for (let i = 0; i < n; i++) radii.push(((i < m ? wl : wu) - 1) >> 1);
  return radii;
}

/** Box blur along one axis with a given radius (running sum, O(n)) */
function boxBlurAxis(data: Float64Array, w: number, h: number, radius: number, axis: 'x' | 'y'): Float64Array {
  if (radius <= 0) return data;
  const out = new Float64Array(data.length);
  const winSize = 2 * radius + 1;
  if (axis === 'x') {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      // init window with clamped edges
      for (let k = -radius; k <= radius; k++) {
        const xi = Math.min(w - 1, Math.max(0, k));
        sum += data[row + xi];
      }
      for (let x = 0; x < w; x++) {
        out[row + x] = sum / winSize;
        const xOut = Math.min(w - 1, Math.max(0, x - radius));
        const xIn = Math.min(w - 1, Math.max(0, x + radius + 1));
        sum += data[row + xIn] - data[row + xOut];
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const yi = Math.min(h - 1, Math.max(0, k));
        sum += data[yi * w + x];
      }
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / winSize;
        const yOut = Math.min(h - 1, Math.max(0, y - radius));
        const yIn = Math.min(h - 1, Math.max(0, y + radius + 1));
        sum += data[yIn * w + x] - data[yOut * w + x];
      }
    }
  }
  return out;
}

/**
 * Gaussian filter. For sigma <= 5, uses exact separable convolution.
 * For larger sigma, uses 3 box-blur passes per axis (good approximation, much faster).
 */
export function gaussianFilter(data: Float64Array, w: number, h: number, sigma: number): Float64Array {
  if (sigma <= 5) {
    const k = gaussianKernel(sigma);
    return conv1DSmall(conv1DSmall(data, w, h, k, 'x'), w, h, k, 'y');
  }
  let out = data;
  for (const r of boxRadii(sigma)) {
    out = boxBlurAxis(out, w, h, r, 'x');
    out = boxBlurAxis(out, w, h, r, 'y');
  }
  return out === data ? Float64Array.from(data) : out;
}

function boxBlur1D(buf: Float64Array, r: number): Float64Array {
  const n = buf.length;
  const winSize = 2 * r + 1;
  const dst = new Float64Array(n);
  let s = 0;
  for (let k = -r; k <= r; k++) {
    const xi = Math.min(n - 1, Math.max(0, k));
    s += buf[xi];
  }
  for (let i = 0; i < n; i++) {
    dst[i] = s / winSize;
    const xOut = Math.min(n - 1, Math.max(0, i - r));
    const xIn = Math.min(n - 1, Math.max(0, i + r + 1));
    s += buf[xIn] - buf[xOut];
  }
  return dst;
}

export function gaussianFilter1D(data: Float64Array, sigma: number): Float64Array {
  if (sigma <= 5) {
    const k = gaussianKernel(sigma);
    const n = data.length;
    const out = new Float64Array(n);
    const r = (k.length - 1) >> 1;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) {
        let xi = i + j;
        if (xi < 0) xi = 0;
        else if (xi >= n) xi = n - 1;
        s += data[xi] * k[j + r];
      }
      out[i] = s;
    }
    return out;
  }
  let buf = data;
  for (const r of boxRadii(sigma)) buf = boxBlur1D(buf, r);
  return buf === data ? Float64Array.from(data) : buf;
}

/** Separable max filter: max along x (radius 4) then y (radius 4). O(w*h*9) instead of O(w*h*81) */
export function maxFilter9(data: Float64Array, w: number, h: number): Float64Array {
  const r = 4;
  // pass 1: along x
  const tmp = new Float64Array(data.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      for (let xx = x0; xx <= x1; xx++) {
        const v = data[row + xx];
        if (v > m) m = v;
      }
      tmp[row + x] = m;
    }
  }
  // pass 2: along y
  const out = new Float64Array(data.length);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = -Infinity;
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let yy = y0; yy <= y1; yy++) {
        const v = tmp[yy * w + x];
        if (v > m) m = v;
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/** PRNG deterministik kecil (mulberry32) agar sampling reproducible */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1D median absolute deviation scaled to std, using a random sample for large arrays */
export function madStd(data: Float64Array, valid: Uint8Array): number {
  const total = data.length;
  const SAMPLE_LIMIT = 20000;
  const vals: number[] = [];
  if (total <= SAMPLE_LIMIT) {
    for (let i = 0; i < total; i++) if (valid[i]) vals.push(data[i]);
  } else {
    // sampling acak deterministik: stride tetap bisa selaras dengan lebar gambar (aliasing kolom)
    const rnd = mulberry32(12345);
    for (let s = 0; s < SAMPLE_LIMIT; s++) {
      const i = Math.floor(rnd() * total);
      if (valid[i]) vals.push(data[i]);
    }
  }
  if (vals.length === 0) return 0;
  const sorted = Float64Array.from(vals).sort();
  const med = sorted[sorted.length >> 1];
  const absDevs = new Float64Array(sorted.length);
  for (let i = 0; i < sorted.length; i++) absDevs[i] = Math.abs(sorted[i] - med);
  absDevs.sort();
  return 1.4826 * absDevs[absDevs.length >> 1];
}

/** Percentile on values > 0, using a sample for large arrays */
export function percentilePos(data: Float64Array, p: number): number {
  const vals: number[] = [];
  const total = data.length;
  const SAMPLE_LIMIT = 20000;
  if (total <= SAMPLE_LIMIT) {
    for (let i = 0; i < total; i++) if (data[i] > 0) vals.push(data[i]);
  } else {
    const stride = Math.max(1, Math.floor(total / SAMPLE_LIMIT));
    for (let i = 0; i < total; i += stride) if (data[i] > 0) vals.push(data[i]);
  }
  if (vals.length === 0) return 0;
  const sorted = Float64Array.from(vals).sort();
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function percentile(data: Float64Array, p: number): number {
  const total = data.length;
  if (total === 0) return 0;
  const SAMPLE_LIMIT = 20000;
  let sorted: Float64Array;
  if (total <= SAMPLE_LIMIT) {
    sorted = Float64Array.from(data);
  } else {
    const stride = Math.max(1, Math.floor(total / SAMPLE_LIMIT));
    const vals: number[] = [];
    for (let i = 0; i < total; i += stride) vals.push(data[i]);
    sorted = Float64Array.from(vals);
  }
  sorted.sort(); // Float64Array.sort() default = numerik
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(data: Float64Array): number {
  if (data.length === 0) return 0;
  const sorted = Float64Array.from(data).sort();
  return sorted[sorted.length >> 1];
}

/** Distance transform via two-pass chamfer (approximate, adequate for finding largest interior point) */
export function distanceTransformEdt(foreground: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h).fill(Infinity);
  const a = 1, b = 1.41421356;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!foreground[i]) { out[i] = 0; continue; }
      let m = Infinity;
      if (x > 0) m = Math.min(m, out[i - 1] + a);
      if (y > 0) {
        m = Math.min(m, out[i - w] + a);
        if (x > 0) m = Math.min(m, out[i - w - 1] + b);
        if (x < w - 1) m = Math.min(m, out[i - w + 1] + b);
      }
      out[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!foreground[i]) continue;
      let m = out[i];
      if (x < w - 1) m = Math.min(m, out[i + 1] + a);
      if (y < h - 1) {
        m = Math.min(m, out[i + w] + a);
        if (x < w - 1) m = Math.min(m, out[i + w + 1] + b);
        if (x > 0) m = Math.min(m, out[i + w - 1] + b);
      }
      out[i] = m;
    }
  }
  return out;
}

/** Connected-component label (4-conn), returns count and label array. */
export function label(binary: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h).fill(0);
  let cur = 0;
  const stack: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] && labels[i] === 0) {
      cur++;
      labels[i] = cur;
      stack.length = 0;
      stack.push(i);
      while (stack.length) {
        const p = stack.pop()!;
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && binary[p - 1] && labels[p - 1] === 0) { labels[p - 1] = cur; stack.push(p - 1); }
        if (x < w - 1 && binary[p + 1] && labels[p + 1] === 0) { labels[p + 1] = cur; stack.push(p + 1); }
        if (y > 0 && binary[p - w] && labels[p - w] === 0) { labels[p - w] = cur; stack.push(p - w); }
        if (y < h - 1 && binary[p + w] && labels[p + w] === 0) { labels[p + w] = cur; stack.push(p + w); }
      }
    }
  }
  return { labels, count: cur };
}

export function componentSum(mask: Uint8Array, labels: Int32Array, count: number): Float64Array {
  const out = new Float64Array(count + 1);
  for (let i = 0; i < mask.length; i++) {
    if (labels[i] > 0) out[labels[i]] += mask[i];
  }
  return out;
}

/** Downsample an image by an integer factor using averaging */
export function downsample(data: Float64Array, w: number, h: number, factor: number): { data: Float64Array; w: number; h: number } {
  if (factor <= 1) return { data, w, h };
  const nw = Math.floor(w / factor), nh = Math.floor(h / factor);
  const out = new Float64Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let s = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          s += data[(y * factor + dy) * w + (x * factor + dx)];
        }
      }
      out[y * nw + x] = s / (factor * factor);
    }
  }
  return { data: out, w: nw, h: nh };
}