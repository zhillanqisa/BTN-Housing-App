// Tes data: validasi dataset, file data bawaan, impor CSV/GeoJSON, dan pembuatan PDF.
// Tes file bawaan berupa invarian, supaya tetap berlaku saat data demo diganti hasil olahan.
import { describe, expect, it } from 'vitest'
import mentah from '../../public/data/semarang-kawasan.geojson?raw'
import { cariKawasanDiTitik, indeksKawasan, validasiDataset } from './data'
import { imporCSV, imporGeoJSON, parseCSV, templatCSV } from './importer'
import { buatLaporanPdf, type KonteksPdf } from './pdf'
import type { Position } from './types'
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
  it('membaca sebaran, elevasi, dan catatan proses; data lama tanpa field itu tetap sah', () => {
    const lama = validasiDataset(fc([{ nama: 'A', laju: 1, sigma: 0.2 }]))
    expect(lama.ok && lama.dataset.features[0]!.properties.sebaran).toBeUndefined()
    expect(lama.ok && lama.dataset.metadata.proses).toBeUndefined()

    const baru = validasiDataset({
      ...fc([{ nama: 'A', laju: 3, sigma: 0.5, sebaran: [2.1, '4,2'], elevasiM: 3.5 }, { nama: 'B', laju: 1, sigma: 0.1, sebaran: [1] }]),
      metadata: {
        jenis: 'olahan',
        proses: {
          lintasan: [{ arah: 'descending', path: 76, nCitra: 170, nPasangan: 510 }, { arah: 'ascending', path: 127, nCitra: 260, nPasangan: 780 }],
          resolusiM: 80,
          referensi: 'CSEM',
          koreksiAtmosfer: 'korelasi ketinggian',
          vertikal: 'dua-lintasan',
          validasi: { antarLintasan: { n: 1000, rmse: 0.4, bias: -0.1, r: 0.93 }, gnss: [{ stasiun: 'CSEM', gnss: 0.08, insar: 0.1 }, { stasiun: 'rusak' }], lulus: true },
          konteks: ['elevasi', 7],
        },
      },
    })
    if (!baru.ok) throw new Error('harus sah')
    expect(baru.dataset.features[0]!.properties).toMatchObject({ sebaran: [2.1, 4.2], elevasiM: 3.5 })
    expect(baru.dataset.features[1]!.properties.sebaran).toBeUndefined()
    const p = baru.dataset.metadata.proses!
    expect(p.lintasan).toHaveLength(2)
    expect(p.lintasan[1]).toMatchObject({ arah: 'ascending', path: 127 })
    expect(p.vertikal).toBe('dua-lintasan')
    expect(p.validasi).toMatchObject({ lulus: true, antarLintasan: { rmse: 0.4 }, gnss: [{ stasiun: 'CSEM', gnss: 0.08, insar: 0.1 }] })
    expect(p.konteks).toEqual(['elevasi'])
  })
})

const asli = validasiDataset(JSON.parse(mentah))
if (!asli.ok) throw new Error(`Data bawaan tidak sah: ${asli.galat.join(' ')}`)
const kawasan = indeksKawasan(asli.dataset)
const demo = asli.dataset.metadata.jenis === 'demo'

