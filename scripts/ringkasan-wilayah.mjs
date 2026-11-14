// Ringkasan lintas wilayah untuk Dashboard: satu baris angka per wilayah, dihitung dari file yang
// dibaca aplikasi (public/data/<wilayah>-kawasan.geojson dan <wilayah>-grid.*).
// Jalankan setelah pipeline/06_ekspor.py untuk wilayah mana pun: node scripts/ringkasan-wilayah.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA = join(import.meta.dirname, '..', 'public', 'data')
const WILAYAH = ['semarang', 'jakarta', 'pekalongan', 'demak']
const AMBANG = [2, 4]

function persentil(urut, p) {
  if (!urut.length) return null
  const i = Math.min(urut.length - 1, Math.max(0, Math.round((p / 100) * (urut.length - 1))))
  return urut[i]
}

const bulat = (v, d = 1) => (v == null ? null : Number(v.toFixed(d)))

function ringkas(id) {
  const fKawasan = join(DATA, `${id}-kawasan.geojson`)
  if (!existsSync(fKawasan)) return null
  const kawasan = JSON.parse(readFileSync(fKawasan, 'utf8'))
  const meta = kawasan.metadata ?? {}
  if (meta.judul === 'Belum diolah') return { id, status: 'belum' }

  const fitur = kawasan.features.map((f) => f.properties)
  const memadai = fitur.filter((p) => p.memadai && typeof p.laju === 'number')
  const tercepat = [...memadai]
    .sort((a, b) => b.laju - a.laju)
    .slice(0, 3)
    .map((p) => ({ nama: p.nama, kecamatan: p.kecamatan, laju: bulat(p.laju) }))

  const hasil = {
    id,
    status: 'olahan',
    nama: meta.wilayah ?? id,
    periode: meta.periode ?? null,
    lulusGerbang: meta.proses?.validasi?.lulus ?? null,
    nKelurahan: fitur.length,
    nKelurahanMemadai: memadai.length,
    nKelurahanTinggi: memadai.filter((p) => p.laju >= 4).length,
    tercepat,
  }

  const fGrid = join(DATA, `${id}-grid.json`)
  if (existsSync(fGrid)) {
    const g = JSON.parse(readFileSync(fGrid, 'utf8'))
    const buf = readFileSync(join(DATA, g.berkas.laju))
    const laju = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
    const nilai = []
    let dalam = 0
    for (const v of laju) {
      if (v === g.luar) continue
      dalam++
      if (v !== g.nodata) nilai.push(v * g.skalaLaju)
    }
    nilai.sort((a, b) => a - b)
    const kmPiksel = (g.ukuranSelM / 1000) ** 2
    hasil.piksel = {
      dalamWilayah: dalam,
      terukur: nilai.length,
      persenTerukur: bulat((100 * nilai.length) / Math.max(1, dalam), 0),
      median: bulat(persentil(nilai, 50), 2),
      p95: bulat(persentil(nilai, 95)),
      maks: bulat(nilai.at(-1) ?? null),
      // luas wilayah yang turun minimal sekian cm/tahun, dari jumlah piksel terukur
      luasKm2: Object.fromEntries(AMBANG.map((a) => [`min${a}`, bulat(nilai.filter((v) => v >= a).length * kmPiksel)])),
    }
  }
  return hasil
}

const wilayah = WILAYAH.map(ringkas).filter(Boolean)
const keluar = { dibuat: new Date().toISOString().slice(0, 10), ambangCm: AMBANG, wilayah }
writeFileSync(join(DATA, 'ringkasan-wilayah.json'), JSON.stringify(keluar, null, 1) + '\n')
for (const w of wilayah) {
  if (w.status !== 'olahan') console.log(`${w.id}: belum diolah`)
  else console.log(`${w.id}: ${w.nKelurahan} kelurahan, ${w.nKelurahanTinggi} tinggi, terukur ${w.piksel?.persenTerukur}%, >=4 cm/th ${w.piksel?.luasKm2.min4} km2, maks ${w.piksel?.maks}`)
}
