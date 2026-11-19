// State aplikasi (zustand). Satu sumber kebenaran untuk dataset, grid piksel, pilihan lokasi,
// tenor, ambang kategori, daftar banding, dan tampilan peta.
import { useMemo } from 'react'
import { create } from 'zustand'
import { DEFAULT_TENOR, DEFAULT_THRESHOLDS, MAKS_BANDING, THRESHOLD_LIMITS } from './config'
import { ambilDatasetDemo, cariKawasanDiTitik, indeksKawasan } from './data'
import { ambilDeret, ambilGrid, type Grid } from './grid'
import { ambilKonteks, JENIS_LAPIS, type JenisLapis, type LapisKonteks } from './konteks'
import { bacaLokasi, kunciTitik, LABEL_TITIK, type Bacaan } from './lokasi'
import { urlWilayah, WILAYAH_AWAL, wilayahDiTitik, type IdWilayah } from './wilayah'
import type { AsalPilihan, Dataset, DatasetMeta, Kawasan, ModePeta, Position, Selection, Tema, Tenor, Thresholds, TitikBanding } from './types'

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
  /** Grid piksel. null = data tanpa grid (mis. unggahan per kelurahan): laporan memakai rata-rata kelurahan. */
  grid: Grid | null
  /** Naik setiap dataset diganti; dipakai peta untuk setData. */
  versiData: number
  /** Naik saat grid diganti atau deret waktunya selesai dimuat. */
  versiGrid: number
  thresholds: Thresholds
  tenor: Tenor
  selection: Selection | null
  /** Titik yang dibandingkan (maks MAKS_BANDING) */
  banding: TitikBanding[]
  tema: Tema
  modePeta: ModePeta
  tigaD: boolean
  /** Lapis konteks yang sudah termuat (pola ruang, geologi). Tidak bergantung pada dataset laju. */
  konteks: Partial<Record<JenisLapis, LapisKonteks>>
  /** Lapis konteks yang ditampilkan di peta. null = hanya laju. */
  lapisKonteks: JenisLapis | null
  /** Wilayah yang sedang dibuka. Semua data (kelurahan, grid, konteks) milik wilayah ini. */
  wilayah: IdWilayah

  muatDemo: () => Promise<void>
  /** Pindah wilayah: muat datanya; pilihan titik dipertahankan hanya bila ada di wilayah baru. */
  pilihWilayah: (w: IdWilayah) => Promise<void>
  pakaiDataset: (ds: Dataset, grid?: Grid | null) => void
  pilihTitik: (lngLat: Position, asal: AsalPilihan, label?: string) => void
  pilihKawasan: (id: string, asal: AsalPilihan) => void
  tutupLaporan: () => void
  setTenor: (t: Tenor) => void
  setThresholds: (t: Thresholds) => void
  resetThresholds: () => void
  toggleBanding: (t: TitikBanding) => void
  kosongkanBanding: () => void
  setTema: (t: Tema) => void
  setModePeta: (m: ModePeta) => void
  setTigaD: (v: boolean) => void
  setLapisKonteks: (l: JenisLapis | null) => void
}

let mintaKe = 0
/** Wilayah milik data yang sedang terpasang; beda dengan state.wilayah selama data wilayah baru dimuat. */
let wilayahTermuat: IdWilayah | null = null

