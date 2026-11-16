// Tes unit: format, geometri, kategori + Proyeksi Tenor, dan router.
import { describe, expect, it } from 'vitest'
import { fmt, fmtKoordinat, fmtPeriode, rentang, slug } from './format'
import { areaKm2, bboxOf, haversineKm, inBBox, pointInGeometry, pusatOf } from './geo'
import { binLaju, hitungKategori, hitungProyeksi, kalimatProyeksi, kalimatStatus, klasifikasi, langkahBerikutnya, teksProyeksi } from './risk'
import { bacaRute, buatHash, kunciRute } from './router'
import type { Kategori, KawasanGeometry, Thresholds } from './types'
import { wilayahDariTautan } from './wilayah'

const T: Thresholds = { sedang: 2, tinggi: 4 }

describe('format', () => {
  it('memakai koma desimal dan titik ribuan', () => {
    expect(fmt(5.2, 1)).toBe('5,2')
    expect(fmt(1234.5, 1)).toBe('1.234,5')
    expect(fmt(75)).toBe('75')
  })
  it('tidak menampilkan -0 dan menangani bukan angka', () => {
    expect(fmt(-0.01, 1)).toBe('0,0')
    expect(fmt(Number.NaN)).toBe('-')
  })
  it('rentang memakai tanda pisah en dan menyatu bila sama', () => {
    expect(rentang(60, 90)).toBe('60–90')
    expect(rentang(5, 5)).toBe('5')
  })
  it('periode, koordinat, slug', () => {
    expect(fmtPeriode('2017-01')).toBe('Jan 2017')
    expect(fmtPeriode('2025-10')).toBe('Okt 2025')
    expect(fmtKoordinat([110.4104, -6.9642])).toBe('6,9642° LS, 110,4104° BT')
    expect(slug('Panggung Lor')).toBe('panggung-lor')
  })
})

describe('geo', () => {
  const berlubang: KawasanGeometry = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  }
  it('titik dalam poligon memperhitungkan lubang', () => {
    expect(pointInGeometry([2, 2], berlubang)).toBe(true)
    expect(pointInGeometry([5, 5], berlubang)).toBe(false)
    expect(pointInGeometry([11, 5], berlubang)).toBe(false)
  })
  it('multipoligon', () => {
    const g: KawasanGeometry = {
      type: 'MultiPolygon',
      coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]],
    }
    expect(pointInGeometry([5.5, 5.5], g)).toBe(true)
    expect(pointInGeometry([3, 3], g)).toBe(false)
  })
  it('bbox', () => {
    expect(bboxOf(berlubang)).toEqual([0, 0, 10, 10])
    expect(inBBox([3, 3], [0, 0, 10, 10])).toBe(true)
    expect(inBBox([12, 3], [0, 0, 10, 10])).toBe(false)
  })
  it('pusat selalu di dalam poligon cekung (bentuk C)', () => {
    const c: KawasanGeometry = {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]],
    }
    expect(pointInGeometry(pusatOf(c), c)).toBe(true)
  })
  it('luas persegi kira-kira 1 km2 di lintang -7', () => {
    const dx = 1 / (111.32 * Math.cos((7 * Math.PI) / 180))
    const dy = 1 / 110.57
    const g: KawasanGeometry = { type: 'Polygon', coordinates: [[[110, -7], [110 + dx, -7], [110 + dx, -7 + dy], [110, -7 + dy], [110, -7]]] }
    expect(areaKm2(g)).toBeGreaterThan(0.98)
    expect(areaKm2(g)).toBeLessThan(1.02)
  })
  it('jarak haversine', () => {
    expect(haversineKm([110.4, -7], [110.5, -7])).toBeCloseTo(11.04, 1)
  })
})

describe('kategori', () => {
  it('batas ambang', () => {
    expect(klasifikasi(1.9, true, T)).toBe('rendah')
    expect(klasifikasi(2, true, T)).toBe('sedang')
    expect(klasifikasi(3.99, true, T)).toBe('sedang')
    expect(klasifikasi(4, true, T)).toBe('tinggi')
  })
  it('tanpa data memadai', () => {
    expect(klasifikasi(null, true, T)).toBe('tidak-memadai')
    expect(klasifikasi(5, false, T)).toBe('tidak-memadai')
    expect(klasifikasi(Number.NaN, true, T)).toBe('tidak-memadai')
  })
  it('kelas peta', () => {
    expect([0, 2, 3.9, 8, 20].map(binLaju)).toEqual([0, 1, 1, 4, 4])
  })
  it('jumlah per kategori', () => {
    const n = hitungKategori(
      [
        { laju: 1, memadai: true },
        { laju: 3, memadai: true },
        { laju: 9, memadai: true },
        { laju: null, memadai: false },
      ],
      T,
    )
    expect(n).toEqual({ rendah: 1, sedang: 1, tinggi: 1, 'tidak-memadai': 1 })
  })
})

