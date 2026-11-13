// Grid piksel laju penurunan (sekitar 80 m): peta per piksel dan laporan berbasis titik.
// Format file ditulis oleh scripts/build-demo-data.mjs (demo) dan pipeline/06_ekspor.py (olahan):
// kepala JSON + biner Int16 little-endian, baris 0 = paling utara, indeks = baris * nx + kolom.
import { BLOK_PIKSEL, MIN_PIKSEL_BLOK } from './config'
import type { BBox, Position } from './types'

export interface KepalaGrid {
  versi: number
  jenis: string
  /** 'YYYY-MM-DD' */
  dibuat: string
  /** [barat, selatan, timur, utara] tepi luar grid */
  bbox: BBox
  nx: number
  ny: number
  ukuranSelM: number
  /** di dalam wilayah tetapi tidak terukur */
  nodata: number
  /** di luar wilayah */
  luar: number
  /** nilai laju/sigma x skalaLaju = cm/tahun (positif = turun) */
  skalaLaju: number
  /** nilai deret x skalaDeret = cm (negatif = turun) */
  skalaDeret: number
  /** tahun desimal tiap epoch deret */
  epoch: number[]
  nValid: number
  berkas: { laju: string; sigma: string; deret: string }
}

export interface Grid {
  kepala: KepalaGrid
  laju: Int16Array
  sigma: Int16Array
  /** urutan piksel valid di file deret; -1 bila piksel tidak valid */
  posisi: Int32Array
  /** null sampai file deret selesai dimuat */
  deret: Int16Array | null
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const angka = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
// nama berkas dari kepala dipakai untuk menyusun URL: hanya nama polos, tanpa jalur
const namaSah = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]+$/.test(v) && !v.includes('..')
const MAKS_PIKSEL = 4_000_000

export function validasiKepala(raw: unknown): KepalaGrid | null {
  if (!isObj(raw)) return null
  const { bbox, nx, ny, nodata, luar, skalaLaju, skalaDeret, epoch, berkas } = raw
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(angka)) return null
  const [barat, selatan, timur, utara] = bbox as [number, number, number, number]
  if (!(timur > barat && utara > selatan)) return null
  if (!angka(nx) || !angka(ny) || !Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1 || nx * ny > MAKS_PIKSEL) return null
  if (!angka(nodata) || !angka(luar) || !angka(skalaLaju) || !angka(skalaDeret)) return null
  if (!Array.isArray(epoch) || !epoch.every(angka)) return null
  if (!isObj(berkas) || !namaSah(berkas.laju) || !namaSah(berkas.sigma) || !namaSah(berkas.deret)) return null
  return {
    versi: angka(raw.versi) ? raw.versi : 1,
    jenis: typeof raw.jenis === 'string' ? raw.jenis : '',
    dibuat: typeof raw.dibuat === 'string' ? raw.dibuat : '',
    bbox: [barat, selatan, timur, utara],
    nx,
    ny,
    ukuranSelM: angka(raw.ukuranSelM) && raw.ukuranSelM > 0 ? raw.ukuranSelM : 80,
    nodata,
    luar,
    skalaLaju,
    skalaDeret,
    epoch: epoch as number[],
    nValid: 0,
    berkas: { laju: berkas.laju, sigma: berkas.sigma, deret: berkas.deret },
  }
}

/** ArrayBuffer -> Int16Array little-endian, apa pun urutan byte mesinnya. */
export function bacaInt16(buf: ArrayBuffer): Int16Array {
  const n = buf.byteLength >> 1
  const mesinLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
  if (mesinLE) return new Int16Array(buf, 0, n)
  const dv = new DataView(buf)
  const out = new Int16Array(n)
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true)
  return out
}

/** Pasang deret ke grid. false bila ukurannya tidak cocok. */
export function pasangDeret(g: Grid, deret: Int16Array): boolean {
  if (deret.length !== g.kepala.nValid * g.kepala.epoch.length) return false
  g.deret = deret
  return true
}

