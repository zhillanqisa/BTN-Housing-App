// PDF Laporan Ambles: satu halaman A4, vektor penuh (teks, garis, kotak) dengan jsPDF.
// jsPDF dimuat dinamis supaya tidak membebani muatan awal.
import type { jsPDF as JsPdf } from 'jspdf'
import { APP, BATASAN, LABEL_KATEGORI, TENORS, WARNA_KATEGORI } from './config'
import { unduhBerkas } from './data'
import { fmt, fmtKoordinat, fmtPeriode, fmtTanggal, slug } from './format'
import { hitungProyeksi, kalimatProyeksi, kalimatStatus, langkahBerikutnya, teksLaju, teksProyeksi } from './risk'
import type { DatasetMeta, Kategori, Kawasan, Position, Tenor, Thresholds } from './types'

export interface DataLaporanPdf {
  kawasan: Kawasan
  kategori: Kategori
  tenor: Tenor
  thresholds: Thresholds
  meta: DatasetMeta
  label: string
  lngLat: Position
  gambarPeta?: string | null
}

type RGB = [number, number, number]
const M = 16
const W = 210
const H = 297
const LEBAR = W - 2 * M
const TINTA: RGB = [22, 22, 29]
const ABU: RGB = [98, 98, 112]
const GARIS: RGB = [216, 216, 225]
const DATA: RGB = [106, 79, 211]

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Kode titik yang diganti / diizinkan (di luar Latin-1): minus, kutip miring, panah; tanda pisah en, butir, elipsis.
const GANTI: Record<number, string> = { 0x2212: '-', 0x2018: "'", 0x2019: "'", 0x201c: '"', 0x201d: '"', 0x2192: '->' }
const BOLEH = new Set([0x2013, 0x2022, 0x2026])

/** Font bawaan PDF memakai WinAnsi: ganti karakter di luar itu. */
export function amanWinAnsi(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const ganti = GANTI[c]
    if (ganti !== undefined) out += ganti
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || BOLEH.has(c)) out += ch
    else out += '?'
  }
  return out
}

const tinggiBaris = (pt: number) => pt * 0.3528 * 1.32

interface Gaya {
  ukuran?: number
  tebal?: boolean
  warna?: RGB
  rata?: 'left' | 'right' | 'center'
}

function alat(doc: JsPdf) {
  const atur = (g: Gaya = {}) => {
    doc.setFont('helvetica', g.tebal ? 'bold' : 'normal')
    doc.setFontSize(g.ukuran ?? 9.5)
    doc.setTextColor(...(g.warna ?? TINTA))
  }
  const teks = (s: string, x: number, y: number, g: Gaya = {}) => {
    atur(g)
    doc.text(amanWinAnsi(s), x, y, { align: g.rata ?? 'left' })
  }
  const lebarTeks = (s: string, g: Gaya = {}) => {
    atur(g)
    return doc.getTextWidth(amanWinAnsi(s))
  }
  const bungkus = (s: string, lebar: number, g: Gaya = {}): string[] => {
    atur(g)
    return doc.splitTextToSize(amanWinAnsi(s), lebar) as string[]
  }
  /** Cetak paragraf, kembalikan y setelahnya. */
  const paragraf = (s: string, x: number, y: number, lebar: number, g: Gaya = {}): number => {
    const baris = bungkus(s, lebar, g)
    doc.text(baris, x, y, { lineHeightFactor: 1.32 })
    return y + baris.length * tinggiBaris(g.ukuran ?? 9.5)
  }
  const judul = (s: string, y: number) => teks(s, M, y, { ukuran: 9, tebal: true, warna: ABU })
  return { teks, lebarTeks, bungkus, paragraf, judul }
}

function langkahRapi(rentang: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200]) if (rentang / s <= 4) return s
  return 500
}

