// Bangun DATA DEMO ILUSTRATIF untuk PANTAU AMBLES.
//
// PENTING: angka laju di sini BUKAN hasil pengukuran. Ini model ilustratif yang
// meniru pola umum dari publikasi (makin ke utara dan timur makin cepat,
// perbukitan selatan mendekati nol) supaya antarmuka bisa didemokan sebelum
// olahan Sentinel-1 selesai. Hasil olah asli ditulis oleh pipeline/06_ekspor.py
// dengan format file yang sama.
//
// Masukan : data-raw/semarang-kelurahan.geojson, data-raw/semarang-kota.geojson
// Keluaran: public/data/semarang-grid.json        kepala grid piksel (sekitar 80 m)
//           public/data/semarang-grid-laju.bin    Int16 per piksel, x skalaLaju = cm/tahun
//           public/data/semarang-grid-sigma.bin   Int16 per piksel, galat ukur
//           public/data/semarang-grid-deret.bin   Int16, deret triwulanan piksel valid
//           public/data/semarang-kawasan.geojson  agregat per kelurahan (dihitung dari grid)
// Jalankan: npm run data:demo

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import mapshaper from 'mapshaper'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RAW = path.resolve(__dirname, '../data-raw')
const OUT_DIR = path.resolve(__dirname, '../public/data')

// ---------- util ----------
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
function inRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const inGeom = (pt, g) => polys(g).some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h)))
function bboxOf(g) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of polys(g)) for (const [x, y] of p[0]) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return [w, s, e, n]
}
function ringAreaKm2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180)
  const kx = 111.32 * Math.cos(lat0)
  const ky = 110.57
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky)
  return Math.abs(a) / 2
}
function pusat(g) {
  const big = polys(g).slice().sort((a, b) => ringAreaKm2(b[0]) - ringAreaKm2(a[0]))[0]
  const ring = big[0]
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += f
    cx += (ring[j][0] + ring[i][0]) * f
    cy += (ring[j][1] + ring[i][1]) * f
  }
  const c = a === 0 ? ring[0] : [cx / (3 * a), cy / (3 * a)]
  if (inGeom(c, g)) return c
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  for (let i = 1; i < 30; i++) for (let j = 1; j < 30; j++) {
    const p = [x0 + ((x1 - x0) * i) / 30, y0 + ((y1 - y0) * j) / 30]
    if (inGeom(p, g)) return p
  }
  return c
}
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return pts[pts.length - 1][1]
}
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** Derau halus 2D (interpolasi kisi acak), keluaran -1..1. Membuat pola yang menyambung antarpiksel. */
function derau(lon, lat, skala, benih) {
  const x = lon / skala, y = lat / skala
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const h = (i, j) => (hash(`${benih}|${i}|${j}`) / 4294967295) * 2 - 1
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx
  return a + (b - a) * sy
}
function kuantil(urut, q) {
  if (!urut.length) return NaN
  const p = (urut.length - 1) * q
  const a = Math.floor(p), b = Math.ceil(p)
  return urut[a] + (urut[b] - urut[a]) * (p - a)
}
const median = (arr) => kuantil(arr.slice().sort((a, b) => a - b), 0.5)
const r1 = (v) => Math.round(v * 10) / 10
const r2 = (v) => Math.round(v * 100) / 100
const r6 = (v) => Math.round(v * 1e6) / 1e6
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// ---------- parameter model ilustratif ----------
// Garis kaki bukit (batas selatan dataran aluvial), lintang per bujur. Perkiraan kasar.
const KAKI_BUKIT = [
  [110.28, -6.99], [110.33, -6.982], [110.36, -6.978], [110.39, -6.99], [110.41, -6.994],
  [110.43, -6.998], [110.45, -7.006], [110.47, -7.016], [110.5, -7.03],
]
// Laju maksimum (cm/tahun) per bujur: makin ke timur makin besar.
const LAJU_MAKS = [
  [110.28, 3.0], [110.33, 4.0], [110.37, 5.5], [110.4, 7.8], [110.43, 9.0], [110.46, 10.4], [110.5, 10.8],
]
// Koherensi dasar per kecamatan (permukiman rapat tinggi; vegetasi/tambak rendah).
const KOHERENSI = {
  'Semarang Tengah': 0.74, 'Semarang Utara': 0.68, 'Semarang Timur': 0.72, Gayamsari: 0.7, Genuk: 0.58,
  Pedurungan: 0.66, 'Semarang Selatan': 0.7, Candisari: 0.64, Gajahmungkur: 0.6, Tembalang: 0.5,
  Banyumanik: 0.52, Gunungpati: 0.31, 'Semarang Barat': 0.64, Ngaliyan: 0.46, Mijen: 0.29, Tugu: 0.4,
}
const T0 = 2020
const T1 = 2026.75
const SEL = 0.00072 // derajat, sekitar 80 m di lintang Semarang
const UKURAN_SEL_M = 80
const NODATA = -32768 // di dalam kota tetapi tidak terukur
const LUAR = -32767 // di luar batas kota
const SKALA_LAJU = 0.01 // nilai Int16 x skala = cm/tahun
const SKALA_DERET = 0.1 // nilai Int16 x skala = cm
const AMBANG_KOHERENSI = 0.42
// Agregat kelurahan dianggap memadai bila piksel valid cukup banyak dan cukup merata.
const MIN_PIKSEL = 15
const MIN_CAKUPAN = 0.2

