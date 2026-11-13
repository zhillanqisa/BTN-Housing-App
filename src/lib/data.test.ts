// Tes data: validasi dataset, file demo asli, impor CSV/GeoJSON, dan pembuatan PDF.
import { describe, expect, it } from 'vitest'
import mentah from '../../public/data/semarang-kawasan.geojson?raw'
import { cariKawasanDiTitik, indeksKawasan, validasiDataset } from './data'
import { imporCSV, imporGeoJSON, parseCSV, templatCSV } from './importer'
import { buatLaporanPdf } from './pdf'
import { klasifikasi } from './risk'

const kotak = (x: number) => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]] })
const fc = (props: Record<string, unknown>[]) => ({ type: 'FeatureCollection', features: props.map((p, i) => ({ type: 'Feature', properties: p, geometry: kotak(i * 2) })) })

describe('validasiDataset', () => {
  it('menerima dataset sederhana', () => {
    const h = validasiDataset(fc([{ id: 'a', nama: 'Satu', kecamatan: 'K', laju: 5, sigma: 1 }, { id: 'b', nama: 'Dua', laju: null }]))
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.dataset.features[0]!.properties).toMatchObject({ id: 'a', laju: 5, sigma: 1, memadai: true })
    expect(h.dataset.features[1]!.properties).toMatchObject({ laju: null, memadai: false })
    expect(h.dataset.metadata.jenis).toBe('unggahan')
  })
  it('menerima nama kolom alternatif', () => {
    const h = validasiDataset(fc([{ name: 'Satu', rate: '3,5', std: 0.5 }]))
    expect(h.ok && h.dataset.features[0]!.properties).toMatchObject({ nama: 'Satu', laju: 3.5, sigma: 0.5 })
  })
  it('menolak data yang salah', () => {
    expect(validasiDataset({ type: 'Feature' }).ok).toBe(false)
    expect(validasiDataset(fc([{ laju: 1 }])).ok).toBe(false) // tanpa nama
    expect(validasiDataset(fc([{ nama: 'A', laju: null }])).ok).toBe(false) // tidak ada laju sama sekali
    const titik = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nama: 'A', laju: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } }] }
    expect(validasiDataset(titik).ok).toBe(false)
  })
  it('memperingatkan kemungkinan salah satuan (mm vs cm)', () => {
    const h = validasiDataset(fc([{ nama: 'A', laju: 60, sigma: 5 }]))
    expect(h.ok && h.peringatan.join(' ')).toContain('mm/tahun')
  })
  it('indeks dan pencarian titik', () => {
    const h = validasiDataset(fc([{ nama: 'A', laju: 1, sigma: 0 }, { nama: 'B', laju: 2, sigma: 0 }]))
    if (!h.ok) throw new Error('harus sah')
    const k = indeksKawasan(h.dataset)
    expect(k[0]!.bbox).toEqual([0, 0, 1, 1])
    expect(k[0]!.luasKm2).toBeGreaterThan(0)
    expect(cariKawasanDiTitik([2.5, 0.5], k)?.nama).toBe('B')
    expect(cariKawasanDiTitik([9, 9], k)).toBeNull()
  })
})

const asli = validasiDataset(JSON.parse(mentah))
if (!asli.ok) throw new Error(`Data demo tidak sah: ${asli.galat.join(' ')}`)
const kawasan = indeksKawasan(asli.dataset)

describe('file data demo', () => {
  it('177 kelurahan, ditandai demo, id unik', () => {
    expect(kawasan).toHaveLength(177)
    expect(asli.dataset.metadata.jenis).toBe('demo')
    expect(new Set(kawasan.map((k) => k.id)).size).toBe(177)
    expect(new Set(kawasan.map((k) => k.kecamatan)).size).toBe(16)
  })
  it('kawasan memadai punya laju, ketidakpastian, dan deret 36 titik', () => {
    for (const k of kawasan.filter((x) => x.memadai)) {
      expect(Number.isFinite(k.laju)).toBe(true)
      expect(k.laju!).toBeGreaterThanOrEqual(0)
      expect(k.sigma!).toBeGreaterThanOrEqual(0)
      expect(k.deret).toHaveLength(36)
      expect(k.deret[0]![1]).toBe(0)
    }
  })
  it('kawasan tidak memadai tidak membawa angka', () => {
    const tak = kawasan.filter((x) => !x.memadai)
    expect(tak.length).toBeGreaterThan(0)
    for (const k of tak) {
      expect(k.laju).toBeNull()
      expect(k.deret).toHaveLength(0)
    }
  })
})

