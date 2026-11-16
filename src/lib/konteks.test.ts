// Tes lapis konteks: validasi file, pencarian kelas di titik, dan statistik.
import { describe, expect, it } from 'vitest'
import rdtrMentah from '../../public/data/pekalongan-konteks-rdtr.geojson?raw'
import abrasiMentah from '../../public/data/semarang-konteks-abrasi.geojson?raw'
import banjirMentah from '../../public/data/semarang-konteks-banjir.geojson?raw'
import geologiMentah from '../../public/data/semarang-konteks-geologi.geojson?raw'
import rtrwMentah from '../../public/data/semarang-konteks-rtrw.geojson?raw'
import { adalahTingkatBahaya, KODE_ALUVIUM, konteksDi, lapisBahaya, lapisTataRuang, statFitur, statKelas, validasiKonteks, type LapisKonteks } from './konteks'
import { penjelasanBahaya, penjelasanPolaRuang, penjelasanSubzona } from './penjelasan'
import type { Position } from './types'

const rtrw = validasiKonteks(JSON.parse(rtrwMentah), 'rtrw')
const rdtr = validasiKonteks(JSON.parse(rdtrMentah), 'rdtr')
const geologi = validasiKonteks(JSON.parse(geologiMentah), 'geologi')
const banjir = validasiKonteks(JSON.parse(banjirMentah), 'banjir')
const abrasi = validasiKonteks(JSON.parse(abrasiMentah), 'abrasi')