export function susunGrid(kepala: KepalaGrid, laju: Int16Array, sigma: Int16Array, deret: Int16Array | null = null): Grid | null {
  const n = kepala.nx * kepala.ny
  if (laju.length !== n || sigma.length !== n) return null
  const posisi = new Int32Array(n).fill(-1)
  let nValid = 0
  for (let i = 0; i < n; i++) {
    const v = laju[i]!
    if (v !== kepala.nodata && v !== kepala.luar) posisi[i] = nValid++
  }
  const g: Grid = { kepala: { ...kepala, nValid }, laju, sigma, posisi, deret: null }
  if (deret && !pasangDeret(g, deret)) return null
  return g
}

/** Kolom dan baris piksel yang memuat titik. null bila titik di luar grid. */
export function pikselDi(g: Grid, lngLat: Position): { col: number; row: number } | null {
  const { bbox, nx, ny } = g.kepala
  const col = Math.floor(((lngLat[0] - bbox[0]) / (bbox[2] - bbox[0])) * nx)
  const row = Math.floor(((bbox[3] - lngLat[1]) / (bbox[3] - bbox[1])) * ny)
  if (!(col >= 0 && row >= 0 && col < nx && row < ny)) return null
  return { col, row }
}

export type NilaiPiksel =
  | { status: 'luar' }
  | { status: 'kosong'; indeks: number }
  | { status: 'ada'; indeks: number; laju: number }

/** Nilai satu piksel di bawah titik (untuk tooltip peta). */
export function nilaiDi(g: Grid, lngLat: Position): NilaiPiksel {
  const p = pikselDi(g, lngLat)
  if (!p) return { status: 'luar' }
  const indeks = p.row * g.kepala.nx + p.col
  const v = g.laju[indeks]!
  if (v === g.kepala.luar) return { status: 'luar' }
  if (v === g.kepala.nodata) return { status: 'kosong', indeks }
  return { status: 'ada', indeks, laju: v * g.kepala.skalaLaju }
}

const naik = (a: number, b: number) => a - b
function median(urut: number[]): number {
  const n = urut.length
  if (!n) return Number.NaN
  const t = n >> 1
  return n % 2 ? urut[t]! : (urut[t - 1]! + urut[t]!) / 2
}
const r1 = (v: number) => Math.round(v * 10) / 10

export interface StatTitik {
  /** jumlah piksel blok yang berada di dalam wilayah (0 = titik di luar grid) */
  nBlok: number
  /** jumlah piksel blok yang terukur */
  nPiksel: number
  memadai: boolean
  /** median laju piksel terukur, cm/tahun */
  laju: number | null
  /** akar dari (sebaran dalam blok kuadrat + galat ukur kuadrat), cm/tahun */
  sigma: number | null
  /** laju terkecil dan terbesar di blok */
  sebaran: [number, number] | null
  /** median per epoch; kosong sampai file deret dimuat */
  deret: [number, number][]
}

/** Statistik blok BLOK_PIKSEL x BLOK_PIKSEL piksel di sekitar titik. */
export function statistikTitik(g: Grid, lngLat: Position): StatTitik {
  const kosong: StatTitik = { nBlok: 0, nPiksel: 0, memadai: false, laju: null, sigma: null, sebaran: null, deret: [] }
  const p = pikselDi(g, lngLat)
  if (!p) return kosong
  const { nx, ny, nodata, luar, skalaLaju, skalaDeret, epoch } = g.kepala
  const jari = (BLOK_PIKSEL - 1) / 2
  const terukur: number[] = []
  let nBlok = 0
  for (let r = p.row - jari; r <= p.row + jari; r++) {
    for (let c = p.col - jari; c <= p.col + jari; c++) {
      if (r < 0 || c < 0 || r >= ny || c >= nx) continue
      const i = r * nx + c
      const v = g.laju[i]!
      if (v === luar) continue
      nBlok++
      if (v !== nodata) terukur.push(i)
    }
  }
  if (terukur.length < MIN_PIKSEL_BLOK) return { ...kosong, nBlok, nPiksel: terukur.length }

  const nilai = terukur.map((i) => g.laju[i]! * skalaLaju).sort(naik)
  const tengah = median(nilai)
  const mad = median(nilai.map((x) => Math.abs(x - tengah)).sort(naik))
  const ukur = median(terukur.map((i) => g.sigma[i]! * skalaLaju).sort(naik))

  let deret: [number, number][] = []
  const d = g.deret
  if (d) {
    const nE = epoch.length
    deret = epoch.map((t, e) => [t, r1(median(terukur.map((i) => d[g.posisi[i]! * nE + e]!).sort(naik)) * skalaDeret)])
    if (deret[0]) deret[0][1] = 0
  }
  return {
    nBlok,
    nPiksel: terukur.length,
    memadai: true,
    laju: r1(tengah),
    sigma: r1(Math.sqrt((1.4826 * mad) ** 2 + ukur ** 2)),
    sebaran: [r1(nilai[0]!), r1(nilai[nilai.length - 1]!)],
    deret,
  }
}