describe('Proyeksi Tenor', () => {
  it('cocok dengan contoh Kalkulator tim: 5 ± 1 cm/th selama 15 tahun', () => {
    expect(hitungProyeksi(5, 1, 15)).toEqual({ tenor: 15, tengah: 75, bawah: 60, atas: 90 })
    expect(kalimatProyeksi(hitungProyeksi(5, 1, 15))).toBe('Jika tren bertahan, dalam 15 tahun tanah di sini turun sekitar 60–90 cm.')
    expect(teksProyeksi(hitungProyeksi(5, 1, 15))).toBe('60–90 cm')
  })
  it('batas bawah tidak pernah negatif', () => {
    expect(hitungProyeksi(0.5, 1, 10)).toMatchObject({ bawah: 0, atas: 15 })
    expect(hitungProyeksi(-1, 0.5, 10)).toMatchObject({ tengah: 0, bawah: 0, atas: 0 })
  })
  it('proyeksi sangat kecil', () => {
    const p = hitungProyeksi(0.01, 0.01, 10)
    expect(kalimatProyeksi(p)).toContain('kurang dari 1 cm')
    expect(kalimatProyeksi(p).startsWith('Jika tren bertahan')).toBe(true)
    expect(teksProyeksi(p)).toBe('< 1 cm')
  })
})

describe('teks laporan', () => {
  it('kalimat status', () => {
    expect(kalimatStatus(5, 1, 'tinggi')).toBe('Kawasan ini turun sekitar 4–6 cm/tahun (kategori tinggi).')
    expect(kalimatStatus(0.1, 0.2, 'rendah')).toContain('relatif stabil')
    expect(kalimatStatus(null, null, 'tidak-memadai')).toContain('belum memadai')
  })
  it('langkah berikutnya berisi 3 sampai 5 butir untuk tiap kategori', () => {
    for (const k of ['rendah', 'sedang', 'tinggi', 'tidak-memadai'] as Kategori[]) {
      const l = langkahBerikutnya(k)
      expect(l.judul.length).toBeGreaterThan(5)
      expect(l.butir.length).toBeGreaterThanOrEqual(3)
      expect(l.butir.length).toBeLessThanOrEqual(5)
    }
  })
})

describe('router', () => {
  it('membaca halaman dan parameter', () => {
    expect(bacaRute('').halaman).toBe('peta')
    expect(bacaRute('#/dashboard').halaman).toBe('dashboard')
    expect(bacaRute('#/apa-ini').halaman).toBe('peta')
    const r = bacaRute('#/?k=osm-1&t=20')
    expect(r.halaman).toBe('peta')
    expect(r.params.get('k')).toBe('osm-1')
    expect(r.params.get('t')).toBe('20')
  })
  it('membuat hash dan bolak-balik', () => {
    expect(buatHash('metode')).toBe('#/metode')
    expect(buatHash('peta', { k: 'a', t: null })).toBe('#/?k=a')
    const r = bacaRute(buatHash('peta', { k: 'osm-9', t: 10 }))
    expect([r.halaman, r.params.get('k'), r.params.get('t')]).toEqual(['peta', 'osm-9', '10'])
  })
  it('tautan w= yang sudah dibaca tidak menarik balik wilayah yang baru dipilih', () => {
    // Pengguna di Semarang (#/?w=semarang sudah dibaca) memilih Jakarta. Selama Jakarta dimuat,
    // tautan masih w=semarang. Tautan itu tidak boleh memindahkan aplikasi kembali ke Semarang.
    const lama = bacaRute('#/?w=semarang')
    expect(wilayahDariTautan(lama, kunciRute(lama), 'jakarta')).toBeNull()
    // tautan baru yang ditempel saat aplikasi terbuka tetap memindahkan wilayah
    const baru = bacaRute('#/?w=jakarta&ll=-6.12,106.80')
    expect(wilayahDariTautan(baru, kunciRute(lama), 'semarang')).toBe('jakarta')
    // tautan ke wilayah yang sedang aktif, atau tanpa w yang sah, tidak memindahkan apa pun
    expect(wilayahDariTautan(baru, null, 'jakarta')).toBeNull()
    expect(wilayahDariTautan(bacaRute('#/?w=bandung'), null, 'semarang')).toBeNull()
    expect(wilayahDariTautan(bacaRute('#/dashboard'), null, 'semarang')).toBeNull()
  })
  it('kunci rute membedakan halaman dan parameter', () => {
    expect(kunciRute(bacaRute('#/?w=semarang'))).toBe(kunciRute(bacaRute('#/?w=semarang')))
    expect(kunciRute(bacaRute('#/?w=semarang'))).not.toBe(kunciRute(bacaRute('#/?w=jakarta')))
    expect(kunciRute(bacaRute('#/dashboard'))).not.toBe(kunciRute(bacaRute('#/')))
  })
})
