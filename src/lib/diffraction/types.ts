export type ImageInput = {
  id: string;
  name: string;
  /** grayscale 2D array (row-major), values 0..65535 */
  data: Float64Array;
  width: number;
  height: number;
  /** original file */
  file: File;
};

export type BeamStopInfo = {
  headX: number;
  headY: number;
  headRadius: number;
  arm: BeamStopArm;
};

export type BeamStopArm = 'auto' | 'right' | 'left' | 'up' | 'down' | 'none';

export type DetectedRing = {
  index: number;
  R_px: number;
  nSpot: number;
  cx: number;
  cy: number;
};

export type DetectionResult = {
  id: string;
  name: string;
  kv: number;
  cameraLengthM: number;
  cx: number;
  cy: number;
  rings: DetectedRing[];
  spots: Array<{ x: number; y: number }>;
  imageData: Float64Array;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  pixelScale: number;
  report: string[];
  radialProfile: { r: number; density: number }[];
};

export type RingResult = {
  hkl: string;
  d_nm: number;
  d_pred_nm: number;
  d_selisih_nm: number;
  d_selisihPct: number;
  R_pred: number;
  R_px: number;
  found: boolean;
  nSpot: number;
  sd: number;
  used: boolean;
  K: number;
  selisihPct: number;
};

export type AnalysisResult = {
  id: string;
  name: string;
  kv: number;
  cameraLengthM: number;
  lambda_nm: number;
  cx: number;
  cy: number;
  K: number;
  g: number;
  pix_um: number;
  nCincin: number;
  sebaranPct: number;
  rings: RingResult[];
  spots: Array<{ x: number; y: number }>;
  imageData: Float64Array;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  /** Original source pixels represented by one working-image pixel. */
  pixelScale: number;
  report: string[];
  radialProfile: { r: number; density: number }[];
};

export type MaterialStandard = {
  name: string;
  a_nm: number | null;
  /** d-spacings in Angstrom keyed by hkl */
  table: Record<string, number>;
};

export type MaterialId = 'al' | 'gold' | 'zno' | 'sio2_ni' | 'tio2' | 'tio2_au' | 'tio2_nw' | 'tio2_np' | 'custom';

export type AnalysisParams = {
  kv: number;
  cameraLengthM: number;
  material: MaterialId;
  /** d-spacing reference map from a validated database material, in nm */
  referenceDnm?: Record<string, number>;
  customA_nm: number | null;
  hklList: string[];
  cropBottom: number | null;
  arm: BeamStopArm;
  kSigma: number;
  tolerance: number;
  refineCenter: boolean;
  rMin: number | null;
  rMax: number | null;
};

export type MaterialDef = {
  id: MaterialId;
  label: string;
  /** d-spacings in Angstrom keyed by hkl */
  table: Record<string, number>;
  /** default hkl list for this material */
  defaultHkl: string[];
  /** whether to auto-populate hkl list when material selected */
  autoHkl: boolean;
};

export const AL_STANDARD: Record<string, number> = {
  '111': 2.338, '200': 2.024, '220': 1.431, '311': 1.221, '222': 1.1690,
  '400': 1.0124, '331': 0.9289, '420': 0.9055, '422': 0.8266,
};

export const AU_STANDARD: Record<string, number> = {
  '111': 2.355, '200': 2.039, '220': 1.442, '311': 1.230, '222': 1.1774,
  '400': 1.0196, '331': 0.9358, '420': 0.9120, '422': 0.8329,
};

export const DEFAULT_HKL = ['111', '200', '220', '311', '222', '400', '331', '420', '422'];

// --- New materials (non-cubic; d-spacings precomputed in Angstrom) ---

// ZnO wurtzite (a=0.3249 nm, c=0.5206 nm) — JCPDS 36-1451
export const ZNO_STANDARD: Record<string, number> = {
  '100': 2.814, '002': 2.603, '101': 2.476, '102': 1.911, '110': 1.625,
  '103': 1.477, '200': 1.407, '112': 1.379, '201': 1.357, '004': 1.302,
  '202': 1.238, '104': 1.180, '203': 1.093, '210': 1.063, '211': 1.024,
};

// SiO2-Ni (Ni-embedded amorphous SiO2 reference — Ni fcc, a=0.3524 nm)
// Dominant rings from Ni crystalline inclusions in silica matrix
export const SIO2_NI_STANDARD: Record<string, number> = {
  '111': 2.034, '200': 1.762, '220': 1.246, '311': 1.062, '222': 1.017,
  '400': 0.881, '331': 0.808, '420': 0.788, '422': 0.719,
};

// TiO2 anatase (tetragonal, a=0.3784 nm, c=0.9515 nm) — JCPDS 21-1272
export const TIO2_STANDARD: Record<string, number> = {
  '101': 3.520, '103': 2.431, '004': 2.378, '112': 2.333, '200': 1.892,
  '105': 1.700, '211': 1.667, '213': 1.481, '204': 1.501, '116': 1.365,
  '220': 1.339, '215': 1.265, '301': 1.264,
};

// TiO2-Au (Au-decorated TiO2 — composite: Au fcc + anatase TiO2)
// Strongest Au rings first, then anatase, for calibration of Au/TiO2 hybrids
export const TIO2_AU_STANDARD: Record<string, number> = {
  '111': 2.355, '200': 2.039, '220': 1.442, '311': 1.230, '222': 1.1774,
  '101': 3.520, '004': 2.378, '200a': 1.892, '211a': 1.667, '220a': 1.339,
};

// TiO2-NW (TiO2 nanowires — rutile, tetragonal a=0.4594 nm, c=0.2959 nm) JCPDS 21-1276
export const TIO2_NW_STANDARD: Record<string, number> = {
  '110': 3.248, '101': 2.487, '200': 2.297, '111': 2.188, '210': 2.054,
  '211': 1.687, '220': 1.624, '002': 1.479, '310': 1.453, '301': 1.359,
  '112': 1.344, '301b': 1.341, '202': 1.245,
};

// TiO2-NP (TiO2 nanoparticles — anatase, same as TIO2 but broader peaks;
// distinct entry so user can label samples differently)
export const TIO2_NP_STANDARD: Record<string, number> = {
  '101': 3.520, '103': 2.431, '004': 2.378, '112': 2.333, '200': 1.892,
  '105': 1.700, '211': 1.667, '213': 1.481, '204': 1.501, '116': 1.365,
  '220': 1.339, '215': 1.265, '301': 1.264,
};

export const ZNO_HKL = ['100', '002', '101', '102', '110', '103', '200', '112', '201', '004'];
export const SIO2_NI_HKL = ['111', '200', '220', '311', '222', '400', '331', '420', '422'];
export const TIO2_HKL = ['101', '103', '004', '112', '200', '105', '211', '204', '116', '220', '215'];
export const TIO2_AU_HKL = ['111', '200', '220', '311', '222', '101', '004', '200a', '211a', '220a'];
export const TIO2_NW_HKL = ['110', '101', '200', '111', '210', '211', '220', '002', '310', '301', '112', '202'];
export const TIO2_NP_HKL = ['101', '103', '004', '112', '200', '105', '211', '204', '116', '220', '215'];

// Physical constants
export const H_PLANCK = 6.62607015e-34;
export const M_E = 9.1093837015e-31;
export const Q_E = 1.602176634e-19;
export const C_LIGHT = 299792458.0;