export const useApp = create<AppState>()((set, get) => ({
  status: 'memuat',
  galat: null,
  meta: null,
  kawasan: [],
  grid: null,
  versiData: 0,
  versiGrid: 0,
  thresholds: DEFAULT_THRESHOLDS,
  tenor: DEFAULT_TENOR,
  selection: null,
  banding: [],
  tema: temaAwal(),
  modePeta: 'laju',
  tigaD: true,
  konteks: {},
  lapisKonteks: null,
  wilayah: WILAYAH_AWAL,

  muatDemo: async () => {
    const w = get().wilayah
    const url = urlWilayah(w)
    // permintaan lama yang selesai belakangan tidak boleh menimpa wilayah yang baru dipilih
    const ke = ++mintaKe
    set({ status: 'memuat', galat: null, konteks: {} })
    // lapis konteks kecil dan tidak wajib, dimuat di samping data utama
    for (const j of JENIS_LAPIS) {
      void ambilKonteks(j, url.konteks[j]).then((l) => {
        if (l && ke === mintaKe) set((s) => ({ konteks: { ...s.konteks, [j]: l } }))
      })
    }
    try {
      const [ds, grid] = await Promise.all([ambilDatasetDemo(url.kawasan), ambilGrid(url.grid)])
      if (ke !== mintaKe) return
      get().pakaiDataset(ds, grid)
      wilayahTermuat = w
      // deret waktu adalah file terbesar: dimuat setelah peta dan laju tampil
      if (grid) {
        void ambilDeret(grid, url.grid).then((ok) => {
          if (ok && get().grid === grid) set((s) => ({ versiGrid: s.versiGrid + 1 }))
        })
      }
    } catch (e) {
      if (ke !== mintaKe) return
      const galat = e instanceof Error ? e.message : 'Gagal memuat data.'
      // data wilayah lama tidak boleh tetap tampil di bawah nama wilayah baru
      if (wilayahTermuat !== w) {
        indeks = new Map()
        wilayahTermuat = null
        set((s) => ({ status: 'gagal', galat, meta: null, kawasan: [], grid: null, selection: null, banding: [], versiData: s.versiData + 1, versiGrid: s.versiGrid + 1 }))
      } else set({ status: 'gagal', galat })
    }
  },

  pilihWilayah: async (w) => {
    const s = get()
    if (w === s.wilayah && s.status === 'siap') return
    const sel = s.selection
    const tetap = sel && wilayahDiTitik(sel.lngLat)?.id === w
    // banding antarwilayah belum didukung: daftar banding dikosongkan saat pindah wilayah
    set({ wilayah: w, selection: tetap ? sel : null, banding: [] })
    await get().muatDemo()
  },

  pakaiDataset: (ds, grid = null) => {
    const kawasan = indeksKawasan(ds)
    indeks = new Map(kawasan.map((k) => [k.id, k]))
    const sel = get().selection
    const k = sel ? cariKawasanDiTitik(sel.lngLat, kawasan) : null
    // Label buatan aplikasi mengikuti jenis data: per titik bila ada grid, per kelurahan bila tidak.
    // Label dari pengguna atau pencarian (mis. "Tanah Mas") dibiarkan.
    let label = sel?.label ?? ''
    if (sel && (label === LABEL_TITIK || label.startsWith('Kelurahan ') || label.startsWith('Pusat Kelurahan '))) {
      const diPusat = !!k && kunciTitik(k.pusat) === kunciTitik(sel.lngLat)
      label = grid ? (k && diPusat ? `Pusat Kelurahan ${k.nama}` : LABEL_TITIK) : k ? `Kelurahan ${k.nama}` : LABEL_TITIK
    }
    set((s) => ({
      status: 'siap',
      galat: null,
      meta: ds.metadata,
      kawasan,
      grid,
      versiData: s.versiData + 1,
      versiGrid: s.versiGrid + 1,
      banding: s.banding.filter((t) => cariKawasanDiTitik(t.lngLat, kawasan)),
      selection: sel ? { ...sel, kawasanId: k?.id ?? null, label } : null,
    }))
  },

  pilihTitik: (lngLat, asal, label) => {
    const { kawasan, grid } = get()
    const k = cariKawasanDiTitik(lngLat, kawasan)
    // tanpa grid, angka yang tampil adalah rata-rata kelurahan: beri nama kelurahannya
    const bawaan = !grid && k ? `Kelurahan ${k.nama}` : LABEL_TITIK
    set({ selection: { lngLat, kawasanId: k?.id ?? null, label: label?.trim() || bawaan, asal } })
  },

  pilihKawasan: (id, asal) => {
    const k = kawasanById(id)
    if (!k) return
    // dengan grid, yang dibaca adalah blok piksel di pusat kelurahan, bukan rata-rata kelurahan
    const label = get().grid ? `Pusat Kelurahan ${k.nama}` : `Kelurahan ${k.nama}`
    set({ selection: { lngLat: k.pusat, kawasanId: k.id, label, asal } })
  },

  tutupLaporan: () => set({ selection: null }),
  setTenor: (tenor) => set({ tenor }),
  setThresholds: (t) => set({ thresholds: rapikanAmbang(t) }),
  resetThresholds: () => set({ thresholds: DEFAULT_THRESHOLDS }),

  toggleBanding: (t) =>
    set((s) => {
      const kunci = kunciTitik(t.lngLat)
      if (s.banding.some((x) => kunciTitik(x.lngLat) === kunci)) return { banding: s.banding.filter((x) => kunciTitik(x.lngLat) !== kunci) }
      if (s.banding.length >= MAKS_BANDING || !cariKawasanDiTitik(t.lngLat, s.kawasan)) return s
      return { banding: [...s.banding, { lngLat: t.lngLat, label: t.label }] }
    }),
  kosongkanBanding: () => set({ banding: [] }),

  setTema: (tema) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', tema)
      // warna bilah status di aplikasi terpasang mengikuti tema aplikasi, bukan tema sistem ponsel
      // (selama layar pembuka masih tampil, warnanya tetap navy)
      if (!document.getElementById('pembuka')) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'dark' ? '#0b1220' : '#f1f4f8')
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
  setLapisKonteks: (lapisKonteks) => set({ lapisKonteks }),
}))

/** Hook: bacaan untuk satu titik (blok piksel bila ada grid, kelurahan bila tidak). null = di luar wilayah. */
export function useBacaan(lngLat: Position | null | undefined): Bacaan | null {
  const kawasan = useApp((s) => s.kawasan)
  const grid = useApp((s) => s.grid)
  const versiGrid = useApp((s) => s.versiGrid)
  const lon = lngLat?.[0]
  const lat = lngLat?.[1]
  // versiGrid ikut jadi kunci: deret waktu dipasang ke objek grid yang sama setelah selesai dimuat
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (lon == null || lat == null ? null : bacaLokasi([lon, lat], kawasan, grid)), [lon, lat, kawasan, grid, versiGrid])
}

/** Jembatan non-reaktif ke peta: gambar untuk PDF dan perintah kamera dari tombol kontrol. */
export const jembatanPeta: {
  ambilGambar: (() => string | null) | null
  zoom: ((delta: number) => void) | null
  aturUlang: (() => void) | null
} = { ambilGambar: null, zoom: null, aturUlang: null }
