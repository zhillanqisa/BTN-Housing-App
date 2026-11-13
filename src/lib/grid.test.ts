// Tes grid piksel: pencarian piksel, statistik blok, dan file grid bawaan.
import { describe, expect, it } from 'vitest'
import kepalaMentah from '../../public/data/semarang-grid.json?raw'
import kawasanMentah from '../../public/data/semarang-kawasan.geojson?raw'
import { indeksKawasan, validasiDataset } from './data'
import { bacaInt16, batasBlok, lebarBlokM, lukisGrid, nilaiDi, pasangDeret, pikselDi, statistikTitik, susunGrid, validasiKepala, type Grid, type KepalaGrid } from './grid'
import { bacaLokasi, kunciTitik } from './lokasi'
import type { Position } from './types'

const X = -32768 // tidak terukur
const L = -32767 // di luar wilayah

/** Grid buatan 5 x 4, sel 1 derajat, pojok kiri atas di (0, 4). Nilai dalam 0,01 cm/tahun. */
function gridUji(): Grid {
  const kepala: KepalaGrid = {
    versi: 1, jenis: 'uji', dibuat: '2026-01-01', bbox: [0, 0, 5, 4], nx: 5, ny: 4, ukuranSelM: 80,
    nodata: X, luar: L, skalaLaju: 0.01, skalaDeret: 0.1, epoch: [2020, 2021, 2022], nValid: 0,
    berkas: { laju: 'a.bin', sigma: 'b.bin', deret: 'c.bin' },
  }
  // prettier-ignore
  const laju = Int16Array.from([
    100, 200, 300,   X,   L,
    400, 500, 600,   X,   L,
    700, 800, 900,   X,   L,
      X,   X,   X,   X,   L,
  ])
  const sigma = laju.map((v) => (v === X || v === L ? v : 30))
  const g = susunGrid(kepala, laju, sigma)
  if (!g) throw new Error('grid uji harus sah')
  // deret: tiap piksel valid turun sebesar lajunya per tahun (satuan 0,1 cm)
  const deret = new Int16Array(g.kepala.nValid * 3)
  let j = 0
  for (const v of laju) {
    if (v === X || v === L) continue
    deret.set([0, -v / 10, (-v / 10) * 2], j * 3)
    j++
  }
  if (!pasangDeret(g, deret)) throw new Error('deret uji harus cocok')
  return g
}

describe('grid: piksel dan nilai', () => {
  const g = gridUji()
  it('menghitung piksel valid dan menolak ukuran yang salah', () => {
    expect(g.kepala.nValid).toBe(9)
    expect(susunGrid(g.kepala, new Int16Array(3), new Int16Array(3))).toBeNull()
    expect(pasangDeret(g, new Int16Array(5))).toBe(false)
  })
  it('mencari piksel dari koordinat; baris 0 paling utara', () => {
    expect(pikselDi(g, [0.5, 3.5])).toEqual({ col: 0, row: 0 })
    expect(pikselDi(g, [2.9, 1.1])).toEqual({ col: 2, row: 2 })
    expect(pikselDi(g, [-0.1, 2])).toBeNull()
    expect(pikselDi(g, [5, 2])).toBeNull() // tepi timur tidak termasuk
    expect(pikselDi(g, [Number.NaN, 2])).toBeNull()
  })
  it('membedakan ada, kosong, dan luar', () => {
    expect(nilaiDi(g, [1.5, 2.5])).toMatchObject({ status: 'ada', laju: 5 })
    expect(nilaiDi(g, [3.5, 2.5])).toMatchObject({ status: 'kosong' })
    expect(nilaiDi(g, [4.5, 2.5])).toEqual({ status: 'luar' })
    expect(nilaiDi(g, [9, 9])).toEqual({ status: 'luar' })
  })
})

describe('grid: statistik blok di sekitar titik', () => {
  const g = gridUji()
  it('blok penuh: median, sebaran, sigma, deret', () => {
    const s = statistikTitik(g, [1.5, 2.5]) // piksel tengah, 9 piksel terukur
    expect(s).toMatchObject({ nBlok: 9, nPiksel: 9, memadai: true, laju: 5, sebaran: [1, 9] })
    // MAD = 2 -> sebaran 1,4826 x 2 = 2,97; galat ukur 0,3 -> akar(2,97^2 + 0,3^2) = 2,98
    expect(s.sigma).toBe(3)
    expect(s.deret).toEqual([[2020, 0], [2021, -5], [2022, -10]])
  })
  it('blok di tepi: piksel luar tidak dihitung, piksel kosong dihitung sebagai tidak terukur', () => {
    const s = statistikTitik(g, [2.5, 2.5]) // kolom 1..3: 6 terukur, 3 kosong
    expect(s).toMatchObject({ nBlok: 9, nPiksel: 6, memadai: true, laju: 5.5, sebaran: [2, 9] })
    const t = statistikTitik(g, [3.5, 2.5]) // kolom 2..4: 3 terukur, 3 kosong, 3 luar
    expect(t).toMatchObject({ nBlok: 6, nPiksel: 3, memadai: false, laju: null, sigma: null, sebaran: null, deret: [] })
  })
  it('titik di luar grid', () => {
    expect(statistikTitik(g, [9, 9])).toMatchObject({ nBlok: 0, nPiksel: 0, memadai: false, laju: null })
  })
  it('tanpa deret, laju tetap ada dan deret kosong', () => {
    const tanpa = susunGrid(g.kepala, g.laju, g.sigma)!
    expect(statistikTitik(tanpa, [1.5, 2.5])).toMatchObject({ laju: 5, deret: [] })
  })
  it('batas blok dan lebarnya', () => {
    expect(batasBlok(g, [1.5, 2.5])).toEqual([0, 1, 3, 4])
    expect(batasBlok(g, [9, 9])).toBeNull()
    expect(lebarBlokM(g)).toBe(240)
    expect(lebarBlokM(null)).toBe(240)
  })
  it('warna piksel: luar transparan, kosong memakai warna kosong', () => {
    const px = lukisGrid(g, (laju) => (laju >= 5 ? 1 : 0), [[1, 1, 1, 255], [2, 2, 2, 255]], [9, 9, 9, 100])
    expect([...px.slice(0, 4)]).toEqual([1, 1, 1, 255]) // laju 1
    expect([...px.slice(4 * 6, 4 * 6 + 4)]).toEqual([2, 2, 2, 255]) // laju 5
    expect([...px.slice(4 * 3, 4 * 3 + 4)]).toEqual([9, 9, 9, 100]) // kosong
    expect([...px.slice(4 * 4, 4 * 4 + 4)]).toEqual([0, 0, 0, 0]) // luar
  })
})

