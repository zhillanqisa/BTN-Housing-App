// Tes fungsi murni di komponen visual: label waktu dan tabel tahunan grafik Riwayat, skala Proyeksi Tenor.
import { describe, expect, it } from 'vitest'
import { hitungProyeksi } from '../lib/risk'
import { barisTahunan, labelWaktu } from './HistoryChart'
import { skalaTenor } from './TenorVisual'

describe('grafik Riwayat', () => {
  it('label waktu memakai bulan tempat epoch jatuh', () => {
    expect(labelWaktu(2020)).toBe('Jan 2020')
    expect(labelWaktu(2020.125)).toBe('Feb 2020') // titik tengah triwulan pertama
    expect(labelWaktu(2026.875)).toBe('Nov 2026')
    expect(labelWaktu(2021.75)).toBe('Okt 2021')
  })
  it('tabel tahunan: satu baris per tahun meski epoch tidak di awal tahun, plus titik terakhir', () => {
    const deret: [number, number][] = [2020.125, 2020.375, 2020.625, 2020.875, 2021.125, 2021.375, 2021.625].map((t, i) => [t, -i])
    expect(barisTahunan(deret).map((d) => d[0])).toEqual([2020.125, 2021.125, 2021.625])
    expect(barisTahunan([])).toEqual([])
  })
})

describe('skala Proyeksi Tenor', () => {
  it('penurunan besar memakai skala nyata', () => {
    expect(skalaTenor(7, 0.4)).toEqual({ s: 0.26, perbesar: 1 })
  })
  it('penurunan kecil diperbesar bertingkat dan tetap muat di gambar', () => {
    for (const [laju, sigma] of [
      [0.2, 0.4],
      [2.5, 0.4],
      [0, 0.3],
    ] as const) {
      const { s, perbesar } = skalaTenor(laju, sigma)
      expect(perbesar).toBeGreaterThan(1)
      expect([2, 5, 10, 20, 50, 100]).toContain(perbesar)
      expect(hitungProyeksi(laju, sigma, 20).atas * s).toBeLessThanOrEqual(78)
    }
  })
  it('mengganti tenor menggeser rumah pada skala yang sama', () => {
    const { s } = skalaTenor(0.2, 0.4)
    const geser = [10, 15, 20].map((t) => hitungProyeksi(0.2, 0.4, t as 10 | 15 | 20).tengah * s)
    expect(geser[1]! - geser[0]!).toBeGreaterThan(3)
    expect(geser[2]! - geser[1]!).toBeGreaterThan(3)
  })
})
