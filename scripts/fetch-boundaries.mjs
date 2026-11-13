// Ambil batas kelurahan Kota Semarang dari OpenStreetMap (Overpass API).
//
// Sumber  : OpenStreetMap, lewat Overpass API
// Lisensi : ODbL 1.0. Atribusi wajib: "© OpenStreetMap contributors"
// Keluaran: ../data-raw/semarang-kelurahan.geojson  (properties: id, nama, kecamatan, sumber)
//           ../data-raw/semarang-kecamatan.geojson  (properties: nama)
//           ../data-raw/semarang-kota.geojson       (properties: nama)
// Jalankan: npm run data:boundaries
//
// Di OSM Indonesia: admin_level 5 = kabupaten/kota, 6 = kecamatan, 7 = kelurahan/desa.

import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import osmtogeojson from 'osmtogeojson'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../data-raw')
const UA = 'pantau-ambles-demo-build/0.1'
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
// selatan, barat, utara, timur
const BBOX = '-7.13,110.25,-6.91,110.53'
const QUERY = `[out:json][timeout:180];
rel["boundary"="administrative"]["admin_level"~"^[567]$"](${BBOX});
out body;
>;
out skel qt;`

// Jumlah kelurahan resmi per kecamatan (total 177) untuk pembanding.
const RESMI = {
  'Semarang Tengah': 15, 'Semarang Utara': 9, 'Semarang Timur': 10, Gayamsari: 7, Genuk: 13,
  Pedurungan: 12, 'Semarang Selatan': 10, Candisari: 7, Gajahmungkur: 8, Tembalang: 12,
  Banyumanik: 11, Gunungpati: 16, 'Semarang Barat': 16, Ngaliyan: 10, Mijen: 14, Tugu: 7,
}

async function overpass(query) {
  for (const url of ENDPOINTS) {
    try {
      console.log('Overpass:', url)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(240_000),
      })
      if (!res.ok) {
        console.warn('  status', res.status)
        continue
      }
      return await res.json()
    } catch (e) {
      console.warn('  gagal:', String(e))
    }
  }
  throw new Error('Semua endpoint Overpass gagal')
}

// ---------- geometri kecil (tanpa dependensi) ----------
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
function inGeom(pt, g) {
  return polys(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)))
}
// Luas cincin dalam km2 (proyeksi lokal sederhana, cukup untuk validasi).
function ringAreaKm2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180)
  const kx = 111.32 * Math.cos(lat0)
  const ky = 110.57
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky)
  }
  return Math.abs(a) / 2
}
function areaKm2(g) {
  return polys(g).reduce((s, poly) => s + ringAreaKm2(poly[0]) - poly.slice(1).reduce((h, r) => h + ringAreaKm2(r), 0), 0)
}
function centroidOfRing(ring) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
    a += f
    cx += (ring[j][0] + ring[i][0]) * f
    cy += (ring[j][1] + ring[i][1]) * f
  }
  if (a === 0) return ring[0]
  return [cx / (3 * a), cy / (3 * a)]
}
// Titik yang dijamin berada di dalam poligon terbesar.
function interiorPoint(g) {
  const biggest = polys(g).slice().sort((a, b) => ringAreaKm2(b[0]) - ringAreaKm2(a[0]))[0]
  const c = centroidOfRing(biggest[0])
  if (inGeom(c, g)) return c
  const ys = biggest[0].map((p) => p[1])
  const xs = biggest[0].map((p) => p[0])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  for (let i = 1; i < 40; i++) {
    for (let j = 1; j < 40; j++) {
      const p = [x0 + ((x1 - x0) * i) / 40, y0 + ((y1 - y0) * j) / 40]
      if (inGeom(p, g)) return p
    }
  }
  return c
}
const round6 = (g) => {
  const r = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6] : c.map(r))
  return { type: g.type, coordinates: r(g.coordinates) }
}

