// Penampang tanah sederhana per jenis satuan geologi, untuk visual laporan (SVG di aplikasi, vektor di PDF).
// Ini gambaran umum susunan lapisan, bukan hasil bor di titik yang dipilih.
import type { DayaTanah, StatusHunian } from './penjelasan'

export type PolaLapisan = 'titik' | 'gelombang' | 'arsir'

export interface Lapisan {
  nama: string
  /** Bagian dari tinggi penampang (jumlah semua lapisan = 1). */
  porsi: number
  warna: string
  pola: PolaLapisan
  /** Satuan yang dipetakan di titik ini. */
  utama?: boolean
}

export interface Penampang {
  lapisan: Lapisan[]
  /** Gambar pondasi tiang sampai lapisan terbawah. */
  tiang: boolean
  /** Panah "memadat" di lapisan utama. */
  memadat: boolean
}

export const CATATAN_PENAMPANG = 'Gambaran umum susunan lapisan, bukan hasil bor di titik ini.'

const URUKAN = '#cbb89a'
const PASIR = '#e3d2a2'
const KERAS = '#9a958c'
const PELAPUKAN = '#c7a57f'

export function penampang(daya: DayaTanah, warnaUtama: string, namaUtama: string): Penampang {
  if (daya === 'lunak') {
    return {
      lapisan: [
        { nama: 'Urukan', porsi: 0.1, warna: URUKAN, pola: 'titik' },
        { nama: `${namaUtama}: lempung dan lanau lunak`, porsi: 0.55, warna: warnaUtama, pola: 'gelombang', utama: true },
        { nama: 'Pasir dan kerikil', porsi: 0.15, warna: PASIR, pola: 'titik' },
        { nama: 'Lapisan keras', porsi: 0.2, warna: KERAS, pola: 'arsir' },
      ],
      tiang: true,
      memadat: true,
    }
  }
  if (daya === 'sedang') {
    return {
      lapisan: [
        { nama: `${namaUtama}: pasir`, porsi: 0.5, warna: warnaUtama, pola: 'titik', utama: true },
        { nama: 'Lempung (bisa ada)', porsi: 0.15, warna: '#cfc6b8', pola: 'gelombang' },
        { nama: 'Lapisan keras', porsi: 0.35, warna: KERAS, pola: 'arsir' },
      ],
      tiang: false,
      memadat: false,
    }
  }
  return {
    lapisan: [
      { nama: 'Tanah pelapukan', porsi: 0.18, warna: PELAPUKAN, pola: 'titik' },
      { nama: `${namaUtama}: batuan padat`, porsi: 0.82, warna: warnaUtama, pola: 'arsir', utama: true },
    ],
    tiang: false,
    memadat: false,
  }
}

/** Skala tiga tingkat untuk visual: urutan kiri ke kanan. */
export const SKALA_HUNIAN: { nilai: StatusHunian; label: string }[] = [
  { nilai: 'tidak', label: 'Bukan hunian' },
  { nilai: 'terbatas', label: 'Terbatas' },
  { nilai: 'sesuai', label: 'Hunian' },
]
export const SKALA_DAYA: { nilai: DayaTanah; label: string }[] = [
  { nilai: 'padat', label: 'Padat' },
  { nilai: 'sedang', label: 'Sedang' },
  { nilai: 'lunak', label: 'Lunak' },
]
/** Kelas indeks bahaya BNPB (lapis banjir dan abrasi). */
export const SKALA_BAHAYA: { nilai: 'rendah' | 'sedang' | 'tinggi'; label: string }[] = [
  { nilai: 'rendah', label: 'Rendah' },
  { nilai: 'sedang', label: 'Sedang' },
  { nilai: 'tinggi', label: 'Tinggi' },
]

/** Langkah mencocokkan persil di BHUMI. */
export const LANGKAH_PERSIL = ['Buka peta BHUMI', 'Cari titik ini (koordinat sudah disalin)', 'Cocokkan bidang dan NIB dengan sertifikat']

/** Setengah lebar peta mini di PDF (m): kelas konteks di sekitar titik. */
export const RADIUS_PETA_MINI_M = 600
