// Daftar lokasi contoh di Kota Semarang untuk pencarian luring dan kartu sorotan.
// Koordinat dari Nominatim (data © OpenStreetMap contributors, ODbL), diambil 12 Nov 2026.
// perkiraan = titik acuan terdekat (pasar, jalan, dsb.), bukan pusat kawasan.
import type { Position } from './types'

export interface Tempat {
  label: string
  lngLat: Position
  jenis: 'kelurahan' | 'kecamatan' | 'kawasan' | 'landmark'
  perkiraan?: boolean
  /** tampil sebagai kartu sorotan di peta */
  sorotan?: boolean
}

export const GAZETTEER: Tempat[] = [
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
]

export const SOROTAN: Tempat[] = GAZETTEER.filter((t) => t.sorotan)