function gambarGrafik(doc: JsPdf, a: ReturnType<typeof alat>, deret: [number, number][], x0: number, y0: number, lebar: number, tinggi: number): void {
  if (deret.length < 2) {
    doc.setDrawColor(...GARIS)
    doc.setLineWidth(0.3)
    doc.rect(x0, y0, lebar, tinggi)
    a.teks('Deret waktu tidak tersedia', x0 + lebar / 2, y0 + tinggi / 2 + 1, { ukuran: 9, warna: ABU, rata: 'center' })
    return
  }
  const kiri = x0 + 9
  const kanan = x0 + lebar - 16
  const atas = y0 + 2
  const bawah = y0 + tinggi - 5
  const t0 = deret[0]![0]
  const t1 = deret[deret.length - 1]![0]
  const vMin = Math.min(...deret.map((d) => d[1]))
  const vMax = Math.max(0, ...deret.map((d) => d[1]))
  const langkah = langkahRapi(Math.max(2, vMax - vMin))
  const yB = Math.min(-langkah, Math.floor(vMin / langkah) * langkah)
  const yA = Math.ceil(vMax / langkah) * langkah
  const px = (t: number) => kiri + ((t - t0) / (t1 - t0)) * (kanan - kiri)
  const py = (v: number) => atas + ((yA - v) / (yA - yB)) * (bawah - atas)

  doc.setLineWidth(0.2)
  for (let v = yA; v >= yB - 1e-9; v -= langkah) {
    doc.setDrawColor(...(v === 0 ? ([170, 170, 182] as RGB) : GARIS))
    doc.line(kiri, py(v), kanan, py(v))
    a.teks(fmt(v), kiri - 1.5, py(v) + 1, { ukuran: 7, warna: ABU, rata: 'right' })
  }
  for (let th = Math.ceil(t0); th <= t1; th += 2) a.teks(String(th), px(th), y0 + tinggi - 0.8, { ukuran: 7, warna: ABU, rata: 'center' })

  doc.setDrawColor(...DATA)
  doc.setLineWidth(0.55)
  for (let i = 1; i < deret.length; i++) doc.line(px(deret[i - 1]![0]), py(deret[i - 1]![1]), px(deret[i]![0]), py(deret[i]![1]))
  const akhir = deret[deret.length - 1]!
  doc.setFillColor(...DATA)
  doc.circle(px(akhir[0]), py(akhir[1]), 0.9, 'F')
  a.teks(`${fmt(akhir[1], 0)} cm`, px(akhir[0]) + 2, py(akhir[1]) + 1, { ukuran: 8, tebal: true })
}

