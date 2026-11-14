// Kerangka ringkasan kelurahan untuk wilayah baru: geometri disederhanakan (topologi antarkelurahan
// dijaga), angka masih kosong. Angkanya diisi pipeline/06_ekspor.py.
//
// Masukan : data-raw/<wilayah>-kelurahan.geojson
// Keluaran: public/data/<wilayah>-kawasan.geojson
// Jalankan: node scripts/siapkan-kawasan.mjs jakarta

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mapshaper from 'mapshaper'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nama = process.argv[2]
if (!nama || !/^[a-z]+$/.test(nama)) throw new Error('Pakai: node scripts/siapkan-kawasan.mjs <wilayah>')
const masukan = await readFile(path.resolve(__dirname, `../data-raw/${nama}-kelurahan.geojson`), 'utf8')
const hasil = await mapshaper.applyCommands('-i in.geojson -simplify 14% keep-shapes -o out.geojson precision=0.00001', { 'in.geojson': masukan })
const gj = JSON.parse(hasil['out.geojson'].toString())
const features = gj.features.map((f) => ({
  type: 'Feature',
  properties: {
    id: f.properties.id,
    nama: f.properties.nama,
    kecamatan: f.properties.kecamatan,
    laju: null,
    sigma: null,
    sebaran: null,
    nPiksel: 0,
    koherensi: null,
    memadai: false,
    deret: [],
    jarakPantaiKm: null,
  },
  geometry: f.geometry,
}))
const keluar = path.resolve(__dirname, `../public/data/${nama}-kawasan.geojson`)
await writeFile(keluar, JSON.stringify({ type: 'FeatureCollection', metadata: { jenis: 'olahan', judul: 'Belum diolah', wilayah: nama }, features }))
console.log(`${nama}: ${features.length} kelurahan/desa -> ${keluar}`)
