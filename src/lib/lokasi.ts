// Bacaan satu lokasi: dari blok piksel di sekitar titik, atau dari kelurahan bila data tanpa grid.
import { cariKawasanDiTitik } from './data'
import { statistikTitik, type Grid } from './grid'
import type { Kawasan, Position } from './types'

export const LABEL_TITIK = 'Titik pilihan'

export interface Bacaan {
  /** titik = angka dari blok piksel di sekitar titik; kawasan = rata-rata kelurahan (data tanpa grid) */
  mode: 'titik' | 'kawasan'
  /** kelurahan tempat titik berada, dengan agregat aslinya */
  kelurahan: Kawasan
  /** angka yang dilaporkan. Berbentuk Kawasan supaya komponen laporan dan PDF dipakai ulang. */
  data: Kawasan
  /** mode titik: jumlah piksel blok yang berada di dalam wilayah */
  nBlok: number
}

/** null bila titik berada di luar wilayah uji. */
export function bacaLokasi(lngLat: Position, kawasan: Kawasan[], grid: Grid | null): Bacaan | null {
  const kelurahan = cariKawasanDiTitik(lngLat, kawasan)
  if (!kelurahan) return null
  if (!grid) return { mode: 'kawasan', kelurahan, data: kelurahan, nBlok: 0 }
  const s = statistikTitik(grid, lngLat)
  return {
    mode: 'titik',
    kelurahan,
    nBlok: s.nBlok,
    data: { ...kelurahan, laju: s.laju, sigma: s.sigma, sebaran: s.sebaran, nPiksel: s.nPiksel, koherensi: null, memadai: s.memadai, deret: s.deret },
  }
}

/** Kunci stabil sebuah titik (5 desimal, sekitar 1 m): untuk daftar banding dan key React. */
export const kunciTitik = (p: Position): string => `${p[1].toFixed(5)},${p[0].toFixed(5)}`