export async function buatLaporanPdf(d: DataLaporanPdf): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const a = alat(doc)
  const { kawasan: k, kategori, tenor, thresholds: t, meta } = d
  const adaData = k.memadai && k.laju != null

  // ---- kepala ----
  a.teks(APP.nama, M, 21, { ukuran: 14, tebal: true })
  a.teks(APP.tagline, M, 26, { ukuran: 9, warna: ABU })
  a.teks('Laporan Ambles', W - M, 21, { ukuran: 11, tebal: true, rata: 'right' })
  a.teks(`Dicetak ${fmtTanggal(new Date())}`, W - M, 26, { ukuran: 8.5, warna: ABU, rata: 'right' })
  doc.setDrawColor(...GARIS)
  doc.setLineWidth(0.3)
  doc.line(M, 30, W - M, 30)
  let y = 33

  // ---- penanda data demo ----
  if (meta.jenis === 'demo') {
    doc.setFillColor(255, 243, 209)
    doc.setDrawColor(214, 150, 0)
    doc.setLineWidth(0.35)
    doc.roundedRect(M, y, LEBAR, 11.5, 2, 2, 'FD')
    a.teks('DATA DEMO ILUSTRATIF', M + 4, y + 4.8, { ukuran: 9.5, tebal: true, warna: [90, 66, 0] })
    a.teks('Angka pada laporan ini adalah ilustrasi untuk demo, bukan hasil pengukuran. Jangan dipakai untuk keputusan.', M + 4, y + 9, { ukuran: 8.3, warna: [90, 66, 0] })
    y += 14.5
  }

  // ---- lokasi ----
  a.teks(`Kelurahan ${k.nama}`, M, y + 7, { ukuran: 19, tebal: true })
  a.teks(`Kecamatan ${k.kecamatan}, Kota Semarang`, M, y + 12.5, { ukuran: 10.5, warna: ABU })
  const periode = meta.periode[0] && meta.periode[1] ? `Periode data: ${fmtPeriode(meta.periode[0])} sampai ${fmtPeriode(meta.periode[1])}` : ''
  const label = d.label.length > 42 ? `${d.label.slice(0, 41)}...` : d.label
  a.teks(`Lokasi dipilih: ${label} (${fmtKoordinat(d.lngLat)})${periode ? `.  ${periode}` : ''}`, M, y + 17, { ukuran: 8.3, warna: ABU })
  y += 22

  // ---- status (kiri) + peta (kanan) ----
  const yKolom = y
  let yKanan = yKolom
  let lebarKiri = LEBAR
  if (d.gambarPeta) {
    try {
      const p = doc.getImageProperties(d.gambarPeta)
      const lebar = 72
      const tinggi = Math.min(50, (lebar * p.height) / p.width)
      const x = W - M - lebar
      doc.addImage(d.gambarPeta, d.gambarPeta.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', x, yKolom, lebar, tinggi)
      doc.setDrawColor(...GARIS)
      doc.setLineWidth(0.3)
      doc.rect(x, yKolom, lebar, tinggi)
      a.teks('Peta: © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap', W - M, yKolom + tinggi + 2.8, { ukuran: 5.8, warna: ABU, rata: 'right' })
      yKanan = yKolom + tinggi + 4
      lebarKiri = LEBAR - lebar - 8
    } catch {
      /* gambar peta tidak terbaca: lanjut tanpa peta */
    }
  }
  a.judul('Status kawasan', y + 3)
  if (adaData) {
    const angka = teksLaju(k.laju, k.sigma)
    a.teks(angka, M, y + 14, { ukuran: 24, tebal: true })
    a.teks('cm/tahun', M + a.lebarTeks(angka, { ukuran: 24, tebal: true }) + 2, y + 14, { ukuran: 10, warna: ABU })
  } else {
    a.teks('Data tidak memadai', M, y + 13, { ukuran: 17, tebal: true })
  }
  const labelKat = `Kategori: ${LABEL_KATEGORI[kategori]}`
  const lebarChip = a.lebarTeks(labelKat, { ukuran: 8.5, tebal: true }) + 7
  doc.setFillColor(...rgb(WARNA_KATEGORI.light[kategori]))
  doc.roundedRect(M, y + 17.5, lebarChip, 6.4, 3.2, 3.2, 'F')
  a.teks(labelKat, M + 3.5, y + 21.9, { ukuran: 8.5, tebal: true, warna: kategori === 'tinggi' || kategori === 'sedang' ? [255, 255, 255] : TINTA })
  const yKiri = a.paragraf(kalimatStatus(k.laju, k.sigma, kategori), M, y + 30, lebarKiri, { ukuran: 9.5 })
  y = Math.max(yKiri, yKanan) + 3

  // ---- riwayat ----
  a.judul('Riwayat penurunan', y + 3)
  y += 5.5
  if (adaData) {
    gambarGrafik(doc, a, k.deret, M, y, LEBAR, 28)
    a.teks('Perpindahan kumulatif (cm). Negatif = turun.', M, y + 31.5, { ukuran: 7.3, warna: ABU })
    y += 35
  } else {
    y = a.paragraf('Riwayat tidak ditampilkan karena data satelit di kawasan ini belum memadai.', M, y + 3, LEBAR, { ukuran: 9, warna: ABU }) + 3
  }

  // ---- proyeksi tenor ----
  a.judul('Proyeksi Tenor', y + 3)
  y += 5.5
  if (adaData) {
    const lebarSel = (LEBAR - 8) / 3
    TENORS.forEach((tn, i) => {
      const p = hitungProyeksi(k.laju!, k.sigma ?? 0, tn)
      const x = M + i * (lebarSel + 4)
      const aktif = tn === tenor
      doc.setFillColor(...(aktif ? ([238, 235, 252] as RGB) : ([246, 246, 249] as RGB)))
      doc.setDrawColor(...(aktif ? DATA : GARIS))
      doc.setLineWidth(aktif ? 0.6 : 0.3)
      doc.roundedRect(x, y, lebarSel, 17.5, 2, 2, 'FD')
      a.teks(`${tn} tahun${aktif ? ' (dipilih)' : ''}`, x + 4, y + 5, { ukuran: 8.3, tebal: aktif, warna: ABU })
      a.teks(teksProyeksi(p), x + 4, y + 11.6, { ukuran: 15, tebal: true })
      a.teks(`nilai tengah ${fmt(p.tengah)} cm`, x + 4, y + 15.6, { ukuran: 7.3, warna: ABU })
    })
    y += 22.5
    a.teks(kalimatProyeksi(hitungProyeksi(k.laju!, k.sigma ?? 0, tenor)), M, y, { ukuran: 10.5, tebal: true })
    a.teks('Rumus: laju × tenor, dengan rentang dari ketidakpastian laju. Tren masa lalu bisa berubah.', M, y + 4.3, { ukuran: 7.8, warna: ABU })
    y += 8
  } else {
    y = a.paragraf('Proyeksi tidak ditampilkan karena data satelit di kawasan ini belum memadai.', M, y + 3, LEBAR, { ukuran: 9, warna: ABU }) + 3
  }

  // ---- kaki: batasan, ambang, metode, sumber (ditambatkan ke bawah halaman) ----
  const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
  const gayaKaki: Gaya = { ukuran: 6.8, warna: ABU }
  const kaki = [
    `Batasan: ${BATASAN.join(' ')}`,
    `Kategori: rendah di bawah ${fmt(t.sedang, 1)}, sedang ${fmt(t.sedang, 1)} sampai di bawah ${fmt(t.tinggi, 1)}, tinggi mulai ${fmt(t.tinggi, 1)} cm/tahun (asumsi awal).`,
    `Metode: ${potong(meta.metode, 230)}`,
    `Sumber: ${meta.sumber.map((s) => s.nama).join('; ') || '-'}. Batas wilayah © OpenStreetMap contributors.`,
  ].flatMap((b) => a.bungkus(b, LEBAR, gayaKaki))
  const yKaki = H - 10 - kaki.length * tinggiBaris(6.8)

  // ---- langkah berikutnya (ukuran huruf menyesuaikan ruang tersisa) ----
  const { judul, butir } = langkahBerikutnya(kategori)
  const ruang = yKaki - 4 - y
  let ukuran = 9.5
  for (const u of [9.5, 9, 8.5, 8, 7.5, 7]) {
    ukuran = u
    const total = 9 + butir.reduce((sum, b) => sum + a.bungkus(b, LEBAR - 6, { ukuran: u }).length * tinggiBaris(u) + 1.1, 0)
    if (total <= ruang) break
  }
  a.judul('Langkah berikutnya', y + 3)
  a.teks(judul, M, y + 8.5, { ukuran: ukuran + 1, tebal: true })
  y += 13.5
  for (const b of butir) {
    doc.setDrawColor(...ABU)
    doc.setLineWidth(0.3)
    doc.rect(M, y - ukuran * 0.27, 2.6, 2.6)
    y = a.paragraf(b, M + 6, y, LEBAR - 6, { ukuran }) + 1.1
  }

  doc.setDrawColor(...GARIS)
  doc.setLineWidth(0.3)
  doc.line(M, yKaki - 3.2, W - M, yKaki - 3.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(...ABU)
  doc.text(kaki, M, yKaki, { lineHeightFactor: 1.32 })

  return doc.output('blob')
}

export async function unduhLaporanPdf(d: DataLaporanPdf): Promise<void> {
  const blob = await buatLaporanPdf(d)
  unduhBerkas(`laporan-ambles-${slug(d.kawasan.nama)}.pdf`, blob)
}
