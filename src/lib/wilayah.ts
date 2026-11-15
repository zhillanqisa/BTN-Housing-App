// Wilayah yang dicakup SubTen. Tiap wilayah punya berkas data sendiri di public/data:
//   <id>-kawasan.geojson, <id>-grid.json (+ .bin), <id>-konteks-{rdtr,rtrw,geologi}.geojson
// Ditulis oleh pipeline/06_ekspor.py dan pipeline/07_konteks.py dengan PA_WILAYAH=<id>.
import type { BBox, Position } from './types'

export type IdWilayah = 'semarang' | 'jakarta' | 'pekalongan' | 'demak'

export interface Tempat {
  label: string
  lngLat: Position
  jenis: 'kelurahan' | 'kecamatan' | 'kawasan' | 'landmark'
  /** titik acuan terdekat (jalan, gedung), bukan pusat kawasan */
  perkiraan?: boolean
  /** tampil sebagai kartu lokasi contoh di peta */
  sorotan?: boolean
}

export interface Wilayah {
  id: IdWilayah
  /** nama resmi, mis. "Kota Semarang" */
  nama: string
  /** nama pendek untuk tombol */
  singkat: string
  /** satu baris keterangan di menu pemilih wilayah */
  keterangan: string
  /** sebutan unit terkecil */
  satuan: 'kelurahan' | 'kelurahan/desa'
  /** [barat, selatan, timur, utara] batas wilayah */
  bbox: BBox
  /** Nominatim: barat,utara,timur,selatan */
  viewbox: string
  /** Koordinat dari Nominatim (data © OpenStreetMap contributors, ODbL), 12 dan 14 November 2026 */
  tempat: Tempat[]
}