/** Batas blok piksel di sekitar titik (untuk garis sorot di peta). */
export function batasBlok(g: Grid, lngLat: Position): BBox | null {
  const p = pikselDi(g, lngLat)
  if (!p) return null
  const { bbox, nx, ny } = g.kepala
  const dx = (bbox[2] - bbox[0]) / nx
  const dy = (bbox[3] - bbox[1]) / ny
  const jari = (BLOK_PIKSEL - 1) / 2
  return [bbox[0] + (p.col - jari) * dx, bbox[3] - (p.row + jari + 1) * dy, bbox[0] + (p.col + jari + 1) * dx, bbox[3] - (p.row - jari) * dy]
}

/** Lebar blok laporan dalam meter, dibulatkan ke 10 m (3 x 80 m = 240 m). */
export const lebarBlokM = (g: Grid | null): number => Math.round(((g?.kepala.ukuranSelM ?? 80) * BLOK_PIKSEL) / 10) * 10

export type RGBA = [number, number, number, number]

/** Warna RGBA tiap piksel untuk lapis peta. kelas(laju) mengembalikan indeks palet. Di luar wilayah = transparan. */
export function lukisGrid(g: Grid, kelas: (laju: number) => number, palet: RGBA[], kosong: RGBA): Uint8ClampedArray<ArrayBuffer> {
  const { nodata, luar, skalaLaju } = g.kepala
  const out = new Uint8ClampedArray(g.laju.length * 4)
  for (let i = 0; i < g.laju.length; i++) {
    const v = g.laju[i]!
    if (v === luar) continue
    const w = v === nodata ? kosong : (palet[kelas(v * skalaLaju)] ?? kosong)
    const o = i * 4
    out[o] = w[0]
    out[o + 1] = w[1]
    out[o + 2] = w[2]
    out[o + 3] = w[3]
  }
  return out
}

const dasarUrl = (u: string) => u.slice(0, u.lastIndexOf('/') + 1)

/** Muat kepala, laju, dan sigma. null bila dataset tidak punya grid atau file tidak cocok. */
export async function ambilGrid(urlKepala: string): Promise<Grid | null> {
  try {
    const res = await fetch(urlKepala)
    if (!res.ok) return null
    const kepala = validasiKepala(await res.json())
    if (!kepala) return null
    const dasar = dasarUrl(urlKepala)
    const [a, b] = await Promise.all([fetch(dasar + kepala.berkas.laju), fetch(dasar + kepala.berkas.sigma)])
    if (!a.ok || !b.ok) return null
    return susunGrid(kepala, bacaInt16(await a.arrayBuffer()), bacaInt16(await b.arrayBuffer()))
  } catch (e) {
    console.warn('Grid piksel tidak termuat; aplikasi memakai rata-rata kelurahan.', e)
    return null
  }
}

/** Muat deret waktu (file terbesar) setelah peta tampil. */
export async function ambilDeret(g: Grid, urlKepala: string): Promise<boolean> {
  try {
    const res = await fetch(dasarUrl(urlKepala) + g.kepala.berkas.deret)
    if (!res.ok) return false
    return pasangDeret(g, bacaInt16(await res.arrayBuffer()))
  } catch (e) {
    console.warn('Deret waktu grid tidak termuat; grafik riwayat titik tidak tersedia.', e)
    return false
  }
}
