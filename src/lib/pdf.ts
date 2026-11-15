// PDF Laporan Ambles: A4, vektor penuh (teks, garis, kotak) dengan jsPDF.
// Halaman 1: status, riwayat, proyeksi, langkah. Halaman 2: konteks lokasi (pola ruang, geologi, persil).
// jsPDF dimuat dinamis supaya tidak membebani muatan awal.
import type { jsPDF as JsPdf } from 'jspdf'
import { APP, batasan, LABEL_KATEGORI, TENORS, WARNA_KATEGORI } from './config'
import { unduhBerkas } from './data'
import { fmt, fmtKoordinat, fmtPeriode, fmtTanggal, slug } from './format'
import { CATATAN_PENAMPANG, LANGKAH_PERSIL, penampang as susunPenampang, RADIUS_PETA_MINI_M, SKALA_DAYA, SKALA_HUNIAN, type Penampang } from './penampang'
import { BHUMI, penjelasanGeologi, penjelasanPolaRuang, penjelasanSubzona, PERSIL_CATATAN, PERSIL_RINGKAS } from './penjelasan'
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
  /** true: angka berasal dari blok piksel di sekitar titik, bukan rata-rata kelurahan */
  titik?: boolean
  lebarBlokM?: number
  /** Kelas lapis konteks yang memuat titik (pola ruang, geologi). */
  konteks?: KonteksPdf[]
}

export interface KonteksPdf {
  jenis: 'rdtr' | 'rtrw' | 'geologi'
  /** Judul dan skala sumber, mis. "Peta Geologi Lembar Jakarta, 1:100.000". */
  sumber: string
  kode: string
  nama: string
  /** RDTR dan RTRW Kota: zona tempat sub-zona `nama` berada. */
  zona?: string
  fungsi?: string
  batuan?: string
  sifat?: string
  /** Kalimat pembacaan geologi terhadap laju terukur. */
  bacaan?: string | null
  /** Warna kelas di titik (sama dengan legenda peta). */
  warna?: string
  /** Fitur di sekitar titik untuk peta mini, terbesar dulu. */
  peta?: FiturPeta[]
}

