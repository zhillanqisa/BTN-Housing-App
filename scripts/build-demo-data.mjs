// Bangun DATA DEMO ILUSTRATIF untuk PANTAU AMBLES.
//
// PENTING: angka laju per kelurahan di sini BUKAN hasil pengukuran. Ini model
// ilustratif yang meniru pola umum dari publikasi (makin ke utara dan timur
// makin cepat, perbukitan selatan mendekati nol) supaya antarmuka bisa
// didemokan sebelum olahan Sentinel-1 tim selesai. Ganti dengan hasil olah
// (ASF HyP3 + MintPy/SBAS -> statistik zona per kelurahan) memakai skema yang
// sama, lalu set metadata.jenis = "olahan".
//
// Masukan : data-raw/semarang-kelurahan.geojson, data-raw/semarang-kota.geojson
// Keluaran: public/data/semarang-kawasan.geojson
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
function ringAreaKm2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180)
  const kx = 111.32 * Math.cos(lat0)
  const ky = 110.57
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky)
  return Math.abs(a) / 2
}
const areaKm2 = (g) => polys(g).reduce((s, p) => s + ringAreaKm2(p[0]) - p.slice(1).reduce((h, r) => h + ringAreaKm2(r), 0), 0)
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
const r1 = (v) => Math.round(v * 10) / 10
const r2 = (v) => Math.round(v * 100) / 100
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
const T0 = 2017
const T1 = 2025.75
const LUAS_PIKSEL_KM2 = 0.08 * 0.08 // produk HyP3 80 m

// ---------- utama ----------
const rawKel = await readFile(path.join(RAW, 'semarang-kelurahan.geojson'), 'utf8')
const kota = JSON.parse(await readFile(path.join(RAW, 'semarang-kota.geojson'), 'utf8')).features[0]

// Sederhanakan geometri (menjaga topologi antar-kelurahan) supaya file ringan.
const hasil = await mapshaper.applyCommands('-i in.geojson -simplify 14% keep-shapes -o out.geojson precision=0.00001', {
  'in.geojson': rawKel,
})
const kel = JSON.parse(hasil['out.geojson'].toString())

// Lintang batas utara kota per bujur (maks lintang verteks per kolom 0,005 derajat).
const kolom = new Map()
for (const poly of polys(kota.geometry)) for (const p of poly[0]) {
  const k = Math.round(p[0] / 0.005)
  if (!kolom.has(k) || kolom.get(k) < p[1]) kolom.set(k, p[1])
}
const pantai = [...kolom.entries()].sort((a, b) => a[0] - b[0]).map(([k, lat]) => [k * 0.005, lat])
const lintangPantai = (lon) => interp(pantai, lon)

const features = kel.features.map((f) => {
  const { id, nama, kecamatan } = f.properties
  const rnd = mulberry32(hash(id + '|' + nama))
  const c = pusat(f.geometry)
  const [lon, lat] = c
  const luas = areaKm2(f.geometry)
  const jarakPantaiKm = r1(Math.max(0, (lintangPantai(lon) - lat) * 110.57))

  // Laju: naik seiring jarak ke utara dari kaki bukit, skala membesar ke timur.
  const n = Math.max(0, (lat - interp(KAKI_BUKIT, lon)) * 110.57)
  const dasar = interp(LAJU_MAKS, lon) * (1 - Math.exp(-((n / 3.2) ** 1.6)))
  const lajuMentah = dasar * (1 + (rnd() - 0.5) * 0.24) + (rnd() - 0.35) * 0.5
  const laju = r1(Math.max(0, lajuMentah))

  // Koherensi dan jumlah piksel -> kecukupan data.
  let koh = (KOHERENSI[kecamatan] ?? 0.5) + (rnd() - 0.5) * 0.16
  if (jarakPantaiKm < 1.2 && (kecamatan === 'Tugu' || kecamatan === 'Genuk')) koh -= 0.12 // tambak
  koh = r2(clamp(koh, 0.12, 0.9))
  const nPiksel = Math.round((luas / LUAS_PIKSEL_KM2) * clamp((koh - 0.15) / 0.5, 0.05, 1) * 0.9)
  const memadai = koh >= 0.32 && nPiksel >= 30

  const sigma = r1(0.35 + 0.12 * laju + (1 - koh) * 0.8)

  // Deret waktu triwulanan: tren linear + musiman kecil + derau.
  const deret = []
  if (memadai) {
    const fase = rnd() * Math.PI * 2
    for (let t = T0; t <= T1 + 1e-9; t += 0.25) {
      const v = t === T0 ? 0 : -(laju * (t - T0)) + 0.3 * Math.sin(2 * Math.PI * t + fase) + (rnd() - 0.5) * 0.6
      deret.push([r2(t), r1(v)])
    }
  }

  return {
    type: 'Feature',
    properties: {
      id, nama, kecamatan,
      laju: memadai ? laju : null,
      sigma: memadai ? sigma : null,
      nPiksel, koherensi: koh, memadai, deret, jarakPantaiKm,
    },
    geometry: f.geometry,
  }
})

const metadata = {
  jenis: 'demo',
  judul: 'Data demo ilustratif laju penurunan tanah per kelurahan',
  wilayah: 'Kota Semarang',
  periode: ['2017-01', '2025-10'],
  metode:
    'Model ilustratif, bukan pengukuran. Pola spasial meniru rentang publikasi: makin ke utara dan timur makin cepat, perbukitan selatan mendekati nol. Akan diganti hasil olah Sentinel-1 (ASF HyP3 + MintPy/SBAS) oleh tim.',
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
  dibuat: new Date().toISOString().slice(0, 10),
  catatan:
    'Angka per kelurahan pada data ini adalah ilustrasi untuk demo antarmuka. Jangan dipakai untuk keputusan membeli, membangun, atau membiayai rumah.',
}

await mkdir(OUT_DIR, { recursive: true })
const teks = JSON.stringify({ type: 'FeatureCollection', metadata, features })
await writeFile(path.join(OUT_DIR, 'semarang-kawasan.geojson'), teks)

// ---------- ringkasan ----------
const ok = features.filter((f) => f.properties.memadai)
const laju = ok.map((f) => f.properties.laju)
const kat = { rendah: 0, sedang: 0, tinggi: 0 }
for (const v of laju) kat[v >= 4 ? 'tinggi' : v >= 2 ? 'sedang' : 'rendah']++
console.log(`Kawasan: ${features.length} | memadai: ${ok.length} | tidak memadai: ${features.length - ok.length}`)
console.log(`Laju min ${Math.min(...laju)} maks ${Math.max(...laju)} | kategori (ambang 2/4):`, JSON.stringify(kat))
console.log('Tertinggi:', ok.slice().sort((a, b) => b.properties.laju - a.properties.laju).slice(0, 8)
  .map((f) => `${f.properties.nama} (${f.properties.kecamatan}) ${f.properties.laju}±${f.properties.sigma}`).join('; '))
for (const nm of ['Panggung Lor', 'Kaligawe', 'Terboyo Wetan', 'Tanjung Mas', 'Tlogosari Kulon', 'Pekunden', 'Tembalang', 'Ngaliyan', 'Mangunharjo']) {
  const f = features.find((x) => x.properties.nama === nm)
  if (f) console.log(`  ${nm}: laju ${f.properties.laju} ± ${f.properties.sigma}, koh ${f.properties.koherensi}, piksel ${f.properties.nPiksel}, memadai ${f.properties.memadai}`)
}
console.log(`Ukuran file: ${(teks.length / 1024).toFixed(0)} KB`)