// ---------- nama ----------
const BAKU = { 'Gunung Pati': 'Gunungpati', 'Gajah Mungkur': 'Gajahmungkur', 'Candi Sari': 'Candisari', 'Gayam Sari': 'Gayamsari' }
function bersihkanNama(s) {
  const t = String(s || '')
    .replace(/^(Kelurahan|Kecamatan|Desa|Kota)\s+/i, '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
  return BAKU[t] || t
}

// ---------- utama ----------
const osm = await overpass(QUERY)
console.log('Elemen OSM:', osm.elements.length)
const gj = osmtogeojson(osm, { flatProperties: true })
const admin = gj.features.filter(
  (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') && f.properties.boundary === 'administrative',
)
const lvl = (n) => admin.filter((f) => String(f.properties.admin_level) === String(n))

// Kota Semarang = level 5 yang memuat Simpang Lima.
const SIMPANG_LIMA = [110.4229, -6.9903]
const kota = lvl(5).find((f) => inGeom(SIMPANG_LIMA, f.geometry))
if (!kota) throw new Error('Relasi Kota Semarang (admin_level=5) tidak ditemukan')
console.log('Kota:', kota.properties.name, kota.properties.id)

const diDalamKota = (f) => inGeom(interiorPoint(f.geometry), kota.geometry)
const kecamatan = lvl(6).filter(diDalamKota).map((f) => ({ nama: bersihkanNama(f.properties.name), geometry: f.geometry, id: f.properties.id }))
const anomali = []

const kelurahan = lvl(7)
  .filter(diDalamKota)
  .map((f) => {
    const p = interiorPoint(f.geometry)
    const kec = kecamatan.find((k) => inGeom(p, k.geometry))
    if (!kec) anomali.push(`Kelurahan tanpa kecamatan: ${f.properties.name}`)
    return {
      type: 'Feature',
      properties: {
        id: 'osm-' + String(f.properties.id).replace('relation/', ''),
        nama: bersihkanNama(f.properties.name),
        kecamatan: kec ? kec.nama : '',
        sumber: 'OpenStreetMap (ODbL)',
      },
      geometry: round6(f.geometry),
    }
  })
  .sort((a, b) => (a.properties.kecamatan + a.properties.nama).localeCompare(b.properties.kecamatan + b.properties.nama))

// ---------- validasi ----------
const perKec = {}
for (const f of kelurahan) perKec[f.properties.kecamatan] = (perKec[f.properties.kecamatan] || 0) + 1
for (const [k, n] of Object.entries(RESMI)) {
  if ((perKec[k] || 0) !== n) anomali.push(`Jumlah kelurahan ${k}: OSM ${perKec[k] || 0}, resmi ${n}`)
}
for (const k of Object.keys(perKec)) if (!(k in RESMI)) anomali.push(`Kecamatan tak dikenal: "${k}" (${perKec[k]} kelurahan)`)
const seen = new Set()
for (const f of kelurahan) {
  const key = f.properties.kecamatan + '|' + f.properties.nama
  if (!f.properties.nama) anomali.push(`Nama kosong: ${f.properties.id}`)
  if (seen.has(key)) anomali.push(`Nama ganda: ${key}`)
  seen.add(key)
  for (const poly of polys(f.geometry)) {
    for (const ring of poly) {
      const [a, b] = [ring[0], ring[ring.length - 1]]
      if (ring.length < 4 || a[0] !== b[0] || a[1] !== b[1]) anomali.push(`Cincin tidak tertutup: ${key}`)
    }
  }
}
const luasKel = kelurahan.reduce((s, f) => s + areaKm2(f.geometry), 0)
const luasKota = areaKm2(kota.geometry)
if (Math.abs(luasKel - 373.8) / 373.8 > 0.1) anomali.push(`Luas total kelurahan ${luasKel.toFixed(1)} km2 menyimpang >10% dari 373,8 km2`)

await mkdir(OUT, { recursive: true })
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features })
await writeFile(path.join(OUT, 'semarang-kelurahan.geojson'), fc(kelurahan))
await writeFile(
  path.join(OUT, 'semarang-kecamatan.geojson'),
  fc(kecamatan.map((k) => ({ type: 'Feature', properties: { nama: k.nama }, geometry: round6(k.geometry) }))),
)
await writeFile(
  path.join(OUT, 'semarang-kota.geojson'),
  fc([{ type: 'Feature', properties: { nama: 'Kota Semarang' }, geometry: round6(kota.geometry) }]),
)

console.log(`Kelurahan: ${kelurahan.length} | Kecamatan: ${kecamatan.length}`)
console.log(`Luas kelurahan: ${luasKel.toFixed(1)} km2 | Luas relasi kota: ${luasKota.toFixed(1)} km2`)
console.log('Per kecamatan:', JSON.stringify(perKec))
console.log(anomali.length ? 'ANOMALI:\n - ' + anomali.join('\n - ') : 'Tanpa anomali.')