export interface FiturPeta {
  nama: string
  warna: string
  /** Cincin luar tiap poligon (lon, lat). */
  cincin: Position[][]
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

/** Tanda merek SubTen (sama dengan Logo di ui/primitives.tsx, viewBox 32). */
function gambarLogo(doc: JsPdf, x: number, y: number, s: number): void {
  const k = s / 32
  doc.setFillColor(22, 22, 29)
  doc.roundedRect(x, y, s, s, 9 * k, 9 * k, 'F')
  doc.setDrawColor(150, 150, 160)
  doc.setLineWidth(1.8 * k)
  doc.setLineCap('round')
  doc.line(x + 5.5 * k, y + 16.5 * k, x + 9.1 * k, y + 16.5 * k)
  doc.line(x + 22.9 * k, y + 16.5 * k, x + 26.5 * k, y + 16.5 * k)
  doc.setLineCap('butt')
  doc.setFillColor(242, 242, 246)
  doc.lines(
    [
      [6 * k, -5.4 * k],
      [6 * k, 5.4 * k],
      [0, 6.6 * k],
      [-12 * k, 0],
    ],
    x + 10 * k,
    y + 15.4 * k,
    [1, 1],
    'F',
    true,
  )
  doc.setFillColor(22, 22, 29)
  doc.rect(x + 14.6 * k, y + 18 * k, 2.8 * k, 4 * k, 'F')
  doc.setFillColor(198, 241, 53)
  doc.roundedRect(x + 6 * k, y + 22.6 * k, 20 * k, 3 * k, 1.5 * k, 1.5 * k, 'F')
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
  const titik = d.titik === true
  const lebarBlok = d.lebarBlokM ?? 240
  const diSini = titik ? 'di sekitar titik ini' : 'di kawasan ini'

  // ---- kepala ----
  gambarLogo(doc, M, 15.5, 11)
  a.teks(APP.nama, M + 14, 21, { ukuran: 14, tebal: true })
  a.teks(`${APP.tagline} · ${APP.kepanjangan}`, M + 14, 26, { ukuran: 9, warna: ABU })
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
  const periode = meta.periode[0] && meta.periode[1] ? `Periode data: ${fmtPeriode(meta.periode[0])} sampai ${fmtPeriode(meta.periode[1])}` : ''
  const label = d.label.length > 42 ? `${d.label.slice(0, 41)}...` : d.label
  if (titik) {
    a.teks(label, M, y + 7, { ukuran: 19, tebal: true })
    a.teks(`Kelurahan ${k.nama}, Kecamatan ${k.kecamatan}, ${meta.wilayah}`, M, y + 12.5, { ukuran: 10.5, warna: ABU })
    a.teks(`Titik ${fmtKoordinat(d.lngLat)}. Angka dari blok sekitar ${lebarBlok} m di sekitar titik.${periode ? `  ${periode}` : ''}`, M, y + 17, { ukuran: 8.3, warna: ABU })
  } else {
    a.teks(`Kelurahan ${k.nama}`, M, y + 7, { ukuran: 19, tebal: true })
    a.teks(`Kecamatan ${k.kecamatan}, ${meta.wilayah}`, M, y + 12.5, { ukuran: 10.5, warna: ABU })
    a.teks(`Lokasi dipilih: ${label} (${fmtKoordinat(d.lngLat)})${periode ? `.  ${periode}` : ''}`, M, y + 17, { ukuran: 8.3, warna: ABU })
  }
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
  a.judul(titik ? 'Status di titik ini' : 'Status kawasan', y + 3)
  if (adaData) {
    const angka = teksLaju(Math.max(0, k.laju!), k.sigma)
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
  const yKiri = a.paragraf(kalimatStatus(k.laju, k.sigma, kategori, titik), M, y + 30, lebarKiri, { ukuran: 9.5 })
  y = Math.max(yKiri, yKanan) + 3

  // ---- riwayat ----
  a.judul('Riwayat penurunan', y + 3)
  y += 5.5
  if (adaData) {
    gambarGrafik(doc, a, k.deret, M, y, LEBAR, 28)
    a.teks('Perpindahan kumulatif (cm). Negatif = turun.', M, y + 31.5, { ukuran: 7.3, warna: ABU })
    y += 35
  } else {
    y = a.paragraf(`Riwayat tidak ditampilkan karena data satelit ${diSini} belum memadai.`, M, y + 3, LEBAR, { ukuran: 9, warna: ABU }) + 3
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
    y = a.paragraf(`Proyeksi tidak ditampilkan karena data satelit ${diSini} belum memadai.`, M, y + 3, LEBAR, { ukuran: 9, warna: ABU }) + 3
  }

  // ---- kaki: batasan, ambang, metode, sumber (ditambatkan ke bawah halaman) ----
  const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
  const gayaKaki: Gaya = { ukuran: 6.8, warna: ABU }
  const kaki = [
    `Batasan: ${batasan(titik, lebarBlok).join(' ')}`,
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

  halamanKonteks(doc, a, d, label)

  return doc.output('blob')
}

/** Halaman 2: konteks lokasi. Pola ruang, geologi, dan persil, dengan penjelasan untuk pembeli rumah. */
type Titik = [number, number]

/** n kalimat pertama: PDF memuat versi ringkas, aplikasi memuat teks lengkap. */
function ringkas(teks: string, n = 2): string {
  const k = teks.match(/[^.]+\.(\s|$)/g)
  return k ? k.slice(0, n).join('').trim() : teks
}

/** Potong poligon (meter, lokal) ke kotak [-r, r] (Sutherland-Hodgman). */
function klipKotak(ring: Titik[], r: number): Titik[] {
  let out = ring
  const tepi: [0 | 1, number, 1 | -1][] = [
    [0, -r, 1],
    [0, r, -1],
    [1, -r, 1],
    [1, r, -1],
  ]
  for (const [ax, v, sg] of tepi) {
    const masuk = out
    out = []
    if (!masuk.length) break
    const potong = (p: Titik, q: Titik): Titik => {
      const t = (v - p[ax]) / (q[ax] - p[ax])
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]
    }
    for (let i = 0; i < masuk.length; i++) {
      const kini = masuk[i]!
      const lalu = masuk[(i + masuk.length - 1) % masuk.length]!
      const dalamKini = sg * (kini[ax] - v) >= 0
      const dalamLalu = sg * (lalu[ax] - v) >= 0
      if (dalamKini) {
        if (!dalamLalu) out.push(potong(lalu, kini))
        out.push(kini)
      } else if (dalamLalu) out.push(potong(lalu, kini))
    }
  }
  return out
}

function poligon(doc: JsPdf, pts: Titik[], gaya: 'F' | 'FD' | 'S'): void {
  if (pts.length < 3) return
  const seg = pts.slice(1).map((p, i): [number, number] => [p[0] - pts[i]![0], p[1] - pts[i]![1]])
  doc.lines(seg, pts[0]![0], pts[0]![1], [1, 1], gaya, true)
}

/** Peta mini sekitar titik: kelas lapis konteks dalam radius RADIUS_PETA_MINI_M, penanda titik, skala, dan arah utara. */
function gambarPetaMini(doc: JsPdf, a: ReturnType<typeof alat>, x: number, y: number, uk: number, pusat: Position, fitur: FiturPeta[], namaDiTitik: string): number {
  const R = RADIUS_PETA_MINI_M
  const k = uk / (2 * R)
  const cos = Math.cos((pusat[1] * Math.PI) / 180)
  const keMm = (m: Titik): Titik => [x + (m[0] + R) * k, y + (R - m[1]) * k]
  doc.setFillColor(243, 243, 246)
  doc.rect(x, y, uk, uk, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.15)
  for (const f of fitur) {
    doc.setFillColor(...rgb(/^#[0-9a-f]{6}$/i.test(f.warna) ? f.warna : '#c9c9d1'))
    for (const c of f.cincin) {
      const m = klipKotak(
        c.map((p): Titik => [(p[0] - pusat[0]) * 111320 * cos, (p[1] - pusat[1]) * 110540]),
        R,
      )
      poligon(doc, m.map(keMm), 'FD')
    }
  }
  doc.setDrawColor(...GARIS)
  doc.setLineWidth(0.3)
  doc.rect(x, y, uk, uk)
  // penanda titik
  const [px, py] = keMm([0, 0])
  doc.setFillColor(255, 255, 255)
  doc.circle(px, py, 2.2, 'F')
  doc.setFillColor(198, 241, 53)
  doc.setDrawColor(22, 22, 29)
  doc.setLineWidth(0.5)
  doc.circle(px, py, 1.4, 'FD')
  // skala 250 m
  const p250 = 250 * k
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(x + 1.5, y + uk - 6.2, p250 + 4, 4.7, 1, 1, 'F')
  doc.setFillColor(22, 22, 29)
  doc.rect(x + 3.5, y + uk - 3, p250, 0.8, 'F')
  a.teks('250 m', x + 3.5, y + uk - 3.6, { ukuran: 5.8, tebal: true })
  // utara
  doc.setFillColor(22, 22, 29)
  doc.triangle(x + uk - 4, y + 2.2, x + uk - 5.6, y + 6.2, x + uk - 2.4, y + 6.2, 'F')
  a.teks('U', x + uk - 4, y + 9, { ukuran: 6, tebal: true, rata: 'center' })
  // legenda: kelas di titik dulu, lalu kelas lain di sekitar, paling banyak tiga
  const nama = [namaDiTitik, ...fitur.map((f) => f.nama).filter((n) => n !== namaDiTitik)]
  const unik = [...new Set(nama)].slice(0, 3)
  let yy = y + uk + 3.6
  for (const n of unik) {
    const f = fitur.find((ff) => ff.nama === n)
    doc.setFillColor(...rgb(f && /^#[0-9a-f]{6}$/i.test(f.warna) ? f.warna : '#c9c9d1'))
    doc.rect(x, yy - 2.3, 2.6, 2.6, 'F')
    const teks = n.replace(/^Kawasan (Peruntukan )?/, '')
    a.teks(teks.length > 30 ? `${teks.slice(0, 29)}…` : teks, x + 3.8, yy, { ukuran: 6.8, tebal: n === namaDiTitik, warna: n === namaDiTitik ? TINTA : ABU })
    yy += 3.6
  }
  return yy
}

/** Skala tiga tingkat; tingkat aktif diisi tinta, atau kuning bila perlu diwaspadai. */
function gambarStrip(doc: JsPdf, a: ReturnType<typeof alat>, x: number, y: number, w: number, judul: string, opsi: { nilai: string; label: string }[], aktif: string, waspada: boolean): number {
  a.teks(judul.toUpperCase(), x, y, { ukuran: 7, tebal: true, warna: ABU })
  const lebar = (w - 2 * 1.5) / 3
  opsi.forEach((o, i) => {
    const xx = x + i * (lebar + 1.5)
    const ini = o.nilai === aktif
    doc.setFillColor(...((ini ? (waspada ? [255, 236, 179] : [22, 22, 29]) : [240, 240, 244]) as RGB))
    doc.roundedRect(xx, y + 2, lebar, 7, 1.8, 1.8, 'F')
    a.teks(o.label, xx + lebar / 2, y + 6.6, { ukuran: 7.8, tebal: ini, warna: ini ? (waspada ? [90, 66, 0] : [255, 255, 255]) : ABU, rata: 'center' })
  })
  return y + 13
}

/** Penampang tanah: rumah di atas lapisan; tiang dan panah memadat untuk tanah lunak. */
function gambarPenampang(doc: JsPdf, a: ReturnType<typeof alat>, x: number, y: number, w: number, h: number, data: Penampang): number {
  const kolom = w * 0.46
  const tanah = y + h * 0.26
  const dasar = y + h
  let yy = tanah
  const lapis = data.lapisan.map((l) => {
    const t = l.porsi * (dasar - tanah)
    const r = { ...l, y: yy, t }
    yy += t
    return r
  })
  for (const l of lapis) {
    doc.setFillColor(...rgb(/^#[0-9a-f]{6}$/i.test(l.warna) ? l.warna : '#c9c9d1'))
    doc.rect(x, l.y, kolom, l.t, 'F')
    // pola: titik, gelombang, atau arsir
    doc.setDrawColor(0, 0, 0)
    doc.setFillColor(110, 100, 90)
    doc.setLineWidth(0.15)
    if (l.pola === 'titik') {
      for (let gy = l.y + 1.2; gy < l.y + l.t - 0.5; gy += 2) for (let gx = x + 1 + ((gy - l.y) % 4 > 2 ? 1 : 0); gx < x + kolom - 0.5; gx += 2) doc.circle(gx, gy, 0.18, 'F')
    } else if (l.pola === 'gelombang') {
      for (let gy = l.y + 1.6; gy < l.y + l.t - 0.8; gy += 2.2) {
        const seg: [number, number][] = []
        for (let gx = 0; gx + 1.5 <= kolom - 1; gx += 1.5) seg.push([1.5, seg.length % 2 ? 0.6 : -0.6])
        doc.setDrawColor(120, 110, 100)
        doc.lines(seg, x + 0.5, gy, [1, 1], 'S', false)
      }
    } else {
      doc.setDrawColor(90, 86, 80)
      for (let gy = l.y + 1.6; gy < l.y + l.t - 0.6; gy += 2) for (let gx = x + 0.8; gx < x + kolom - 1.4; gx += 2) doc.line(gx, gy + 0.6, gx + 1.1, gy - 0.6)
    }
    // label
    const [judul, ket] = l.nama.split(': ')
    const ym = l.y + l.t / 2
    doc.setDrawColor(...GARIS)
    doc.setLineWidth(0.25)
    doc.line(x + kolom, ym, x + kolom + 2.5, ym)
    a.teks(judul!, x + kolom + 3.5, ket ? ym - 0.4 : ym + 1, { ukuran: 7.3, tebal: !!l.utama })
    if (ket) a.teks(ket, x + kolom + 3.5, ym + 2.9, { ukuran: 6.8, warna: ABU })
  }
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.3)
  for (const l of lapis.slice(1)) doc.line(x, l.y, x + kolom, l.y)
  doc.setDrawColor(...GARIS)
  doc.rect(x, tanah, kolom, dasar - tanah)
  const tengah = x + kolom * 0.42
  const lebarRumah = kolom * 0.3
  // tiang
  if (data.tiang) {
    const akhir = lapis[lapis.length - 1]!
    doc.setDrawColor(...TINTA)
    doc.setLineWidth(0.7)
    doc.setLineDashPattern([1.2, 0.9], 0)
    for (const dx of [-0.32, 0.32]) doc.line(tengah + dx * lebarRumah, tanah, tengah + dx * lebarRumah, akhir.y + 1.2)
    doc.setLineDashPattern([], 0)
  }
  // panah memadat
  const utama = lapis.find((l) => l.utama)
  if (data.memadat && utama) {
    const ax = x + kolom * 0.86
    doc.setDrawColor(...TINTA)
    doc.setLineWidth(0.55)
    doc.line(ax, utama.y + 2, ax, utama.y + utama.t - 3.4)
    doc.setFillColor(...TINTA)
    doc.triangle(ax - 1.3, utama.y + utama.t - 3.6, ax + 1.3, utama.y + utama.t - 3.6, ax, utama.y + utama.t - 1.4, 'F')
  }
  // muka tanah dan rumah
  doc.setDrawColor(...TINTA)
  doc.setLineWidth(0.5)
  doc.line(x - 1, tanah, x + kolom + 1, tanah)
  const tinggiRumah = (tanah - y) * 0.48
  doc.setFillColor(255, 255, 255)
  doc.rect(tengah - lebarRumah / 2, tanah - tinggiRumah, lebarRumah, tinggiRumah, 'FD')
  doc.triangle(tengah - lebarRumah / 2 - 1.2, tanah - tinggiRumah, tengah + lebarRumah / 2 + 1.2, tanah - tinggiRumah, tengah, y + 0.6, 'FD')
  doc.setFillColor(...TINTA)
  doc.rect(tengah - lebarRumah * 0.1, tanah - tinggiRumah * 0.6, lebarRumah * 0.2, tinggiRumah * 0.6, 'F')
  const catatan = `${data.tiang ? 'Garis putus: pondasi tiang. Panah: lapisan lunak memadat. ' : ''}${CATATAN_PENAMPANG}`
  return a.paragraf(catatan, x, dasar + 3.2, w, { ukuran: 6.6, warna: ABU })
}

/** Langkah bernomor berjajar. */
function gambarLangkah(doc: JsPdf, a: ReturnType<typeof alat>, x: number, y: number, w: number, langkah: string[]): number {
  const lebar = (w - 2 * 3) / langkah.length
  let bawah = y
  langkah.forEach((l, i) => {
    const xx = x + i * (lebar + 3)
    doc.setFillColor(246, 246, 249)
    doc.roundedRect(xx, y, lebar, 11.5, 2, 2, 'F')
    doc.setFillColor(22, 22, 29)
    doc.circle(xx + 4.6, y + 5.75, 2.4, 'F')
    a.teks(String(i + 1), xx + 4.6, y + 6.85, { ukuran: 8, tebal: true, warna: [255, 255, 255], rata: 'center' })
    const yb = a.paragraf(l, xx + 8.6, y + 4.6, lebar - 10.5, { ukuran: 7.6, tebal: true })
    bawah = Math.max(bawah, yb, y + 11.5)
  })
  return bawah + 2
}

/** Halaman 2: konteks lokasi. Pola ruang, geologi, dan persil, dengan visual dan penjelasan untuk pembeli rumah. */
function halamanKonteks(doc: JsPdf, a: ReturnType<typeof alat>, d: DataLaporanPdf, label: string): void {
  doc.addPage()
  const kepala = () => {
    gambarLogo(doc, M, 13, 8)
    a.teks(APP.nama, M + 10.5, 18.6, { ukuran: 11, tebal: true })
    a.teks(`Laporan Ambles: ${label}`, W - M, 18.6, { ukuran: 8.5, warna: ABU, rata: 'right' })
    doc.setDrawColor(...GARIS)
    doc.setLineWidth(0.3)
    doc.line(M, 23, W - M, 23)
  }
  kepala()
  let y = 31
  const batasBawah = H - 14
  const pastikan = (ruang: number) => {
    if (y + ruang <= batasBawah) return
    doc.addPage()
    kepala()
    y = 31
  }
  const sub = (judul: string, isi: string, x = M, w = LEBAR) => {
    const tinggi = 4 + a.bungkus(isi, w, { ukuran: 8.5 }).length * tinggiBaris(8.5)
    pastikan(tinggi + 2)
    a.teks(judul.toUpperCase(), x, y, { ukuran: 7, tebal: true, warna: ABU })
    y = a.paragraf(isi, x, y + 3.7, w, { ukuran: 8.5 }) + 1.5
  }
  /** Daftar periksa dua kolom. */
  const periksa = (judul: string, butir: string[]) => {
    const lebarKol = (LEBAR - 6) / 2
    const gaya: Gaya = { ukuran: 8.3 }
    const tinggiButir = butir.map((b) => a.bungkus(b, lebarKol - 5.5, gaya).length * tinggiBaris(8.3) + 1)
    const baris = Math.ceil(butir.length / 2)
    const tinggi = 4 + Array.from({ length: baris }, (_, r) => Math.max(tinggiButir[2 * r] ?? 0, tinggiButir[2 * r + 1] ?? 0)).reduce((x, t) => x + t, 0)
    pastikan(tinggi + 2)
    a.teks(judul.toUpperCase(), M, y, { ukuran: 7, tebal: true, warna: ABU })
    y += 4
    for (let r = 0; r < baris; r++) {
      let bawah = y
      for (let c = 0; c < 2; c++) {
        const b = butir[2 * r + c]
        if (!b) continue
        const x = M + c * (lebarKol + 6)
        doc.setDrawColor(...ABU)
        doc.setLineWidth(0.3)
        doc.rect(x, y - 2.4, 2.6, 2.6)
        bawah = Math.max(bawah, a.paragraf(b, x + 5.5, y, lebarKol - 5.5, gaya) + 1)
      }
      y = bawah
    }
    y += 0.8
  }
  const garisPemisah = () => {
    pastikan(8)
    doc.setDrawColor(...GARIS)
    doc.setLineWidth(0.3)
    doc.line(M, y, W - M, y)
    y += 5.5
  }

  a.teks('Konteks lokasi', M, y, { ukuran: 15, tebal: true })
  y = a.paragraf(
    'Membantu membaca angka laju, tidak mengubah kategori. Kepastian untuk satu persil ada di KKPR, PBG, sertifikat, dan penyelidikan tanah.',
    M,
    y + 5.5,
    LEBAR,
    { ukuran: 8.5, warna: ABU },
  ) + 4
  const sumberKonteks: string[] = []

  const PETA = 40
  const xKanan = M + PETA + 7
  const wKanan = LEBAR - PETA - 7

  for (const kx of d.konteks ?? []) {
    pastikan(80)
    const yAwal = y
    a.judul(kx.jenis === 'rdtr' ? 'ZONA RDTR' : kx.jenis === 'rtrw' ? 'POLA RUANG RTRW' : 'GEOLOGI PERMUKAAN', y)
    const beda = !!kx.zona && kx.zona !== kx.nama
    a.teks(kx.jenis === 'geologi' && kx.kode ? `${kx.nama}  (${kx.kode})` : kx.nama, M, y + 6, { ukuran: 12.5, tebal: true })
    if (beda) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12.5)
      a.teks(`zona ${kx.zona}`, M + doc.getTextWidth(kx.nama) + 3, y + 6, { ukuran: 8.5, warna: ABU })
    }
    y += 10.5
    const yBaris = y
    // kolom kiri: peta mini (legenda per zona)
    const yKiri = kx.peta?.length ? gambarPetaMini(doc, a, M, yBaris, PETA, d.lngLat, kx.peta, kx.zona ?? kx.nama) : yBaris
    // kolom kanan: skala dan visual utama
    let yKn = yBaris + 2.5
    if (kx.jenis !== 'geologi') {
      const pr = penjelasanPolaRuang(kx.kode, kx.zona ?? kx.nama)
      const subzona = penjelasanSubzona(kx.nama)
      if (pr) {
        yKn = gambarStrip(doc, a, xKanan, yKn, wKanan, 'Status untuk rumah tinggal', SKALA_HUNIAN, pr.hunian, pr.hunian === 'tidak') + 2
        y = yKn
        sub('Artinya', subzona ? `${pr.arti} ${subzona}` : pr.arti, xKanan, wKanan)
        sub('Untuk membeli rumah', pr.untukRumah, xKanan, wKanan)
        if (pr.catatan) sub('Kaitan dengan ambles', pr.catatan, xKanan, wKanan)
        yKn = y
      }
      y = Math.max(yKiri, yKn) + 1
    } else {
      const geo = penjelasanGeologi(kx.kode)
      if (geo) {
        yKn = gambarStrip(doc, a, xKanan, yKn, wKanan, `Kerentanan memadat  ·  ${geo.umur.split(',')[0]}`, SKALA_DAYA, geo.daya, geo.daya === 'lunak') + 2
        yKn = gambarPenampang(doc, a, xKanan, yKn, wKanan, 33, susunPenampang(geo.daya, kx.warna ?? '#c9c9d1', kx.nama))
      }
      y = Math.max(yKiri, yKn) + 2
      if (kx.bacaan) sub('Dibanding laju di titik ini', kx.bacaan)
      if (geo) {
        sub('Kaitan dengan ambles', ringkas(geo.ambles))
        sub('Untuk bangunan', ringkas(geo.bangunan))
        periksa('Tanyakan ke penjual', geo.tanyakan)
      }
    }
    if (y < yAwal) y = yAwal
    const jenisSumber =
      kx.jenis === 'rdtr' ? 'zona RDTR (rencana, bukan guna lahan saat ini)' : kx.jenis === 'rtrw' ? 'pola ruang RTRW (rencana peruntukan, bukan guna lahan saat ini)' : 'geologi'
    sumberKonteks.push(`${jenisSumber}: ${kx.sumber}`)
    garisPemisah()
  }

  // ---- persil ----
  pastikan(36)
  a.judul('BATAS PERSIL DAN SERTIFIKAT', y)
  a.teks(PERSIL_RINGKAS, M, y + 5, { ukuran: 8.3, warna: ABU })
  y = gambarLangkah(doc, a, M, y + 7.5, LEBAR, LANGKAH_PERSIL)
  a.teks(`Titik: ${d.lngLat[1].toFixed(6)}, ${d.lngLat[0].toFixed(6)}`, M, y + 2.2, { ukuran: 8.3 })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.3)
  doc.setTextColor(...DATA)
  doc.textWithLink(`${BHUMI.nama}: ${BHUMI.url.replace('https://', '')}`, W - M, y + 2.2, { url: BHUMI.url, align: 'right' })
  y = a.paragraf(PERSIL_CATATAN, M, y + 6.3, LEBAR, { ukuran: 7, warna: ABU }) + 1.5
  if (sumberKonteks.length) {
    const teks = `Sumber ${sumberKonteks.join('; ')}. Peta mini: radius ${RADIUS_PETA_MINI_M} m di sekitar titik.`
    pastikan(a.bungkus(teks, LEBAR, { ukuran: 6.4 }).length * tinggiBaris(6.4) + 2)
    a.paragraf(teks, M, y, LEBAR, { ukuran: 6.4, warna: ABU })
  }
}

export async function unduhLaporanPdf(d: DataLaporanPdf): Promise<void> {
  const blob = await buatLaporanPdf(d)
  unduhBerkas(`laporan-subten-${slug(d.titik ? `${d.label} ${d.kawasan.nama}` : d.kawasan.nama)}.pdf`, blob)
}
