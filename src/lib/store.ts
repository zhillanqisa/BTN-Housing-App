// State aplikasi (zustand). Satu sumber kebenaran untuk dataset, pilihan lokasi,
// tenor, ambang kategori, daftar banding, dan tampilan peta.
import { create } from 'zustand'
import { DEFAULT_TENOR, DEFAULT_THRESHOLDS, MAKS_BANDING, THRESHOLD_LIMITS } from './config'
import { ambilDatasetDemo, cariKawasanDiTitik, indeksKawasan } from './data'
import type { AsalPilihan, Dataset, DatasetMeta, Kawasan, ModePeta, Position, Selection, Tema, Tenor, Thresholds } from './types'

let indeks = new Map<string, Kawasan>()

/** Ambil kawasan dari indeks (di luar React). */
export function kawasanById(id: string | null | undefined): Kawasan | null {
  return id ? (indeks.get(id) ?? null) : null
}

function temaAwal(): Tema {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

function rapikanAmbang(t: Thresholds): Thresholds {
  const { min, max, step } = THRESHOLD_LIMITS
  const snap = (v: number) => Math.round(Math.min(max, Math.max(min, v)) / step) * step
  let sedang = snap(t.sedang)
  let tinggi = snap(t.tinggi)
  if (tinggi <= sedang) {
    if (sedang + step <= max) tinggi = sedang + step
    else sedang = tinggi - step
  }
  return { sedang, tinggi }
}

export interface AppState {
  status: 'memuat' | 'siap' | 'gagal'
  galat: string | null
  meta: DatasetMeta | null
  kawasan: Kawasan[]
  /** Naik setiap dataset diganti; dipakai peta untuk setData. */
  versiData: number
  thresholds: Thresholds
  tenor: Tenor
  selection: Selection | null
  /** id kawasan yang dibandingkan (maks 3) */
  banding: string[]
  tema: Tema
  modePeta: ModePeta
  tigaD: boolean

  muatDemo: () => Promise<void>
  pakaiDataset: (ds: Dataset) => void
  pilihTitik: (lngLat: Position, asal: AsalPilihan, label?: string) => void
  pilihKawasan: (id: string, asal: AsalPilihan) => void
  tutupLaporan: () => void
  setTenor: (t: Tenor) => void
  setThresholds: (t: Thresholds) => void
  resetThresholds: () => void
  toggleBanding: (id: string) => void
  kosongkanBanding: () => void
  setTema: (t: Tema) => void
  setModePeta: (m: ModePeta) => void
  setTigaD: (v: boolean) => void
}

export const useApp = create<AppState>()((set, get) => ({
  status: 'memuat',
  galat: null,
  meta: null,
  kawasan: [],
  versiData: 0,
  thresholds: DEFAULT_THRESHOLDS,
  tenor: DEFAULT_TENOR,
  selection: null,
  banding: [],
  tema: temaAwal(),
  modePeta: 'laju',
  tigaD: true,

  muatDemo: async () => {
    set({ status: 'memuat', galat: null })
    try {
      get().pakaiDataset(await ambilDatasetDemo())
    } catch (e) {
      set({ status: 'gagal', galat: e instanceof Error ? e.message : 'Gagal memuat data.' })
    }
  },

  pakaiDataset: (ds) => {
    const kawasan = indeksKawasan(ds)
    indeks = new Map(kawasan.map((k) => [k.id, k]))
    const sel = get().selection
    const k = sel ? cariKawasanDiTitik(sel.lngLat, kawasan) : null
    set((s) => ({
      status: 'siap',
      galat: null,
      meta: ds.metadata,
      kawasan,
      versiData: s.versiData + 1,
      banding: s.banding.filter((id) => indeks.has(id)),
      selection: sel ? { ...sel, kawasanId: k?.id ?? null } : null,
    }))
  },

  pilihTitik: (lngLat, asal, label) => {
    const k = cariKawasanDiTitik(lngLat, get().kawasan)
    set({ selection: { lngLat, kawasanId: k?.id ?? null, label: label ?? (k ? `Kelurahan ${k.nama}` : 'Titik pilihan'), asal } })
  },

  pilihKawasan: (id, asal) => {
    const k = kawasanById(id)
    if (!k) return
    set({ selection: { lngLat: k.pusat, kawasanId: k.id, label: `Kelurahan ${k.nama}`, asal } })
  },

  tutupLaporan: () => set({ selection: null }),
  setTenor: (tenor) => set({ tenor }),
  setThresholds: (t) => set({ thresholds: rapikanAmbang(t) }),
  resetThresholds: () => set({ thresholds: DEFAULT_THRESHOLDS }),

  toggleBanding: (id) =>
    set((s) => {
      if (s.banding.includes(id)) return { banding: s.banding.filter((x) => x !== id) }
      if (s.banding.length >= MAKS_BANDING || !indeks.has(id)) return s
      return { banding: [...s.banding, id] }
    }),
  kosongkanBanding: () => set({ banding: [] }),

  setTema: (tema) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', tema)
      try {
        localStorage.setItem('pa-tema', tema)
      } catch {
        /* penyimpanan lokal tidak tersedia: abaikan */
      }
    }
    set({ tema })
  },
  setModePeta: (modePeta) => set({ modePeta }),
  setTigaD: (tigaD) => set({ tigaD }),
}))

/** Hook: kawasan berdasarkan id (re-render saat dataset diganti). */
export function useKawasan(id: string | null | undefined): Kawasan | null {
  return useApp((s) => (id ? (s.kawasan.find((k) => k.id === id) ?? null) : null))
}

/** Jembatan non-reaktif ke peta: gambar untuk PDF dan perintah kamera dari tombol kontrol. */
export const jembatanPeta: {
  ambilGambar: (() => string | null) | null
  zoom: ((delta: number) => void) | null
  aturUlang: (() => void) | null
} = { ambilGambar: null, zoom: null, aturUlang: null }
