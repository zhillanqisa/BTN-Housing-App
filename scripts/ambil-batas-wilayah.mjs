// Ambil batas kelurahan/desa untuk wilayah selain Semarang dari OpenStreetMap (Overpass API).
//
// Sumber  : OpenStreetMap, lewat Overpass API. Lisensi ODbL 1.0, atribusi "© OpenStreetMap contributors".
// Keluaran: ../data-raw/<wilayah>-kelurahan.geojson  (properties: id, nama, kecamatan, sumber)
//           ../data-raw/<wilayah>-kecamatan.geojson  (properties: nama)
//           ../data-raw/<wilayah>-kota.geojson       (properties: nama), satu fitur per kota/kabupaten
// Jalankan: node scripts/ambil-batas-wilayah.mjs jakarta
//
// Di OSM Indonesia: admin_level 4 = provinsi, 5 = kabupaten/kota, 6 = kecamatan, 7 = kelurahan/desa.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import osmtogeojson from 'osmtogeojson'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../data-raw')
const UA = 'pantau-ambles-demo-build/0.1'
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

// bbox: selatan, barat, utara, timur. induk: relasi yang memuat titik acuan. bagian: kota/kabupaten yang dipakai.
const WILAYAH = {
  jakarta: {
    bbox: '-6.40,106.65,-6.05,107.00',
    induk: { level: 4, titik: [106.8272, -6.1754] }, // Monas
    bagian: (f) => !/seribu/i.test(f.properties.name ?? ''), // tanpa Kepulauan Seribu
    luasKm2: 662,
  },
  pekalongan: {
    bbox: '-6.95,109.62,-6.84,109.73',
    induk: { level: 5, titik: [109.6754, -6.8886] }, // Alun-alun Kota Pekalongan
    luasKm2: 45,
  },
  demak: {
    bbox: '-7.12,110.43,-6.55,110.85',
    induk: { level: 5, titik: [110.6386, -6.8945] }, // Alun-alun Demak
    luasKm2: 897,
  },
}

const nama = process.argv[2]
const W = WILAYAH[nama]
if (!W) throw new Error(`Wilayah tidak dikenal: ${nama}. Pilihan: ${Object.keys(WILAYAH).join(', ')}`)

async function overpass(query) {
  for (const url of ENDPOINTS) {
    try {
      console.log('Overpass:', url)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(300_000),
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

// ---------- geometri kecil ----------
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
const inGeom = (pt, g) => polys(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)))
function ringAreaKm2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180)
  const kx = 111.32 * Math.cos(lat0)
  const ky = 110.57
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky)
  return Math.abs(a) / 2
}
const areaKm2 = (g) => polys(g).reduce((s, poly) => s + ringAreaKm2(poly[0]) - poly.slice(1).reduce((h, r) => h + ringAreaKm2(r), 0), 0)
function interiorPoint(g) {
  const besar = polys(g).slice().sort((a, b) => ringAreaKm2(b[0]) - ringAreaKm2(a[0]))[0]
  const ring = besar[0]
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
  for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
    const p = [x0 + ((x1 - x0) * i) / 40, y0 + ((y1 - y0) * j) / 40]
    if (inGeom(p, g)) return p
  }
  return c
}
const round6 = (g) => {
  const r = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6] : c.map(r))
  return { type: g.type, coordinates: r(g.coordinates) }
}
function bersihkanNama(s) {
  return String(s || '')
    .replace(/^(Kelurahan|Kecamatan|Desa|Kota|Kabupaten|Kota Administrasi)\s+/i, '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
}

// ---------- utama ----------
const query = `[out:json][timeout:280];
rel["boundary"="administrative"]["admin_level"~"^[4567]$"](${W.bbox});
out body;
>;
out skel qt;`
const osm = await overpass(query)
console.log('Elemen OSM:', osm.elements.length)
const gj = osmtogeojson(osm, { flatProperties: true })
const admin = gj.features.filter((f) => f.geometry && /Polygon/.test(f.geometry.type) && f.properties.boundary === 'administrative')
const lvl = (n) => admin.filter((f) => String(f.properties.admin_level) === String(n))

const induk = lvl(W.induk.level).find((f) => inGeom(W.induk.titik, f.geometry))
if (!induk) throw new Error(`Relasi induk admin_level=${W.induk.level} tidak ditemukan`)
console.log('Induk:', induk.properties.name)
const bagian = W.induk.level === 5 ? [induk] : lvl(5).filter((f) => inGeom(interiorPoint(f.geometry), induk.geometry)).filter(W.bagian ?? (() => true))
console.log('Bagian:', bagian.map((b) => b.properties.name).join(', '))
const diDalam = (f) => {
  const p = interiorPoint(f.geometry)
  return bagian.some((b) => inGeom(p, b.geometry))
}
const kecamatan = lvl(6).filter(diDalam).map((f) => ({ nama: bersihkanNama(f.properties.name), geometry: f.geometry }))
const anomali = []
const kelurahan = lvl(7)
  .filter(diDalam)
  .map((f) => {
    const p = interiorPoint(f.geometry)
    const kec = kecamatan.find((k) => inGeom(p, k.geometry))
    if (!kec) anomali.push(`Kelurahan tanpa kecamatan: ${f.properties.name}`)
    return {
      type: 'Feature',
      properties: { id: 'osm-' + String(f.properties.id).replace('relation/', ''), nama: bersihkanNama(f.properties.name), kecamatan: kec ? kec.nama : '', sumber: 'OpenStreetMap (ODbL)' },
      geometry: round6(f.geometry),
    }
  })
  .filter((f) => f.properties.nama)
  .sort((a, b) => (a.properties.kecamatan + a.properties.nama).localeCompare(b.properties.kecamatan + b.properties.nama))

const seen = new Set()
for (const f of kelurahan) {
  const key = f.properties.kecamatan + '|' + f.properties.nama
  if (seen.has(key)) anomali.push(`Nama ganda: ${key}`)
  seen.add(key)
}
const luas = kelurahan.reduce((s, f) => s + areaKm2(f.geometry), 0)
const luasBagian = bagian.reduce((s, b) => s + areaKm2(b.geometry), 0)
if (Math.abs(luas - W.luasKm2) / W.luasKm2 > 0.15) anomali.push(`Luas total kelurahan ${luas.toFixed(1)} km2, rujukan ${W.luasKm2} km2`)

await mkdir(OUT, { recursive: true })
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features })
await writeFile(path.join(OUT, `${nama}-kelurahan.geojson`), fc(kelurahan))
await writeFile(path.join(OUT, `${nama}-kecamatan.geojson`), fc(kecamatan.map((k) => ({ type: 'Feature', properties: { nama: k.nama }, geometry: round6(k.geometry) }))))
await writeFile(path.join(OUT, `${nama}-kota.geojson`), fc(bagian.map((b) => ({ type: 'Feature', properties: { nama: bersihkanNama(b.properties.name) }, geometry: round6(b.geometry) }))))
console.log(`Kecamatan: ${kecamatan.length} | kelurahan/desa: ${kelurahan.length} | luas kelurahan ${luas.toFixed(1)} km2, luas wilayah ${luasBagian.toFixed(1)} km2`)
const perKec = {}
for (const f of kelurahan) perKec[f.properties.kecamatan] = (perKec[f.properties.kecamatan] || 0) + 1
console.log('Per kecamatan:', JSON.stringify(perKec))
console.log(anomali.length ? 'ANOMALI:\n  ' + anomali.join('\n  ') : 'Tidak ada anomali.')
