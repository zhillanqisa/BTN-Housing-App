// Lapis konteks di atas peta laju: zona RDTR, pola ruang RTRW, geologi permukaan, dan bahaya
// banjir serta gelombang ekstrem dan abrasi (InaRISK BNPB).
// File ditulis oleh pipeline/07_konteks.py dan pipeline/07c_bahaya.py. Semua lapis memakai skema
// yang sama: GeoJSON FeatureCollection, properti kode/nama/warna per fitur, dan metadata berisi
// sumber, catatan, serta statistik laju penurunan per kelas (per zona untuk RDTR dan RTRW).
import { bboxOf, inBBox, pointInGeometry } from './geo'
import type { BBox, KawasanGeometry, Position, SumberData } from './types'

export type JenisLapis = 'rdtr' | 'rtrw' | 'geologi' | 'banjir' | 'abrasi'
/** Urutan tampil: RDTR paling rinci dan paling menentukan izin bangunan, jadi didahulukan. */
export const JENIS_LAPIS: JenisLapis[] = ['rdtr', 'rtrw', 'geologi', 'banjir', 'abrasi']

export const LABEL_LAPIS: Record<JenisLapis, string> = {
  rdtr: 'Zona RDTR',
  rtrw: 'Pola ruang RTRW',
  geologi: 'Geologi permukaan',
  banjir: 'Bahaya banjir',
  abrasi: 'Bahaya gelombang dan abrasi',
}
/** Label pendek untuk tombol pilihan lapis. */
export const LABEL_SINGKAT: Record<JenisLapis, string> = { rdtr: 'RDTR', rtrw: 'RTRW', geologi: 'Geologi', banjir: 'Banjir', abrasi: 'Abrasi' }

/** Lapis rencana tata ruang. */
export const lapisTataRuang = (j: JenisLapis): j is 'rdtr' | 'rtrw' => j === 'rdtr' || j === 'rtrw'
/** Lapis indeks bahaya InaRISK BNPB. */
export const lapisBahaya = (j: JenisLapis): j is 'banjir' | 'abrasi' => j === 'banjir' || j === 'abrasi'

/** Kelas indeks bahaya BNPB (kode fitur lapis bahaya). */
export type TingkatBahaya = 'rendah' | 'sedang' | 'tinggi'
export const adalahTingkatBahaya = (s: string): s is TingkatBahaya => s === 'rendah' || s === 'sedang' || s === 'tinggi'

/** Laju penurunan (cm/tahun, positif = turun) di dalam satu kelas, dihitung dari grid aplikasi. */
export interface StatKelas {
  /** kode kelas, mis. KODKWS RTRW atau simbol satuan geologi (Qa, QTd) */
  kode?: string
  nama: string
  warna: string
  luasKm2: number
  /** piksel terukur di dalam kelas */
  nPiksel: number
  /** bagian piksel kelas yang terukur, 0..1 */
  cakupan: number
  /** tidak ada bila piksel terukur terlalu sedikit */
  median?: number
  p75?: number
  /** bagian piksel terukur dengan laju minimal 4 cm/tahun, 0..1 */
  porsiTinggi?: number
}

export interface MetaKonteks {
  lapis: JenisLapis
  judul: string
  /** resmi = dari dokumen atau peta resmi; perkiraan = turunan tim, bukan peta resmi */
  jenis: 'resmi' | 'perkiraan'
  skala: string
  sumber: SumberData[]
  catatan: string
  aturan?: string
  dibuat: string
  statistik: StatKelas[]
}

export interface FiturKonteks {
  kode: string
  /** RDTR dan RTRW Kota: nama sub-zona, mis. "Perumahan Kepadatan Tinggi" */
  nama: string
  warna: string
  /** RDTR dan RTRW: zona tempat sub-zona ini berada, mis. "Perumahan". Statistik dan legenda per zona. */
  zona?: string
  /** RDTR dan RTRW: Lindung atau Budi daya */
  fungsi?: string
  /** Geologi: jenis batuan */
  batuan?: string
  /** Geologi: sifat yang relevan dengan ambles */
  sifat?: string
  geometry: KawasanGeometry
  bbox: BBox
}

