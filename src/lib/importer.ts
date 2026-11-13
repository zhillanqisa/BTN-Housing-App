// Impor data pengganti data demo: GeoJSON lengkap, atau CSV yang digabung ke geometri
// kelurahan yang sedang dimuat. Fungsi murni (tanpa DOM), diuji di data.test.ts.
import { META_BAWAAN, validasiDataset } from './data'
import type { Dataset, DatasetMeta, Kawasan, KawasanFeature } from './types'

export interface RingkasanImpor {
  total: number
  cocok: number
  takCocok: string[]
  memadai: number
}
export type HasilImpor = { ok: true; dataset: Dataset; ringkasan: RingkasanImpor; peringatan: string[] } | { ok: false; galat: string[] }

const hariIni = () => new Date().toISOString().slice(0, 10)
const rapikan = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** Byte order mark UTF-8. Ditulis lewat kode karakter supaya tidak ada karakter tak terlihat di sumber. */
const BOM = String.fromCharCode(0xfeff)

/** Parser CSV kecil: pemisah ; , atau tab (dideteksi dari baris kepala), kutip ganda, BOM. */
export function parseCSV(teks: string): { header: string[]; baris: string[][] } {
  const isi = teks.startsWith(BOM) ? teks.slice(1) : teks
  const kepala = isi.split(/\r?\n/, 1)[0] ?? ''
  const hitung = (c: string) => kepala.split(c).length - 1
  const pemisah = hitung(';') >= hitung(',') && hitung(';') >= hitung('\t') && hitung(';') > 0 ? ';' : hitung('\t') > hitung(',') ? '\t' : ','

  const semua: string[][] = []
  let sel = ''
  let baris: string[] = []
  let kutip = false
  for (let i = 0; i < isi.length; i++) {
    const c = isi[i]!
    if (kutip) {
      if (c === '"') {
        if (isi[i + 1] === '"') {
          sel += '"'
          i++
        } else kutip = false
      } else sel += c
    } else if (c === '"') kutip = true
    else if (c === pemisah) {
      baris.push(sel.trim())
      sel = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && isi[i + 1] === '\n') i++
      baris.push(sel.trim())
      sel = ''
      if (baris.some((x) => x !== '')) semua.push(baris)
      baris = []
    } else sel += c
  }
  baris.push(sel.trim())
  if (baris.some((x) => x !== '')) semua.push(baris)
  const [header = [], ...sisa] = semua
  return { header: header.map((h) => h.trim()), baris: sisa }
}

export function imporGeoJSON(teks: string, namaFile: string): HasilImpor {
  let raw: unknown
  try {
    raw = JSON.parse(teks)
  } catch {
    return { ok: false, galat: ['File bukan JSON yang sah.'] }
  }
  const hasil = validasiDataset(raw, { ...META_BAWAAN, jenis: 'unggahan', judul: namaFile, dibuat: hariIni() })
  if (!hasil.ok) return hasil
  const total = hasil.dataset.features.length
  return {
    ok: true,
    dataset: hasil.dataset,
    ringkasan: { total, cocok: total, takCocok: [], memadai: hasil.dataset.features.filter((f) => f.properties.memadai).length },
    peringatan: hasil.peringatan,
  }
}