describe('file data bawaan', () => {
  it('177 kelurahan, jenis demo atau olahan, id unik', () => {
    expect(kawasan).toHaveLength(177)
    expect(['demo', 'olahan']).toContain(asli.dataset.metadata.jenis)
    expect(new Set(kawasan.map((k) => k.id)).size).toBe(177)
    expect(new Set(kawasan.map((k) => k.kecamatan)).size).toBe(16)
  })
  it('kawasan memadai punya laju wajar, ketidakpastian, sebaran, dan deret yang berawal di nol', () => {
    for (const k of kawasan.filter((x) => x.memadai)) {
      expect(Number.isFinite(k.laju)).toBe(true)
      // cm/tahun: sedikit di bawah nol masih mungkin (derau di area stabil), puluhan cm tidak wajar
      expect(k.laju!).toBeGreaterThan(-5)
      expect(k.laju!).toBeLessThan(40)
      expect(k.sigma!).toBeGreaterThanOrEqual(0)
      expect(k.deret.length).toBeGreaterThan(4)
      expect(k.deret[0]![1]).toBe(0)
      if (k.sebaran) expect(k.sebaran[0]).toBeLessThanOrEqual(k.sebaran[1])
    }
  })
  it('kawasan tidak memadai tidak membawa angka', () => {
    // pada data olahan bisa saja semua kelurahan memadai; aturannya tetap berlaku bila ada yang tidak
    for (const k of kawasan.filter((x) => !x.memadai)) {
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
  // kotak sekitar titik (derajat) untuk peta mini contoh
  const kotak = (p: Position, x0: number, y0: number, x1: number, y1: number): Position[] => [
    [p[0] + x0, p[1] + y0],
    [p[0] + x1, p[1] + y0],
    [p[0] + x1, p[1] + y1],
    [p[0] + x0, p[1] + y1],
  ]
  // konteks contoh: zona permukiman di atas Aluvium (kode sama dengan lapis konteks asli)
  const konteksDi = (p: Position): KonteksPdf[] => [
    {
      jenis: 'rtrw',
      sumber: 'Pola ruang RTRW Provinsi Jawa Tengah 2024-2044, skala 1:250.000',
      kode: '32100000',
      nama: 'Kawasan Permukiman',
      fungsi: 'Budi daya',
      warna: '#f2c48d',
      peta: [
        { nama: 'Kawasan Permukiman', warna: '#f2c48d', cincin: [kotak(p, -0.006, -0.006, 0.002, 0.006)] },
        { nama: 'Kawasan Peruntukan Industri', warna: '#b9a3e3', cincin: [kotak(p, 0.002, -0.006, 0.006, 0.006)] },
      ],
    },
    {
      jenis: 'geologi',
      sumber: 'Peta Geologi Lembar Magelang dan Semarang, skala 1:100.000',
      kode: 'Qa',
      nama: 'Aluvium',
      batuan: 'Endapan dataran pantai',
      bacaan: null,
      warna: '#f0e18a',
      peta: [{ nama: 'Aluvium', warna: '#f0e18a', cincin: [kotak(p, -0.01, -0.01, 0.01, 0.01)] }],
    },
  ]
  const buat = async (nama: string, memadai: boolean) => {
    // kawasan tanpa data dibuat sendiri: file data bawaan belum tentu punya satu
    const k = memadai ? kawasan.find((x) => x.nama === nama)! : { ...kawasan[0]!, memadai: false, laju: null, sigma: null, sebaran: null, nPiksel: 0, deret: [] }
    const konteks = konteksDi(k.pusat)
    const kategori = klasifikasi(k.laju, k.memadai, { sedang: 2, tinggi: 4 })
    const blob = await buatLaporanPdf({ kawasan: k, kategori, tenor: 15, thresholds: { sedang: 2, tinggi: 4 }, meta: asli.dataset.metadata, label: nama, lngLat: k.pusat, gambarPeta: null, konteks })
    return { blob, teks: new TextDecoder('latin1').decode(await blob.arrayBuffer()) }
  }
  it('dua halaman untuk kawasan kategori tinggi: laporan dan konteks lokasi', async () => {
    const { blob, teks } = await buat('Kaligawe', true)
    expect(blob.size).toBeGreaterThan(5000)
    expect(teks.startsWith('%PDF-')).toBe(true)
    expect(teks).toContain('/Count 2')
    expect(teks).toContain('SubTen')
    if (demo) expect(teks).toContain('DATA DEMO ILUSTRATIF')
    else expect(teks).not.toContain('DATA DEMO ILUSTRATIF')
    expect(teks).toContain('Jika tren bertahan')
    expect(teks).toContain('Status kawasan')
  })
  it('halaman konteks menjelaskan pola ruang, geologi, dan persil', async () => {
    const { teks } = await buat('Kaligawe', true)
    expect(teks).toContain('Konteks lokasi')
    expect(teks).toContain('STATUS UNTUK RUMAH TINGGAL')
    expect(teks).toContain('250 m')
    expect(teks).toContain('KERENTANAN MEMADAT')
    expect(teks).toContain('Lapisan keras')
    expect(teks).toContain('Tanyakan ke penjual'.toUpperCase())
    expect(teks).toContain('bhumi.atrbpn.go.id')
  })
  it('zona RDTR tampil dengan sub-zona dan zonanya, dan tiga lapis tetap muat paling banyak tiga halaman', async () => {
    const k = kawasan.find((x) => x.nama === 'Kaligawe')!
    const rdtr: KonteksPdf = {
      jenis: 'rdtr',
      sumber: 'Rencana pola ruang RDTR Kota Pekalongan 2024-2044, skala 1:5.000',
      kode: '32103000',
      nama: 'Perumahan Kepadatan Tinggi',
      zona: 'Perumahan',
      fungsi: 'Budi daya',
      warna: '#f2c14e',
      peta: [{ nama: 'Perumahan', warna: '#f2c14e', cincin: [kotak(k.pusat, -0.004, -0.004, 0.004, 0.004)] }],
    }
    const kategori = klasifikasi(k.laju, k.memadai, { sedang: 2, tinggi: 4 })
    const blob = await buatLaporanPdf({
      kawasan: k, kategori, tenor: 15, thresholds: { sedang: 2, tinggi: 4 }, meta: asli.dataset.metadata, label: 'Kaligawe', lngLat: k.pusat, gambarPeta: null,
      konteks: [rdtr, ...konteksDi(k.pusat)],
    })
    const teks = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(teks).toContain('ZONA RDTR')
    expect(teks).toContain('POLA RUANG RTRW')
    expect(teks).toContain('zona Perumahan')
    // penjelasan sub-zona (teks bisa terbungkus antarbaris, jadi cek satu kata)
    expect(teks).toContain('Kepadatan')
    expect(teks).toMatch(/\/Count [23]\b/)
  })
  it('lapis bahaya banjir tampil dengan tingkat bahaya dan penjelasannya', async () => {
    const k = kawasan.find((x) => x.nama === 'Kaligawe')!
    const banjir: KonteksPdf = {
      jenis: 'banjir',
      sumber: 'Indeks bahaya banjir (InaRISK BNPB), skala 100 m per piksel',
      kode: 'tinggi',
      nama: 'Tinggi',
      warna: '#1d4f91',
      peta: [{ nama: 'Tinggi', warna: '#1d4f91', cincin: [kotak(k.pusat, -0.004, -0.004, 0.004, 0.004)] }],
    }
    const blob = await buatLaporanPdf({
      kawasan: k, kategori: klasifikasi(k.laju, k.memadai, { sedang: 2, tinggi: 4 }), tenor: 15, thresholds: { sedang: 2, tinggi: 4 }, meta: asli.dataset.metadata, label: 'Kaligawe', lngLat: k.pusat, gambarPeta: null,
      konteks: [banjir],
    })
    const teks = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(teks).toContain('BAHAYA BANJIR')
    expect(teks).toContain('TINGKAT BAHAYA')
    expect(teks).toContain('asuransi')
  })
  it('laporan titik menyebut blok di sekitar titik, bukan kawasan', async () => {
    const k = kawasan.find((x) => x.nama === 'Kaligawe')!
    const blob = await buatLaporanPdf({
      kawasan: { ...k, nPiksel: 8, koherensi: null },
      kategori: klasifikasi(k.laju, k.memadai, { sedang: 2, tinggi: 4 }),
      tenor: 15,
      thresholds: { sedang: 2, tinggi: 4 },
      meta: asli.dataset.metadata,
      label: 'Titik pilihan',
      lngLat: k.pusat,
      gambarPeta: null,
      titik: true,
      lebarBlokM: 240,
    })
    const teks = new TextDecoder('latin1').decode(await blob.arrayBuffer())
    expect(teks).toContain('/Count 2')
    expect(teks).toContain('Status di titik ini')
    expect(teks).toContain('blok sekitar 240 m')
    expect(teks).toContain('Kelurahan Kaligawe, Kecamatan')
    expect(teks).not.toContain('Status kawasan')
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
  it('dua halaman untuk kawasan tanpa data memadai', async () => {
    const { teks } = await buat('', false)
    expect(teks).toContain('/Count 2')
    expect(teks).toContain('Data tidak memadai')
  })
})
