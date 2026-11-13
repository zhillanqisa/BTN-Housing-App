// Muat, validasi, dan indeks dataset kawasan.
// Format file: GeoJSON FeatureCollection + anggota "metadata" (lihat types.ts).
import { DATA_URL } from './config'
import { areaKm2, bboxOf, inBBox, pointInGeometry, pusatOf } from './geo'
import type { Dataset, DatasetMeta, Kawasan, KawasanFeature, KawasanGeometry, Position } from './types'

export type HasilValidasi =
  | { ok: true; dataset: Dataset; peringatan: string[] }
  | { ok: false; galat: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function angka(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function pilih(p: Record<string, unknown>, kunci: string[]): unknown {
  for (const k of kunci) if (p[k] !== undefined && p[k] !== null && p[k] !== '') return p[k]
  return undefined
}

function geometriSah(g: unknown): g is KawasanGeometry {
  if (!isObj(g) || !Array.isArray(g.coordinates)) return false
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return false
  const ring = g.type === 'Polygon' ? g.coordinates[0] : (g.coordinates[0] as unknown[] | undefined)?.[0]
  return Array.isArray(ring) && ring.length >= 4 && Array.isArray(ring[0]) && typeof (ring[0] as unknown[])[0] === 'number'
}

export const META_BAWAAN: DatasetMeta = {
  jenis: 'unggahan',
  judul: 'Data unggahan',
  wilayah: 'Kota Semarang',
  periode: ['', ''],
  metode: 'Tidak disebutkan di file.',
  sumber: [],
  dibuat: '',
  catatan: '',
}

function bacaMeta(raw: unknown, bawaan: DatasetMeta): DatasetMeta {
  if (!isObj(raw)) return bawaan
  const jenis = raw.jenis === 'demo' || raw.jenis === 'olahan' || raw.jenis === 'unggahan' ? raw.jenis : bawaan.jenis
  const periode =
    Array.isArray(raw.periode) && raw.periode.length === 2 ? ([String(raw.periode[0]), String(raw.periode[1])] as [string, string]) : bawaan.periode
  const sumber = Array.isArray(raw.sumber)
    ? raw.sumber.filter(isObj).map((s) => ({
        nama: String(s.nama ?? ''),
        url: typeof s.url === 'string' ? s.url : undefined,
        catatan: typeof s.catatan === 'string' ? s.catatan : undefined,
      }))
    : bawaan.sumber
  return {
    jenis,
    judul: typeof raw.judul === 'string' ? raw.judul : bawaan.judul,
    wilayah: typeof raw.wilayah === 'string' ? raw.wilayah : bawaan.wilayah,
    periode,
    metode: typeof raw.metode === 'string' ? raw.metode : bawaan.metode,
    sumber,
    dibuat: typeof raw.dibuat === 'string' ? raw.dibuat : bawaan.dibuat,
    catatan: typeof raw.catatan === 'string' ? raw.catatan : bawaan.catatan,
  }
}

/** Validasi + normalisasi dataset. Nama kolom alternatif diterima supaya hasil QGIS mudah dipakai. */
export function validasiDataset(raw: unknown, bawaan: DatasetMeta = META_BAWAAN): HasilValidasi {
  const galat: string[] = []
  const peringatan: string[] = []
  if (!isObj(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    return { ok: false, galat: ['File harus berupa GeoJSON FeatureCollection.'] }
  }
  if (raw.features.length === 0) return { ok: false, galat: ['FeatureCollection kosong.'] }

  const features: KawasanFeature[] = []
  const idTerpakai = new Set<string>()
  let adaLaju = false
  let tanpaSigma = 0
  let lajuJanggal = 0

  raw.features.forEach((f: unknown, i: number) => {
    if (galat.length >= 8) return
    const no = i + 1
    if (!isObj(f) || !geometriSah(f.geometry)) {
      galat.push(`Fitur ke-${no}: geometri harus Polygon atau MultiPolygon.`)
      return
    }
    const p = isObj(f.properties) ? f.properties : {}
    const nama = pilih(p, ['nama', 'name', 'NAMOBJ', 'kelurahan', 'desa', 'WADMKD'])
    if (typeof nama !== 'string' || !nama.trim()) {
      galat.push(`Fitur ke-${no}: kolom "nama" kosong.`)
      return
    }
    let id = String(pilih(p, ['id', 'kode', 'KDEPUM']) ?? `k-${no}`)
    while (idTerpakai.has(id)) id += '-x'
    idTerpakai.add(id)

    const laju = angka(pilih(p, ['laju', 'laju_cm_th', 'rate', 'velocity']))
    let sigma = angka(pilih(p, ['sigma', 'ketidakpastian', 'std', 'uncertainty']))
    if (laju != null) {
      adaLaju = true
      if (sigma == null) {
        sigma = 0
        tanpaSigma++
      }
      if (Math.abs(laju) > 40) lajuJanggal++
    }
    const memadaiRaw = p.memadai
    const memadai = laju == null ? false : typeof memadaiRaw === 'boolean' ? memadaiRaw : true
    const deret = Array.isArray(p.deret)
      ? (p.deret as unknown[])
          .filter((d): d is [number, number] => Array.isArray(d) && typeof d[0] === 'number' && typeof d[1] === 'number')
          .map((d) => [d[0], d[1]] as [number, number])
      : []

    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id,
        nama: nama.trim(),
        kecamatan: String(pilih(p, ['kecamatan', 'WADMKC', 'district']) ?? '').trim(),
        laju: memadai ? laju : null,
        sigma: memadai ? sigma : null,
        nPiksel: angka(pilih(p, ['nPiksel', 'n_piksel', 'count'])) ?? 0,
        koherensi: angka(pilih(p, ['koherensi', 'coherence'])),
        memadai,
        deret: memadai ? deret : [],
        jarakPantaiKm: angka(p.jarakPantaiKm),
      },
    })
  })

  if (galat.length) return { ok: false, galat }
  if (!adaLaju) return { ok: false, galat: ['Tidak ada kolom laju. Isi kolom "laju" (cm/tahun, positif = turun).'] }
  if (tanpaSigma) peringatan.push(`${tanpaSigma} kawasan tanpa kolom "sigma"; ketidakpastian dianggap 0 sehingga proyeksi tampil tanpa rentang.`)
  if (lajuJanggal) peringatan.push(`${lajuJanggal} kawasan berlaju di atas 40 cm/tahun. Pastikan satuannya cm/tahun, bukan mm/tahun.`)

  return { ok: true, dataset: { type: 'FeatureCollection', metadata: bacaMeta(raw.metadata, bawaan), features }, peringatan }
}