function angka(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Gabungkan baris CSV ke geometri kawasan yang sedang dimuat. */
export function imporCSV(teks: string, dasar: Kawasan[], metaDasar: DatasetMeta | null, namaFile: string): HasilImpor {
  const { header, baris } = parseCSV(teks)
  const kol = (...nama: string[]) => header.findIndex((h) => nama.includes(h.toLowerCase()))
  const iId = kol('id')
  const iNama = kol('nama', 'kawasan', 'kelurahan')
  const iKec = kol('kecamatan')
  const iLaju = kol('laju', 'laju_cm_th')
  const iSigma = kol('sigma', 'ketidakpastian', 'ketidakpastian_cm_th')
  const iPiksel = kol('n_piksel', 'npiksel')
  const iKoh = kol('koherensi')
  const iMemadai = kol('memadai')
  if (iId < 0 && iNama < 0) return { ok: false, galat: ['Kolom "id" atau "nama" tidak ditemukan.'] }
  if (iLaju < 0) return { ok: false, galat: ['Kolom "laju" tidak ditemukan. Isi laju dalam cm/tahun (positif = turun).'] }
  if (!dasar.length) return { ok: false, galat: ['Belum ada geometri kelurahan untuk digabung.'] }

  const perId = new Map(dasar.map((k) => [k.id, k]))
  const perNama = new Map<string, Kawasan[]>()
  for (const k of dasar) perNama.set(rapikan(k.nama), [...(perNama.get(rapikan(k.nama)) ?? []), k])

  type Isian = { laju: number | null; sigma: number | null; nPiksel: number | null; koherensi: number | null; memadai: boolean | null }
  const isian = new Map<string, Isian>()
  const takCocok: string[] = []
  let janggal = 0

  for (const b of baris) {
    const nama = iNama >= 0 ? (b[iNama] ?? '') : ''
    let k = iId >= 0 ? perId.get(b[iId] ?? '') : undefined
    if (!k && nama) {
      const calon = perNama.get(rapikan(nama)) ?? []
      if (calon.length === 1) k = calon[0]
      else if (calon.length > 1) {
        const kec = iKec >= 0 ? rapikan(b[iKec] ?? '') : ''
        k = calon.find((c) => rapikan(c.kecamatan) === kec)
        if (!k) {
          takCocok.push(`${nama} (nama kembar, isi kolom kecamatan)`)
          continue
        }
      }
    }
    if (!k) {
      takCocok.push(nama || b[iId] || '(baris tanpa nama)')
      continue
    }
    const laju = angka(b[iLaju])
    if (laju != null && Math.abs(laju) > 40) janggal++
    const m = iMemadai >= 0 ? rapikan(b[iMemadai] ?? '') : ''
    isian.set(k.id, {
      laju,
      sigma: iSigma >= 0 ? angka(b[iSigma]) : null,
      nPiksel: iPiksel >= 0 ? angka(b[iPiksel]) : null,
      koherensi: iKoh >= 0 ? angka(b[iKoh]) : null,
      memadai: m === '' ? null : ['true', 'ya', '1', 'y'].includes(m),
    })
  }
  if (!isian.size) return { ok: false, galat: ['Tidak ada baris yang cocok dengan kelurahan di peta. Periksa kolom id atau nama.'] }

  const features: KawasanFeature[] = dasar.map((k) => {
    const x = isian.get(k.id)
    const memadai = !!x && x.laju != null && x.memadai !== false
    return {
      type: 'Feature',
      geometry: k.geometry,
      properties: {
        id: k.id,
        nama: k.nama,
        kecamatan: k.kecamatan,
        laju: memadai ? x!.laju : null,
        sigma: memadai ? (x!.sigma ?? 0) : null,
        nPiksel: x?.nPiksel ?? 0,
        koherensi: x?.koherensi ?? null,
        memadai,
        deret: [],
        jarakPantaiKm: k.jarakPantaiKm,
      },
    }
  })

  const peringatan: string[] = []
  if (takCocok.length) peringatan.push(`${takCocok.length} baris tidak cocok dengan kelurahan mana pun.`)
  if (iSigma < 0) peringatan.push('Kolom "sigma" tidak ada; ketidakpastian dianggap 0 sehingga proyeksi tampil tanpa rentang.')
  if (janggal) peringatan.push(`${janggal} baris berlaju di atas 40 cm/tahun. Pastikan satuannya cm/tahun, bukan mm/tahun.`)
  peringatan.push('CSV tidak memuat deret waktu, jadi grafik riwayat tidak tampil.')

  const batas = metaDasar?.sumber.filter((s) => /openstreetmap/i.test(s.nama)) ?? []
  return {
    ok: true,
    dataset: {
      type: 'FeatureCollection',
      metadata: {
        jenis: 'unggahan',
        judul: namaFile,
        wilayah: metaDasar?.wilayah ?? 'Kota Semarang',
        periode: ['', ''],
        metode: 'Diunggah dari CSV; geometri kelurahan dari data dasar.',
        sumber: batas,
        dibuat: hariIni(),
        catatan: '',
      },
      features,
    },
    ringkasan: { total: baris.length, cocok: isian.size, takCocok: takCocok.slice(0, 10), memadai: features.filter((f) => f.properties.memadai).length },
    peringatan,
  }
}

/** Templat CSV berisi seluruh kelurahan, kolom angka dikosongkan. */
export function templatCSV(kawasan: Kawasan[]): string {
  const sel = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const baris = kawasan.map((k) => [k.id, k.nama, k.kecamatan, '', '', '', ''].map(sel).join(';'))
  return `${BOM}id;nama;kecamatan;laju;sigma;n_piksel;koherensi\n${baris.join('\n')}\n`
}