export const DAFTAR_WILAYAH: Wilayah[] = [
  {
    id: 'semarang',
    nama: 'Kota Semarang',
    singkat: 'Semarang',
    keterangan: 'Jawa Tengah, 177 kelurahan',
    satuan: 'kelurahan',
    bbox: [110.267, -7.115, 110.509, -6.928],
    viewbox: '110.26,-6.92,110.52,-7.12',
    tempat: [
      { label: 'Tanah Mas', lngLat: [110.41042, -6.96415], jenis: 'kawasan', perkiraan: true, sorotan: true },
      { label: 'Kaligawe', lngLat: [110.44734, -6.96256], jenis: 'kelurahan', sorotan: true },
      { label: 'Terboyo', lngLat: [110.46997, -6.95302], jenis: 'kelurahan', sorotan: true },
      { label: 'Kota Lama', lngLat: [110.4269, -6.96723], jenis: 'kawasan', sorotan: true },
      { label: 'Tlogosari', lngLat: [110.45742, -6.98295], jenis: 'kelurahan', sorotan: true },
      { label: 'Simpang Lima', lngLat: [110.42358, -6.98932], jenis: 'landmark', sorotan: true },
      { label: 'Tembalang', lngLat: [110.44011, -7.04837], jenis: 'kawasan', sorotan: true },
      { label: 'Banyumanik', lngLat: [110.41893, -7.06067], jenis: 'kecamatan', sorotan: true },
      { label: 'Ngaliyan', lngLat: [110.35062, -6.99812], jenis: 'kelurahan', sorotan: true },
      { label: 'Genuk Indah', lngLat: [110.46637, -6.96221], jenis: 'kawasan', perkiraan: true },
      { label: 'Tambak Lorok', lngLat: [110.43229, -6.95073], jenis: 'kawasan', perkiraan: true },
      { label: 'Pelabuhan Tanjung Emas', lngLat: [110.42825, -6.94647], jenis: 'landmark' },
      { label: 'Tugu Muda', lngLat: [110.40933, -6.98432], jenis: 'landmark' },
      { label: 'Pedurungan', lngLat: [110.47606, -7.00119], jenis: 'kecamatan' },
      { label: 'Kedungmundu', lngLat: [110.46755, -7.02058], jenis: 'kelurahan' },
      { label: 'BSB Mijen', lngLat: [110.33396, -7.02671], jenis: 'kawasan', perkiraan: true },
      { label: 'Gunungpati (UNNES)', lngLat: [110.39883, -7.05024], jenis: 'landmark' },
      { label: 'Puri Anjasmoro', lngLat: [110.38684, -6.97351], jenis: 'kawasan', perkiraan: true },
      { label: 'Bandara Ahmad Yani', lngLat: [110.3751, -6.97148], jenis: 'landmark' },
      { label: 'Mangunharjo', lngLat: [110.30465, -6.96684], jenis: 'kelurahan' },
      { label: 'Sampangan', lngLat: [110.39179, -7.01108], jenis: 'kelurahan' },
      { label: 'Candi', lngLat: [110.42901, -7.0107], jenis: 'kelurahan' },
      { label: 'Meteseh', lngLat: [110.46467, -7.05661], jenis: 'kelurahan' },
      { label: 'Stasiun Tawang', lngLat: [110.42786, -6.96445], jenis: 'landmark' },
    ],
  },
  {
    id: 'jakarta',
    nama: 'DKI Jakarta',
    singkat: 'Jakarta',
    keterangan: 'Lima kota daratan, 262 kelurahan',
    satuan: 'kelurahan',
    bbox: [106.686, -6.374, 106.974, -6.074],
    viewbox: '106.68,-6.07,106.98,-6.38',
    tempat: [
      { label: 'Muara Baru', lngLat: [106.79982, -6.11042], jenis: 'kawasan', perkiraan: true, sorotan: true },
      { label: 'Pluit', lngLat: [106.78736, -6.11503], jenis: 'kelurahan', sorotan: true },
      // titik di permukiman Muara Angke yang terukur (Kamal Muara di sebelah barat tidak koheren: tambak dan reklamasi)
      { label: 'Muara Angke', lngLat: [106.774, -6.106], jenis: 'kawasan', perkiraan: true, sorotan: true },
      { label: 'Kamal Muara', lngLat: [106.73374, -6.10986], jenis: 'kelurahan' },
      { label: 'Kelapa Gading', lngLat: [106.90248, -6.15994], jenis: 'kelurahan', sorotan: true },
      { label: 'Cengkareng', lngLat: [106.74472, -6.1529], jenis: 'kelurahan', sorotan: true },
      { label: 'Tanjung Priok', lngLat: [106.87079, -6.12886], jenis: 'kelurahan', sorotan: true },
      { label: 'Monas', lngLat: [106.82717, -6.1754], jenis: 'landmark', sorotan: true },
      { label: 'Kebayoran Baru', lngLat: [106.79723, -6.24978], jenis: 'kecamatan', sorotan: true },
      { label: 'Sunda Kelapa', lngLat: [106.8096, -6.12677], jenis: 'landmark' },
      { label: 'Pantai Indah Kapuk', lngLat: [106.73925, -6.10892], jenis: 'kawasan' },
      { label: 'Marunda', lngLat: [106.96017, -6.12316], jenis: 'kelurahan' },
      { label: 'Kemayoran', lngLat: [106.84152, -6.16168], jenis: 'kawasan', perkiraan: true },
      { label: 'Cilincing', lngLat: [106.94481, -6.12766], jenis: 'kelurahan' },
      { label: 'Grogol', lngLat: [106.78961, -6.16204], jenis: 'kawasan', perkiraan: true },
      { label: 'Cakung', lngLat: [106.95248, -6.21908], jenis: 'kawasan', perkiraan: true },
      { label: 'Pondok Indah', lngLat: [106.78281, -6.27564], jenis: 'kawasan' },
    ],
  },
  {
    id: 'pekalongan',
    nama: 'Kota Pekalongan',
    singkat: 'Pekalongan',
    keterangan: 'Jawa Tengah, 27 kelurahan',
    satuan: 'kelurahan',
    bbox: [109.642, -6.936, 109.715, -6.852],
    viewbox: '109.63,-6.84,109.72,-6.94',
    tempat: [
      { label: 'Panjang Wetan', lngLat: [109.68177, -6.86938], jenis: 'kelurahan', sorotan: true },
      { label: 'Bandengan', lngLat: [109.66319, -6.87168], jenis: 'kelurahan', sorotan: true },
      { label: 'Pasirkratonkramat', lngLat: [109.65724, -6.88415], jenis: 'kelurahan', sorotan: true },
      { label: 'Degayu', lngLat: [109.70358, -6.88552], jenis: 'kelurahan', sorotan: true },
      { label: 'Krapyak', lngLat: [109.68316, -6.8734], jenis: 'kelurahan', sorotan: true },
      { label: 'Alun-alun Pekalongan', lngLat: [109.6763, -6.89073], jenis: 'landmark', sorotan: true },
      { label: 'Medono', lngLat: [109.66597, -6.90325], jenis: 'kelurahan', sorotan: true },
    ],
  },
  {
    id: 'demak',
    nama: 'Kabupaten Demak',
    singkat: 'Demak',
    keterangan: 'Jawa Tengah, 249 desa dan kelurahan',
    satuan: 'kelurahan/desa',
    bbox: [110.464, -7.14, 110.839, -6.706],
    viewbox: '110.45,-6.70,110.85,-7.15',
    tempat: [
      { label: 'Timbulsloko', lngLat: [110.51817, -6.91352], jenis: 'kelurahan', sorotan: true },
      { label: 'Sayung', lngLat: [110.51326, -6.94828], jenis: 'kelurahan', sorotan: true },
      { label: 'Alun-alun Demak', lngLat: [110.63853, -6.89481], jenis: 'landmark', sorotan: true },
      { label: 'Karangtengah', lngLat: [110.60025, -6.91896], jenis: 'kawasan', perkiraan: true, sorotan: true },
      { label: 'Bonang', lngLat: [110.58051, -6.85306], jenis: 'kecamatan', sorotan: true },
      { label: 'Wedung', lngLat: [110.62457, -6.77062], jenis: 'kecamatan', sorotan: true },
      { label: 'Mranggen', lngLat: [110.51255, -7.02749], jenis: 'kelurahan', sorotan: true },
      { label: 'Masjid Agung Demak', lngLat: [110.63735, -6.8947], jenis: 'landmark' },
      { label: 'Gerbang Tol Sayung', lngLat: [110.51156, -6.93717], jenis: 'landmark' },
    ],
  },
]