describe('lapis bahaya InaRISK BNPB', () => {
  it('jenis lapis: bahaya terpisah dari tata ruang', () => {
    expect(lapisBahaya('banjir') && lapisBahaya('abrasi')).toBe(true)
    expect(lapisTataRuang('banjir') || lapisTataRuang('abrasi') || lapisTataRuang('geologi')).toBe(false)
    expect(lapisTataRuang('rdtr') && lapisTataRuang('rtrw')).toBe(true)
    expect(lapisBahaya('geologi')).toBe(false)
  })
  it('kelas bahaya BNPB dengan sumber InaRISK, statistik per kelas, dan penjelasan untuk pembeli', () => {
    for (const [j, l] of [
      ['banjir', banjir],
      ['abrasi', abrasi],
    ] as const) {
      expect(l).not.toBeNull()
      expect(l!.meta.sumber[0]?.nama).toContain('InaRISK')
      expect(l!.meta.statistik.length).toBe(l!.fitur.length)
      for (const f of l!.fitur) {
        expect(adalahTingkatBahaya(f.kode)).toBe(true)
        expect(f.warna).toMatch(/^#[0-9a-f]{6}$/i)
        expect(statFitur(l, f)).toBeDefined()
        if (adalahTingkatBahaya(f.kode)) expect(penjelasanBahaya(j, f.kode).arti.length).toBeGreaterThan(20)
      }
    }
  })
  it('Kaligawe di dataran banjir tinggi, Tembalang di perbukitan tanpa bahaya banjir, pantai Marina di jalur abrasi', () => {
    expect(konteksDi(banjir, [110.4486, -6.9563])?.kode).toBe('tinggi')
    expect(konteksDi(banjir, [110.438, -7.056])).toBeNull()
    expect(konteksDi(abrasi, [110.39, -6.948])?.kode).toBe('tinggi')
    expect(konteksDi(abrasi, [110.4486, -6.9563])).toBeNull()
  })
})

const zonaDi = (l: LapisKonteks) => new Set(l.fitur.map((f) => f.zona ?? f.nama))

describe('validasiKonteks', () => {
  it('menolak yang bukan FeatureCollection atau tanpa fitur sah', () => {
    expect(validasiKonteks(null, 'rtrw')).toBeNull()
    expect(validasiKonteks({ type: 'FeatureCollection', features: [] }, 'rtrw')).toBeNull()
    expect(validasiKonteks({ type: 'FeatureCollection', features: [{ properties: { nama: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } }] }, 'rtrw')).toBeNull()
  })
  it('melewati fitur rusak, membaca warna dan statistik dengan longgar', () => {
    const l = validasiKonteks(
      {
        type: 'FeatureCollection',
        metadata: { jenis: 'perkiraan', statistik: [{ nama: 'A', warna: 'merah', nPiksel: 3 }, { tanpa: 'nama' }] },
        features: [
          { properties: { nama: '' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
          { properties: { nama: 'A', warna: '#123456', kode: 'Qa' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } },
        ],
      },
      'geologi',
    )
    expect(l?.fitur).toHaveLength(1)
    expect(l?.meta.jenis).toBe('perkiraan')
    expect(l?.meta.statistik).toEqual([expect.objectContaining({ nama: 'A', nPiksel: 3, warna: '#c4a27c' })])
    expect(konteksDi(l, [1, 1])?.kode).toBe('Qa')
    expect(konteksDi(l, [3, 3])).toBeNull()
    expect(konteksDi(null, [1, 1])).toBeNull()
  })
})

describe('file lapis bawaan', () => {
  const titik: Record<string, Position> = {
    terboyo: [110.46, -6.955],
    tembalang: [110.44, -7.05],
    laut: [110.4, -6.9],
  }
  it('ketiga lapis termuat, dengan sumber dan statistik per zona (tata ruang) atau per satuan (geologi)', () => {
    for (const l of [rdtr, rtrw, geologi]) {
      expect(l).not.toBeNull()
      expect(l!.meta.sumber.length).toBeGreaterThan(0)
      expect(l!.meta.statistik.length).toBe(zonaDi(l!).size)
      for (const f of l!.fitur) {
        expect(f.warna).toMatch(/^#[0-9a-f]{6}$/i)
        expect(statFitur(l, f)).toBeDefined()
      }
    }
  })
  it('tata ruang: setiap zona punya penjelasan untuk calon pembeli rumah', () => {
    for (const l of [rdtr, rtrw]) {
      for (const z of zonaDi(l!)) {
        const kode = l!.fitur.find((f) => (f.zona ?? f.nama) === z)!.kode
        expect(penjelasanPolaRuang(kode, z), z).not.toBeNull()
      }
    }
  })
  it('rdtr Pekalongan: titik di pusat kota jatuh di sub-zona dengan zona, kode resmi, dan fungsi', () => {
    const f = konteksDi(rdtr, [109.6745, -6.8895])
    expect(f).not.toBeNull()
    expect(f!.zona).toBeTruthy()
    expect(f!.kode).toMatch(/^3[12]\d{6}$/)
    expect(['Lindung', 'Budi daya']).toContain(f!.fungsi)
    expect(penjelasanPolaRuang('32103000', 'Perumahan')?.hunian).toBe('sesuai')
    expect(penjelasanSubzona('Perumahan Kepadatan Tinggi')).toMatch(/kavling kecil/)
    expect(penjelasanSubzona('SPU Skala Kelurahan')).toMatch(/kelurahan/)
    expect(penjelasanSubzona('Badan Air')).toBeNull()
  })
  it('geologi: titik di dataran ambles Terboyo jatuh di Aluvium, Tembalang di satuan batuan, laut di luar', () => {
    expect(konteksDi(geologi, titik.terboyo!)?.kode).toBe(KODE_ALUVIUM)
    const bukit = konteksDi(geologi, titik.tembalang!)
    expect(bukit).not.toBeNull()
    expect(bukit!.kode).not.toBe(KODE_ALUVIUM)
    expect(konteksDi(geologi, titik.laut!)).toBeNull()
  })
  it('geologi: Aluvium turun jauh lebih cepat daripada semua satuan batuan lain', () => {
    const st = geologi!.meta.statistik
    const a = st.find((s) => s.kode === KODE_ALUVIUM)
    expect(a?.median).toBeGreaterThan(2)
    for (const s of st.filter((x) => x.kode !== KODE_ALUVIUM && x.median != null)) expect(Math.abs(s.median!)).toBeLessThan(0.5)
    expect(statKelas(geologi, a!.nama)).toBe(a)
  })
  it('rtrw: setiap titik di dalam kota punya kelas pola ruang dengan kode resmi', () => {
    for (const p of [titik.terboyo!, titik.tembalang!]) {
      const f = konteksDi(rtrw, p)
      expect(f).not.toBeNull()
      expect(f!.kode).toMatch(/^3[12]\d{6}$/)
      expect(['Lindung', 'Budi daya']).toContain(f!.fungsi)
    }
  })
})
