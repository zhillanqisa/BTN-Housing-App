// Konfigurasi aplikasi. Semua ambang dan asumsi ditulis terbuka di sini
// dan ditampilkan di halaman "Data & Metode".
import type { Kategori, Position, Tenor, Thresholds, Tema } from './types'

export const APP = {
  nama: 'SubTen',
  /** Sub(sidence) x Ten(or): penurunan tanah dibaca sepanjang masa cicilan. */
  kepanjangan: 'Subsidence × Tenor',
  tagline: 'Cek Tanah Sebelum KPR',
  wilayah: 'Kota Semarang',
} as const

export const TENORS: Tenor[] = [10, 15, 20]
export const DEFAULT_TENOR: Tenor = 15

/** ASUMSI AWAL (belum diuji sensitivitas oleh tim): ambang kategori dalam cm/tahun. */
export const DEFAULT_THRESHOLDS: Thresholds = { sedang: 2, tinggi: 4 }
export const THRESHOLD_LIMITS = { min: 0.5, max: 10, step: 0.5 } as const

/** Batas kelas peta mode "laju" (cm/tahun). 5 kelas: <2, 2-4, 4-6, 6-8, >8. */
export const LAJU_BINS = [2, 4, 6, 8] as const
export const LAJU_BIN_LABELS = ['< 2', '2–4', '4–6', '6–8', '> 8'] as const

/** Warna harus sama dengan token --ramp-* / --kat-* di styles/app.css. */
export const RAMP: Record<Tema, string[]> = {
  light: ['#dcd6fa', '#b6a8f3', '#8f7be8', '#6a4fd3', '#46289f'],
  dark: ['#2f2a55', '#453c8a', '#5f51c0', '#8573e6', '#b9adf7'],
}
export const WARNA_KATEGORI: Record<Tema, Record<Kategori, string>> = {
  light: { rendah: '#b6a8f3', sedang: '#7b62dd', tinggi: '#46289f', 'tidak-memadai': '#c9c9d1' },
  dark: { rendah: '#5448ad', sedang: '#8573e6', tinggi: '#c3b9fa', 'tidak-memadai': '#3a3a46' },
}

export const LABEL_KATEGORI: Record<Kategori, string> = {
  rendah: 'Rendah',
  sedang: 'Sedang',
  tinggi: 'Tinggi',
  'tidak-memadai': 'Data tidak memadai',
}
export const URUTAN_KATEGORI: Kategori[] = ['rendah', 'sedang', 'tinggi', 'tidak-memadai']

export const MAP = {
  center: [110.405, -7.002] as Position,
  zoom: 11.15,
  pitch: 52,
  bearing: -14,
  minZoom: 9.5,
  maxZoom: 17.5,
  // cukup luas untuk semua wilayah di pesisir utara Jawa (Jakarta sampai Demak)
  maxBounds: [
    [105.9, -7.7],
    [111.6, -5.6],
  ] as [Position, Position],
  styles: {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
  } as Record<Tema, string>,
} as const

/** Nominatim (OSM). Kebijakan publik: maks 1 permintaan/detik, TANPA autocomplete.
 *  Karena itu pencarian daring hanya dikirim saat pengguna menekan Enter / tombol Cari. */
export const NOMINATIM = {
  url: 'https://nominatim.openstreetmap.org/search',
  /** barat,utara,timur,selatan */
  viewbox: '110.26,-6.92,110.52,-7.12',
} as const

export const MAKS_BANDING = 3

/** ASUMSI: laporan titik dihitung dari blok BLOK_PIKSEL x BLOK_PIKSEL piksel di sekitar titik
 *  (3 x 80 m = sekitar 240 m) dan dianggap memadai bila minimal MIN_PIKSEL_BLOK piksel terukur. */
export const BLOK_PIKSEL = 3
export const MIN_PIKSEL_BLOK = 4

/** Batasan produk. Wajib tampil di laporan, PDF, dan halaman metode.
 *  titik=true: angka dari blok piksel di sekitar titik; false: rata-rata kelurahan. */
export function batasan(titik: boolean, lebarBlokM = 240): string[] {
  return [
    titik
      ? `Laporan ini menggambarkan blok sekitar ${lebarBlokM} m di sekitar titik, bukan satu bangunan.`
      : 'Laporan ini bersifat kawasan (kelurahan), bukan per bangunan.',
    ...BATASAN_UMUM,
  ]
}

const BATASAN_UMUM: string[] = [
  'Kategori bukan jaminan bahwa suatu rumah aman atau tidak aman.',
  'Tidak menggantikan pemeriksaan legalitas tanah, survei geoteknik, penilaian bangunan, atau prosedur pembiayaan resmi.',
  'Proyeksi adalah perpanjangan tren masa lalu. Tren bisa berubah, jadi selalu dibaca "jika tren bertahan".',
  'Informasi ini untuk membantu adaptasi, bukan dasar menolak pengajuan KPR.',
]

export const PRINSIP = 'Informasi untuk adaptasi, bukan penolakan.'