export const WILAYAH_AWAL: IdWilayah = 'semarang'

const PETA = new Map(DAFTAR_WILAYAH.map((w) => [w.id, w]))

export function wilayahById(id: string | null | undefined): Wilayah | null {
  return id ? (PETA.get(id as IdWilayah) ?? null) : null
}

export const adalahIdWilayah = (s: string | null | undefined): s is IdWilayah => !!s && PETA.has(s as IdWilayah)

/** Wilayah yang kotaknya memuat titik (dengan kelonggaran sekitar 1 km). */
export function wilayahDiTitik(p: Position): Wilayah | null {
  const e = 0.01
  return DAFTAR_WILAYAH.find((w) => p[0] >= w.bbox[0] - e && p[0] <= w.bbox[2] + e && p[1] >= w.bbox[1] - e && p[1] <= w.bbox[3] + e) ?? null
}

const dasar = () => `${import.meta.env.BASE_URL}data/`

/** Ringkasan lintas wilayah untuk Dashboard (scripts/ringkasan-wilayah.mjs). */
export const urlRingkasan = () => `${dasar()}ringkasan-wilayah.json`

export function urlWilayah(id: IdWilayah) {
  return {
    kawasan: `${dasar()}${id}-kawasan.geojson`,
    grid: `${dasar()}${id}-grid.json`,
    konteks: {
      rdtr: `${dasar()}${id}-konteks-rdtr.geojson`,
      rtrw: `${dasar()}${id}-konteks-rtrw.geojson`,
      geologi: `${dasar()}${id}-konteks-geologi.geojson`,
    },
  }
}