export interface LapisKonteks {
  meta: MetaKonteks
  fitur: FiturKonteks[]
  /** GeoJSON apa adanya, untuk sumber peta */
  geojson: unknown
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const teks = (v: unknown): string => (typeof v === 'string' ? v : '')
const angka = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const WARNA = /^#[0-9a-f]{6}$/i

function geometriSah(g: unknown): g is KawasanGeometry {
  if (!isObj(g) || !Array.isArray(g.coordinates)) return false
  return g.type === 'Polygon' || g.type === 'MultiPolygon'
}

function bacaStat(raw: unknown): StatKelas[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isObj).flatMap((s) => {
    const nama = teks(s.nama)
    if (!nama) return []
    return [
      {
        kode: teks(s.kode) || undefined,
        nama,
        warna: WARNA.test(teks(s.warna)) ? teks(s.warna) : '#c4a27c',
        luasKm2: angka(s.luasKm2) ?? 0,
        nPiksel: angka(s.nPiksel) ?? 0,
        cakupan: angka(s.cakupan) ?? 0,
        median: angka(s.median),
        p75: angka(s.p75),
        porsiTinggi: angka(s.porsiTinggi),
      },
    ]
  })
}

/** Validasi longgar: fitur yang rusak dilewati, lapis tanpa fitur sah ditolak. */
export function validasiKonteks(raw: unknown, lapis: JenisLapis): LapisKonteks | null {
  if (!isObj(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) return null
  const m = isObj(raw.metadata) ? raw.metadata : {}
  const fitur: FiturKonteks[] = raw.features.filter(isObj).flatMap((f) => {
    const p = isObj(f.properties) ? f.properties : {}
    const nama = teks(p.nama).trim()
    if (!nama || !geometriSah(f.geometry)) return []
    const g = f.geometry
    return [
      {
        kode: teks(p.kode),
        nama,
        warna: WARNA.test(teks(p.warna)) ? teks(p.warna) : '#c4a27c',
        zona: teks(p.zona).trim() || undefined,
        fungsi: teks(p.fungsi) || undefined,
        batuan: teks(p.batuan) || undefined,
        sifat: teks(p.sifat) || undefined,
        geometry: g,
        bbox: bboxOf(g),
      },
    ]
  })
  if (!fitur.length) return null
  const meta: MetaKonteks = {
    lapis,
    judul: teks(m.judul) || LABEL_LAPIS[lapis],
    jenis: m.jenis === 'perkiraan' ? 'perkiraan' : 'resmi',
    skala: teks(m.skala),
    sumber: Array.isArray(m.sumber)
      ? m.sumber.filter(isObj).map((s) => ({ nama: teks(s.nama), url: teks(s.url) || undefined, catatan: teks(s.catatan) || undefined }))
      : [],
    catatan: teks(m.catatan),
    aturan: teks(m.aturan) || undefined,
    dibuat: teks(m.dibuat),
    statistik: bacaStat(m.statistik),
  }
  return { meta, fitur, geojson: raw }
}

/** Kelas lapis di satu titik, atau null bila titik di luar semua poligon. */
export function konteksDi(lapis: LapisKonteks | null | undefined, p: Position): FiturKonteks | null {
  if (!lapis) return null
  return lapis.fitur.find((f) => inBBox(p, f.bbox) && pointInGeometry(p, f.geometry)) ?? null
}

export function statKelas(lapis: LapisKonteks | null | undefined, nama: string): StatKelas | undefined {
  return lapis?.meta.statistik.find((s) => s.nama === nama)
}

/** Statistik kelas sebuah fitur: per zona bila fitur punya zona (RDTR, RTRW Kota), selain itu per nama. */
export function statFitur(lapis: LapisKonteks | null | undefined, f: FiturKonteks): StatKelas | undefined {
  return statKelas(lapis, f.zona ?? f.nama) ?? statKelas(lapis, f.nama)
}

/** Nama kelas untuk tampilan singkat: "Zona: sub-zona" bila keduanya beda. */
export function namaKelas(f: FiturKonteks): string {
  return f.zona && f.zona !== f.nama ? `${f.zona}: ${f.nama}` : f.nama
}

/** Kode satuan Aluvium pada peta geologi (dan pada perkiraan dari bentuk lahan). */
export const KODE_ALUVIUM = 'Qa'

/** Muat satu lapis. Gagal = null, aplikasi tetap jalan tanpa lapis itu. */
export async function ambilKonteks(lapis: JenisLapis, url: string): Promise<LapisKonteks | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return validasiKonteks(await res.json(), lapis)
  } catch {
    return null
  }
}