describe('grid: kepala dan biner', () => {
  it('menolak kepala yang tidak sah dan nama berkas berjalur', () => {
    const sah = JSON.parse(kepalaMentah) as Record<string, unknown>
    expect(validasiKepala(sah)).not.toBeNull()
    expect(validasiKepala(null)).toBeNull()
    expect(validasiKepala({ ...sah, nx: 0 })).toBeNull()
    expect(validasiKepala({ ...sah, nx: 1e6, ny: 1e6 })).toBeNull()
    expect(validasiKepala({ ...sah, bbox: [1, 2, 3] })).toBeNull()
    expect(validasiKepala({ ...sah, berkas: { laju: '../x.bin', sigma: 'b.bin', deret: 'c.bin' } })).toBeNull()
    expect(validasiKepala({ ...sah, berkas: { laju: 'https://contoh.test/x.bin', sigma: 'b.bin', deret: 'c.bin' } })).toBeNull()
  })
  it('membaca Int16 little-endian', () => {
    expect([...bacaInt16(Uint8Array.from([0x01, 0x00, 0xff, 0xff, 0x00, 0x80]).buffer)]).toEqual([1, -1, -32768])
  })
})

describe('file grid bawaan', async () => {
  // file biner dibaca langsung dari disk (bukan lewat bundler)
  const modul = 'node:fs'
  const fs = (await import(/* @vite-ignore */ modul)) as { readFileSync: (p: string) => Uint8Array }
  const baca = (nama: string) => {
    const b = fs.readFileSync(`public/data/${nama}`)
    return bacaInt16(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  }
  const kepala = validasiKepala(JSON.parse(kepalaMentah))!
  const nValidFile = (JSON.parse(kepalaMentah) as { nValid: number }).nValid
  const grid = susunGrid(kepala, baca(kepala.berkas.laju), baca(kepala.berkas.sigma), baca(kepala.berkas.deret))!
  const ds = validasiDataset(JSON.parse(kawasanMentah))
  if (!ds.ok) throw new Error('data kawasan harus sah')
  const kawasan = indeksKawasan(ds.dataset)

  it('ukuran file cocok dengan kepala', () => {
    expect(grid).not.toBeNull()
    expect(grid.kepala.nValid).toBe(nValidFile)
    expect(grid.deret!.length).toBe(nValidFile * kepala.epoch.length)
    expect(kepala.epoch.length).toBeGreaterThan(4)
  })
  it('laju piksel berada di rentang wajar (cm/tahun)', () => {
    let maks = -Infinity
    let min = Infinity
    for (const v of grid.laju) {
      if (v === kepala.nodata || v === kepala.luar) continue
      maks = Math.max(maks, v * kepala.skalaLaju)
      min = Math.min(min, v * kepala.skalaLaju)
    }
    expect(maks).toBeLessThan(40)
    expect(min).toBeGreaterThan(-10)
  })
  it('laporan mengikuti titik: dua titik dalam satu kelurahan bisa berbeda', () => {
    const k = kawasan.filter((x) => x.memadai && x.sebaran && x.sebaran[1] - x.sebaran[0] >= 1).sort((a, b) => b.luasKm2 - a.luasKm2)[0]!
    const laju = new Set<number>()
    for (let i = 1; i < 12; i++) {
      for (let j = 1; j < 12; j++) {
        const p: Position = [k.bbox[0] + ((k.bbox[2] - k.bbox[0]) * i) / 12, k.bbox[1] + ((k.bbox[3] - k.bbox[1]) * j) / 12]
        const b = bacaLokasi(p, kawasan, grid)
        if (b && b.kelurahan.id === k.id && b.data.laju != null) laju.add(b.data.laju)
      }
    }
    expect(laju.size).toBeGreaterThan(1)
  })
  it('bacaan titik: bentuk data dan deret', () => {
    const k = kawasan.find((x) => x.nama === 'Kaligawe')!
    const b = bacaLokasi(k.pusat, kawasan, grid)!
    expect(b.mode).toBe('titik')
    expect(b.kelurahan.id).toBe(k.id)
    expect(b.nBlok).toBeGreaterThan(0)
    if (b.data.memadai) {
      expect(b.data.deret).toHaveLength(kepala.epoch.length)
      expect(b.data.deret[0]![1]).toBe(0)
      expect(b.data.sigma!).toBeGreaterThan(0)
    }
    // tanpa grid, bacaan kembali ke rata-rata kelurahan
    expect(bacaLokasi(k.pusat, kawasan, null)).toMatchObject({ mode: 'kawasan', data: { laju: k.laju } })
    expect(bacaLokasi([100, 0], kawasan, grid)).toBeNull()
  })
  it('kunci titik stabil sampai 5 desimal', () => {
    expect(kunciTitik([110.4104449, -6.9642001])).toBe('-6.96420,110.41044')
  })
})
