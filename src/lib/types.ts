// Tipe data inti PANTAU AMBLES.
// Satu unit laporan = satu "kawasan" (kelurahan). Data bersifat kawasan, bukan per bangunan.

export type Kategori = 'rendah' | 'sedang' | 'tinggi' | 'tidak-memadai'
export type Tenor = 10 | 15 | 20
/** [bujur, lintang] WGS84 */
export type Position = [number, number]
/** [barat, selatan, timur, utara] */
export type BBox = [number, number, number, number]
export type PolygonCoords = Position[][]

export type KawasanGeometry =
  | { type: 'Polygon'; coordinates: PolygonCoords }
  | { type: 'MultiPolygon'; coordinates: PolygonCoords[] }

/** Atribut satu kawasan di file data (GeoJSON properties). */
export interface KawasanProps {
  id: string
  nama: string
  kecamatan: string
  /** Laju penurunan median, cm/tahun. Positif = turun. null bila data tidak memadai. */
  laju: number | null
  /** Ketidakpastian laju, ± cm/tahun. */
  sigma: number | null
  /** Jumlah piksel InSAR yang dipakai. */
  nPiksel: number
  /** Koherensi rata-rata 0..1. */
  koherensi: number | null
  /** false = "data tidak memadai" (koherensi rendah / piksel terlalu sedikit). */
  memadai: boolean
  /** Deret waktu: [tahun desimal, perpindahan kumulatif cm]. Negatif = turun. */
  deret: [number, number][]
  /** Perkiraan jarak ke batas utara kota (km). Hanya masukan model demo. */
  jarakPantaiKm: number | null
}

export interface KawasanFeature {
  type: 'Feature'
  properties: KawasanProps
  geometry: KawasanGeometry
}

export interface SumberData {
  nama: string
  url?: string
  catatan?: string
}

export interface DatasetMeta {
  /** demo = ilustratif; olahan = hasil olah tim; unggahan = file yang diunggah pengguna */
  jenis: 'demo' | 'olahan' | 'unggahan'
  judul: string
  wilayah: string
  /** ['YYYY-MM', 'YYYY-MM'] */
  periode: [string, string]
  metode: string
  sumber: SumberData[]
  /** 'YYYY-MM-DD' */
  dibuat: string
  catatan: string
}

export interface Dataset {
  type: 'FeatureCollection'
  metadata: DatasetMeta
  features: KawasanFeature[]
}

/** Kawasan yang sudah diindeks untuk dipakai aplikasi. */
export interface Kawasan extends KawasanProps {
  bbox: BBox
  pusat: Position
  luasKm2: number
  geometry: KawasanGeometry
}

/** Ambang kategori (cm/tahun): laju >= sedang -> sedang; laju >= tinggi -> tinggi. */
export interface Thresholds {
  sedang: number
  tinggi: number
}

/** Proyeksi Tenor: total penurunan (cm) selama tenor, sebagai rentang. */
export interface Proyeksi {
  tenor: Tenor
  tengah: number
  bawah: number
  atas: number
}

export type AsalPilihan = 'peta' | 'cari' | 'sorotan' | 'tautan' | 'dashboard' | 'banding'

export interface Selection {
  lngLat: Position
  /** null = titik di luar wilayah uji */
  kawasanId: string | null
  label: string
  asal: AsalPilihan
}

export type Tema = 'light' | 'dark'
export type ModePeta = 'laju' | 'kategori'
export type Halaman = 'peta' | 'bandingkan' | 'dashboard' | 'metode'