describe('impor', () => {
  const BOM = String.fromCharCode(0xfeff)
  it('parseCSV: pemisah, kutip, BOM', () => {
    expect(parseCSV(`${BOM}a;b\n1;"x;y"\n\n2;"k ""q"""`)).toEqual({ header: ['a', 'b'], baris: [['1', 'x;y'], ['2', 'k "q"']] })
    expect(parseCSV('a,b\r\n1,2\r\n').baris).toEqual([['1', '2']])
    expect(parseCSV('a\tb\n1\t2').header).toEqual(['a', 'b'])
  })
  it('CSV cocok lewat id dan lewat nama, koma desimal', () => {
    const a = kawasan.find((k) => k.nama === 'Kaligawe')!
    const h = imporCSV(`id;nama;laju;sigma\n${a.id};;7,5;1,2\n;Panggung Lor;6;1`, kawasan, asli.dataset.metadata, 'uji.csv')
    expect(h.ok).toBe(true)
    if (!h.ok) return
    expect(h.ringkasan).toMatchObject({ total: 2, cocok: 2, memadai: 2 })
    const f = h.dataset.features.find((x) => x.properties.id === a.id)!
    expect(f.properties).toMatchObject({ laju: 7.5, sigma: 1.2, memadai: true })
    expect(h.dataset.features).toHaveLength(177)
    expect(h.dataset.features.filter((x) => !x.properties.memadai)).toHaveLength(175)
    expect(h.dataset.metadata.jenis).toBe('unggahan')
  })
  it('nama kembar butuh kolom kecamatan', () => {
    // "Mangunharjo" ada di Kecamatan Tugu dan Tembalang
    const tanpa = imporCSV('nama;laju\nMangunharjo;3\nKaligawe;7', kawasan, null, 'uji.csv')
    expect(tanpa.ok && tanpa.ringkasan.cocok).toBe(1)
    expect(tanpa.ok && tanpa.ringkasan.takCocok[0]).toContain('Mangunharjo')
    const dengan = imporCSV('nama;kecamatan;laju\nMangunharjo;Tugu;3', kawasan, null, 'uji.csv')
    expect(dengan.ok && dengan.ringkasan.cocok).toBe(1)
    expect(dengan.ok && dengan.dataset.features.find((f) => f.properties.memadai)?.properties.kecamatan).toBe('Tugu')
  })
  it('galat yang jelas', () => {
    expect(imporCSV('nama;nilai\nKaligawe;7', kawasan, null, 'x.csv')).toMatchObject({ ok: false })
    expect(imporCSV('nama;laju\nTidak Ada;7', kawasan, null, 'x.csv')).toMatchObject({ ok: false })
    expect(imporGeoJSON('{bukan json', 'x.geojson')).toMatchObject({ ok: false })
  })
  it('GeoJSON lengkap dan templat CSV', () => {
    const h = imporGeoJSON(mentah, 'demo.geojson')
    expect(h.ok && h.ringkasan.total).toBe(177)
    const t = parseCSV(templatCSV(kawasan))
    expect(t.header).toEqual(['id', 'nama', 'kecamatan', 'laju', 'sigma', 'n_piksel', 'koherensi'])
    expect(t.baris).toHaveLength(177)
  })
})

describe('PDF Laporan Ambles', () => {
  const buat = async (nama: string, memadai: boolean) => {
    const k = kawasan.find((x) => (memadai ? x.nama === nama : !x.memadai))!
    const kategori = klasifikasi(k.laju, k.memadai, { sedang: 2, tinggi: 4 })
    const blob = await buatLaporanPdf({ kawasan: k, kategori, tenor: 15, thresholds: { sedang: 2, tinggi: 4 }, meta: asli.dataset.metadata, label: nama, lngLat: k.pusat, gambarPeta: null })
    return { blob, teks: new TextDecoder('latin1').decode(await blob.arrayBuffer()) }
  }
  it('satu halaman untuk kawasan kategori tinggi', async () => {
    const { blob, teks } = await buat('Kaligawe', true)
    expect(blob.size).toBeGreaterThan(5000)
    expect(teks.startsWith('%PDF-')).toBe(true)
    expect(teks).toContain('/Count 1')
    expect(teks).toContain('DATA DEMO ILUSTRATIF')
    expect(teks).toContain('Jika tren bertahan')
  })
  // Untuk memeriksa tata letak dengan mata: VITE_PDF_OUT=<folder> npx vitest run
  it.skipIf(!import.meta.env.VITE_PDF_OUT)('menulis contoh PDF ke folder VITE_PDF_OUT', async () => {
    const modul = 'node:fs'
    const fs = (await import(/* @vite-ignore */ modul)) as { writeFileSync: (p: string, d: Uint8Array) => void }
    for (const [nama, memadai] of [['Kaligawe', true], ['', false]] as const) {
      const { blob } = await buat(nama, memadai)
      fs.writeFileSync(`${import.meta.env.VITE_PDF_OUT}/contoh-${memadai ? 'tinggi' : 'tidak-memadai'}.pdf`, new Uint8Array(await blob.arrayBuffer()))
    }
  })
  it('satu halaman untuk kawasan tanpa data memadai', async () => {
    const { teks } = await buat('', false)
    expect(teks).toContain('/Count 1')
    expect(teks).toContain('Data tidak memadai')
  })
})
