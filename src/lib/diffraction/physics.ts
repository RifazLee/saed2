import {
  H_PLANCK, M_E, Q_E, C_LIGHT,
  AL_STANDARD, AU_STANDARD,
  ZNO_STANDARD, SIO2_NI_STANDARD,
  TIO2_STANDARD, TIO2_AU_STANDARD, TIO2_NW_STANDARD, TIO2_NP_STANDARD,
  DEFAULT_HKL, ZNO_HKL, SIO2_NI_HKL, TIO2_HKL, TIO2_AU_HKL, TIO2_NW_HKL, TIO2_NP_HKL,
  type MaterialId, type MaterialDef,
} from './types';

/** Relativistic de Broglie wavelength (nm) for accelerating voltage kV */
export function electronWavelengthNm(kv: number): number {
  const v = kv * 1e3;
  const lam = H_PLANCK / Math.sqrt(2 * M_E * Q_E * v * (1 + (Q_E * v) / (2 * M_E * C_LIGHT ** 2)));
  return lam * 1e9;
}

/** d-spacing (nm) from hkl string + lattice constant a (nm) — cubic only */
export function dFromHkl(hkl: string, a_nm: number): number {
  const h = parseInt(hkl[0]);
  const k = parseInt(hkl[1]);
  const l = parseInt(hkl[2]);
  return a_nm / Math.sqrt(h * h + k * k + l * l);
}

/** All material definitions in one place */
export const MATERIALS: MaterialDef[] = [
  { id: 'al',       label: 'Aluminium fcc (ASTM, Ted Pella 619)', table: AL_STANDARD,         defaultHkl: DEFAULT_HKL,    autoHkl: false },
  { id: 'gold',     label: 'Emas fcc (a = 0.4078 nm)',            table: AU_STANDARD,         defaultHkl: DEFAULT_HKL,    autoHkl: false },
  { id: 'zno',      label: 'ZnO wurtzite (JCPDS 36-1451)',         table: ZNO_STANDARD,       defaultHkl: ZNO_HKL,       autoHkl: true  },
  { id: 'sio2_ni',  label: 'SiO2-Ni (Ni fcc inklusi)',            table: SIO2_NI_STANDARD,   defaultHkl: SIO2_NI_HKL,   autoHkl: true  },
  { id: 'tio2',     label: 'TiO2 anatase (JCPDS 21-1272)',         table: TIO2_STANDARD,      defaultHkl: TIO2_HKL,      autoHkl: true  },
  { id: 'tio2_au',  label: 'TiO2-Au (Au + anatase)',              table: TIO2_AU_STANDARD,    defaultHkl: TIO2_AU_HKL,   autoHkl: true  },
  { id: 'tio2_nw',  label: 'TiO2 nanowire (rutile, 21-1276)',     table: TIO2_NW_STANDARD,   defaultHkl: TIO2_NW_HKL,   autoHkl: true  },
  { id: 'tio2_np',  label: 'TiO2 nanopartikel (anatase)',         table: TIO2_NP_STANDARD,    defaultHkl: TIO2_NP_HKL,   autoHkl: true  },
  { id: 'custom',   label: 'Custom — masukkan konstanta kisi',   table: {},                  defaultHkl: DEFAULT_HKL,    autoHkl: false },
];

export const MATERIAL_MAP: Record<MaterialId, MaterialDef> =
  Object.fromEntries(MATERIALS.map(m => [m.id, m])) as Record<MaterialId, MaterialDef>;

/** Resolve d-spacings (nm) for a material */
export function resolveDnm(
  material: MaterialId,
  customA_nm: number | null,
  hklList: string[],
  referenceDnm?: Record<string, number>,
): Record<string, number> {
  if (referenceDnm) return Object.fromEntries(hklList.map(k => [k, referenceDnm[k]]));
  if (material === 'custom' && customA_nm != null) {
    const out: Record<string, number> = {};
    for (const k of hklList) out[k] = dFromHkl(k, customA_nm);
    return out;
  }
  const def = MATERIAL_MAP[material];
  const table = def?.table ?? {};
  const out: Record<string, number> = {};
  for (const k of hklList) {
    if (table[k] == null) {
      if (customA_nm != null) out[k] = dFromHkl(k, customA_nm);
      else throw new Error(`hkl ${k} not in ${def?.label ?? material} standard table; provide lattice constant.`);
    } else {
      out[k] = table[k] / 10.0; // Å -> nm
    }
  }
  return out;
}

export const MATERIAL_NAMES: Record<MaterialId, string> =
  Object.fromEntries(MATERIALS.map(m => [m.id, m.label])) as Record<MaterialId, string>;

export { DEFAULT_HKL };