export function indeksKawasan(ds: Dataset): Kawasan[] {
  return ds.features.map((f) => ({
    ...f.properties,
    geometry: f.geometry,
    bbox: bboxOf(f.geometry),
    pusat: pusatOf(f.geometry),
    luasKm2: areaKm2(f.geometry),
  }))
}

export function cariKawasanDiTitik(pt: Position, list: Kawasan[]): Kawasan | null {
  for (const k of list) {
    if (inBBox(pt, k.bbox) && pointInGeometry(pt, k.geometry)) return k
  }
  return null
}

/** GeoJSON ramping untuk sumber peta (tanpa deret waktu). */
export function geojsonPeta(list: Kawasan[]) {
  return {
    type: 'FeatureCollection' as const,
    features: list.map((k) => ({
      type: 'Feature' as const,
      properties: { id: k.id, nama: k.nama, kecamatan: k.kecamatan, laju: k.laju ?? -1, memadai: k.memadai },
      geometry: k.geometry,
    })),
  }
}

/** Dataset kembali ke bentuk file (untuk ekspor GeoJSON). */
export function keDataset(list: Kawasan[], metadata: DatasetMeta): Dataset {
  return {
    type: 'FeatureCollection',
    metadata,
    features: list.map(({ geometry, bbox: _b, pusat: _p, luasKm2: _l, ...properties }) => ({ type: 'Feature', properties, geometry })),
  }
}

/** Unduh teks sebagai berkas (hanya di peramban). */
export function unduhBerkas(nama: string, isi: string | Blob, mime = 'text/plain;charset=utf-8'): void {
  const blob = typeof isi === 'string' ? new Blob([isi], { type: mime }) : isi
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nama
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function ambilDatasetDemo(): Promise<Dataset> {
  const res = await fetch(DATA_URL)
  if (!res.ok) throw new Error(`Gagal memuat data (${res.status}).`)
  const hasil = validasiDataset(await res.json(), { ...META_BAWAAN, jenis: 'demo', judul: 'Data demo' })
  if (!hasil.ok) throw new Error(hasil.galat.join(' '))
  return hasil.dataset
}