// ---------- masukan ----------
const rawKel = await readFile(path.join(RAW, 'semarang-kelurahan.geojson'), 'utf8')
const kota = JSON.parse(await readFile(path.join(RAW, 'semarang-kota.geojson'), 'utf8')).features[0]

// Sederhanakan geometri (menjaga topologi antar-kelurahan) supaya file ringan.
const hasil = await mapshaper.applyCommands('-i in.geojson -simplify 14% keep-shapes -o out.geojson precision=0.00001', {
  'in.geojson': rawKel,
})
const kel = JSON.parse(hasil['out.geojson'].toString())
const daftar = kel.features.map((f) => ({ f, bbox: bboxOf(f.geometry) }))

// Lintang batas utara kota per bujur (maks lintang verteks per kolom 0,005 derajat).
const kolom = new Map()
for (const poly of polys(kota.geometry)) for (const p of poly[0]) {
  const k = Math.round(p[0] / 0.005)
  if (!kolom.has(k) || kolom.get(k) < p[1]) kolom.set(k, p[1])
}
const pantai = [...kolom.entries()].sort((a, b) => a[0] - b[0]).map(([k, lat]) => [k * 0.005, lat])
const lintangPantai = (lon) => interp(pantai, lon)

// ---------- grid piksel ----------
const semua = daftar.reduce((b, d) => [Math.min(b[0], d.bbox[0]), Math.min(b[1], d.bbox[1]), Math.max(b[2], d.bbox[2]), Math.max(b[3], d.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity])
const barat = Math.floor(semua[0] / SEL) * SEL
const utara = Math.ceil(semua[3] / SEL) * SEL
const nx = Math.ceil((semua[2] - barat) / SEL)
const ny = Math.ceil((utara - semua[1]) / SEL)
const N = nx * ny

const laju = new Int16Array(N).fill(LUAR)
const sig = new Int16Array(N).fill(LUAR)
const milik = new Int16Array(N).fill(-1) // indeks kelurahan tiap piksel
const kohPx = new Float32Array(N)
const posisi = new Int32Array(N).fill(-1) // urutan piksel valid (untuk file deret)
let nValid = 0
let nDalam = 0

let terakhir = -1
for (let row = 0; row < ny; row++) {
  for (let col = 0; col < nx; col++) {
    const lon = barat + (col + 0.5) * SEL
    const lat = utara - (row + 0.5) * SEL
    const pt = [lon, lat]
    // piksel bertetangga biasanya satu kelurahan: coba yang terakhir dulu
    let m = -1
    if (terakhir >= 0 && inGeom(pt, daftar[terakhir].f.geometry)) m = terakhir
    else {
      for (let k = 0; k < daftar.length; k++) {
        const b = daftar[k].bbox
        if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue
        if (inGeom(pt, daftar[k].f.geometry)) {
          m = k
          break
        }
      }
    }
    if (m < 0) continue
    terakhir = m
    const i = row * nx + col
    milik[i] = m
    nDalam++

    const kec = daftar[m].f.properties.kecamatan
    const jarakPantai = Math.max(0, (lintangPantai(lon) - lat) * 110.57)
    let p = (KOHERENSI[kec] ?? 0.5) + 0.2 * derau(lon, lat, 0.0045, 'koh') + 0.06 * derau(lon, lat, 0.0012, 'koh2')
    if (jarakPantai < 1.2 && (kec === 'Tugu' || kec === 'Genuk')) p -= 0.12 // tambak
    p = clamp(p, 0.05, 0.95)
    kohPx[i] = p
    if (p < AMBANG_KOHERENSI) {
      laju[i] = NODATA
      sig[i] = NODATA
      continue
    }
    // Laju: naik seiring jarak ke utara dari kaki bukit, skala membesar ke timur.
    const n = Math.max(0, (lat - interp(KAKI_BUKIT, lon)) * 110.57)
    const dasar = interp(LAJU_MAKS, lon) * (1 - Math.exp(-((n / 3.2) ** 1.6)))
    const rnd = mulberry32(hash(`px|${i}`))
    const v = dasar * (1 + 0.2 * derau(lon, lat, 0.006, 'a')) + 0.3 * derau(lon, lat, 0.015, 'b') + (rnd() - 0.5) * 0.3
    laju[i] = Math.round(clamp(v, -1, 300) / SKALA_LAJU)
    sig[i] = Math.round((0.15 + 0.02 * Math.max(0, v) + (1 - p) * 0.3) / SKALA_LAJU)
    posisi[i] = nValid++
  }
}

// Deret waktu triwulanan per piksel valid: tren linear + musiman kecil + derau.
const epoch = []
for (let t = T0; t <= T1 + 1e-9; t += 0.25) epoch.push(r2(t))
const nEpoch = epoch.length
const deret = new Int16Array(nValid * nEpoch)
for (let i = 0; i < N; i++) {
  const j = posisi[i]
  if (j < 0) continue
  const rnd = mulberry32(hash(`ts|${i}`))
  const fase = rnd() * Math.PI * 2
  const L = laju[i] * SKALA_LAJU
  const musim0 = 0.3 * Math.sin(2 * Math.PI * T0 + fase)
  for (let e = 0; e < nEpoch; e++) {
    const t = epoch[e]
    const v = e === 0 ? 0 : -(L * (t - T0)) + 0.3 * Math.sin(2 * Math.PI * t + fase) - musim0 + (rnd() - 0.5) * 0.5
    deret[j * nEpoch + e] = Math.round(v / SKALA_DERET)
  }
}

// ---------- agregat per kelurahan (dari grid) ----------
const kumpul = daftar.map(() => ({ total: 0, koh: 0, piksel: [] }))
for (let i = 0; i < N; i++) {
  const m = milik[i]
  if (m < 0) continue
  kumpul[m].total++
  kumpul[m].koh += kohPx[i]
  if (posisi[i] >= 0) kumpul[m].piksel.push(i)
}

const features = daftar.map(({ f }, m) => {
  const { id, nama, kecamatan } = f.properties
  const a = kumpul[m]
  const c = pusat(f.geometry)
  const jarakPantaiKm = r1(Math.max(0, (lintangPantai(c[0]) - c[1]) * 110.57))
  const nPiksel = a.piksel.length
  const cakupan = a.total ? nPiksel / a.total : 0
  const memadai = nPiksel >= MIN_PIKSEL && cakupan >= MIN_CAKUPAN
  const koherensi = a.total ? r2(a.koh / a.total) : null

  let lajuKel = null, sigma = null, sebaran = null
  let deretKel = []
  if (memadai) {
    const nilai = a.piksel.map((i) => laju[i] * SKALA_LAJU).sort((x, y) => x - y)
    const med = kuantil(nilai, 0.5)
    const mad = median(nilai.map((x) => Math.abs(x - med)))
    const ukur = median(a.piksel.map((i) => sig[i] * SKALA_LAJU))
    lajuKel = r1(med)
    sigma = r1(Math.sqrt((1.4826 * mad) ** 2 + ukur ** 2))
    sebaran = [r1(kuantil(nilai, 0.1)), r1(kuantil(nilai, 0.9))]
    deretKel = epoch.map((t, e) => [t, r1(median(a.piksel.map((i) => deret[posisi[i] * nEpoch + e])) * SKALA_DERET)])
    deretKel[0][1] = 0
  }
  return {
    type: 'Feature',
    properties: { id, nama, kecamatan, laju: lajuKel, sigma, sebaran, nPiksel, koherensi, memadai, deret: deretKel, jarakPantaiKm },
    geometry: f.geometry,
  }
})

// ---------- tulis ----------
const dibuat = new Date().toISOString().slice(0, 10)
const metadata = {
  jenis: 'demo',
  judul: 'Data demo ilustratif laju penurunan tanah',
  wilayah: 'Kota Semarang',
  periode: ['2020-01', '2026-10'],
  metode:
    'Model ilustratif per piksel 80 m, bukan pengukuran. Pola spasial meniru rentang publikasi: makin ke utara dan timur makin cepat, perbukitan selatan mendekati nol. Akan diganti hasil olah Sentinel-1 (ASF HyP3 + MintPy/SBAS).',
  sumber: [
    { nama: 'Batas kelurahan: © OpenStreetMap contributors (ODbL)', url: 'https://www.openstreetmap.org/copyright' },
    {
      nama: 'Rentang pembanding: Chaussard, Amelung, Abidin & Hong (2013), InSAR 2007-2009',
      url: 'https://earth.esa.int/eogateway/documents/20142/37627/Sinking-cities-Indonesia-space-geodetic-evidence-rates-spatial-distribution-land-subsidence.pdf',
      catatan: 'Semarang hingga sekitar 14 cm/tahun, sebagaimana dirujuk di rangkuman tim.',
    },
    {
      nama: 'Rentang pembanding: Pujiastuti dkk. (2015), Semarang Timur dan Tanah Mas',
      url: 'https://ejournal.undip.ac.id/index.php/mkts/article/download/11225/8815',
      catatan: 'Tanah Mas 5,5-7,2 cm/tahun, sebagaimana dirujuk di rangkuman tim.',
    },
  ],
  dibuat,
  catatan: 'Angka pada data ini adalah ilustrasi untuk demo antarmuka. Jangan dipakai untuk keputusan membeli, membangun, atau membiayai rumah.',
}
const kepala = {
  versi: 1,
  jenis: 'demo',
  dibuat,
  /** [barat, selatan, timur, utara] tepi luar grid; baris 0 = paling utara */
  bbox: [r6(barat), r6(utara - ny * SEL), r6(barat + nx * SEL), r6(utara)],
  nx,
  ny,
  selDerajat: SEL,
  ukuranSelM: UKURAN_SEL_M,
  nodata: NODATA,
  luar: LUAR,
  skalaLaju: SKALA_LAJU,
  skalaDeret: SKALA_DERET,
  epoch,
  nValid,
  berkas: { laju: 'semarang-grid-laju.bin', sigma: 'semarang-grid-sigma.bin', deret: 'semarang-grid-deret.bin' },
}

await mkdir(OUT_DIR, { recursive: true })
const teks = JSON.stringify({ type: 'FeatureCollection', metadata, features })
await writeFile(path.join(OUT_DIR, 'semarang-kawasan.geojson'), teks)
await writeFile(path.join(OUT_DIR, 'semarang-grid.json'), JSON.stringify(kepala))
// Int16 little-endian (urutan byte mesin x86/ARM yang umum).
await writeFile(path.join(OUT_DIR, kepala.berkas.laju), Buffer.from(laju.buffer))
await writeFile(path.join(OUT_DIR, kepala.berkas.sigma), Buffer.from(sig.buffer))
await writeFile(path.join(OUT_DIR, kepala.berkas.deret), Buffer.from(deret.buffer))

// ---------- ringkasan ----------
const ok = features.filter((f) => f.properties.memadai)
const lajuOk = ok.map((f) => f.properties.laju)
const kat = { rendah: 0, sedang: 0, tinggi: 0 }
for (const v of lajuOk) kat[v >= 4 ? 'tinggi' : v >= 2 ? 'sedang' : 'rendah']++
console.log(`Grid ${nx} x ${ny} = ${N} piksel | di dalam kota ${nDalam} | valid ${nValid} (${((nValid / nDalam) * 100).toFixed(0)}%) | epoch ${nEpoch}`)
console.log(`Kawasan: ${features.length} | memadai: ${ok.length} | tidak memadai: ${features.length - ok.length} | kelurahan di bawah ${MIN_PIKSEL} piksel total: ${kumpul.filter((a) => a.total < MIN_PIKSEL).length}`)
console.log(`Laju kelurahan min ${Math.min(...lajuOk)} maks ${Math.max(...lajuOk)} | kategori (ambang 2/4):`, JSON.stringify(kat))
for (const nm of ['Panggung Lor', 'Kaligawe', 'Terboyo Wetan', 'Tanjung Mas', 'Tlogosari Kulon', 'Pekunden', 'Tembalang', 'Ngaliyan', 'Mangunharjo']) {
  const f = features.find((x) => x.properties.nama === nm)
  if (f) console.log(`  ${nm}: laju ${f.properties.laju} ± ${f.properties.sigma}, sebaran ${JSON.stringify(f.properties.sebaran)}, koh ${f.properties.koherensi}, piksel ${f.properties.nPiksel}, memadai ${f.properties.memadai}`)
}
const kb = (n) => `${(n / 1024).toFixed(0)} KB`
console.log(`Ukuran: kawasan ${kb(teks.length)} | laju ${kb(laju.byteLength)} | sigma ${kb(sig.byteLength)} | deret ${kb(deret.byteLength)}`)
