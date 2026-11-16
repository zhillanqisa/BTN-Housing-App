// Halaman "Data & metode": dari mana angkanya, cara membacanya, batasannya,
// hasil validasi, dan tempat mengunggah data per kelurahan (CSV / GeoJSON).
// Status tiap langkah dan sumber dihitung dari metadata dataset, bukan ditulis mati.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowCounterClockwise, ArrowRight, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { batasan, LABEL_KATEGORI, PRINSIP, TENORS, URUTAN_KATEGORI } from '../lib/config'
import { urlWilayah, wilayahById, type IdWilayah } from '../lib/wilayah'
import { keDataset, unduhBerkas } from '../lib/data'
import { fmt, fmtPeriode, fmtTanggal } from '../lib/format'
import { lebarBlokM } from '../lib/grid'
import { imporCSV, imporGeoJSON, templatCSV, type HasilImpor } from '../lib/importer'
import { JENIS_LAPIS, KODE_ALUVIUM, LABEL_LAPIS, lapisTataRuang, type JenisLapis, type LapisKonteks } from '../lib/konteks'
import { hitungProyeksi, kalimatProyeksi } from '../lib/risk'
import { navigasi, useRute } from '../lib/router'
import { useApp } from '../lib/store'
import type { DatasetMeta, Kategori, Tenor } from '../lib/types'
import { Button, Card, Chip, cx, Notice, Segmented, Skeleton, Swatch } from '../ui/primitives'

const BAGIAN = [
  ['status', 'Status data'],
  ['kategori', 'Kategori'],
  ['proyeksi', 'Proyeksi Tenor'],
  ['alur', 'Alur olah data'],
  ['sumber', 'Sumber data'],
  ['konteks', 'Lapis konteks'],
  ['validasi', 'Validasi'],
  ['batasan', 'Batasan'],
  ['ganti-data', 'Unggah data'],
] as const

type StatusPil =
  | 'Selesai'
  | 'Dipakai'
  | 'Sudah di demo'
  | 'Rencana'
  | 'Lisensi belum jelas'
  | 'Tidak tersedia terbuka'
  | 'Tidak tercatat'
  | 'Perkiraan'
  | 'Perlu akun'
  | 'Ditautkan'

/** Catatan proses hanya dipercaya bila dataset memang ditandai hasil olahan. */
const prosesOlahan = (meta: DatasetMeta | null) => (meta?.jenis === 'olahan' ? meta.proses : undefined)

function susunAlur(meta: DatasetMeta | null, wilayah: IdWilayah): { judul: string; isi: string; status: StatusPil }[] {
  const p = prosesOlahan(meta)
  const olah: StatusPil = p ? 'Selesai' : meta?.jenis === 'demo' ? 'Rencana' : 'Tidak tercatat'
  const akhir: StatusPil = p ? 'Selesai' : meta?.jenis === 'demo' ? 'Sudah di demo' : 'Dipakai'
  const lintasan = p?.lintasan.map((l) => `${l.arah} path ${l.path} (${fmt(l.nCitra)} citra, ${fmt(l.nPasangan)} pasangan)`).join(' dan ')
  return [
    {
      judul: 'Citra radar Sentinel-1',
      isi: lintasan ? `Citra satelit radar gratis. Dipakai: ${lintasan}.` : 'Citra satelit radar gratis yang melintas tiap beberapa hari. Dicari lewat katalog ASF.',
      status: olah,
    },
    { judul: 'Interferogram', isi: 'Pasangan citra dibandingkan untuk melihat perubahan jarak ke permukaan tanah. Diolah di ASF HyP3 (pasangan small baseline).', status: olah },
    { judul: 'Deret waktu SBAS', isi: 'Banyak interferogram disusun menjadi laju dan riwayat per piksel dengan MintPy.', status: olah },
    {
      judul: 'Koreksi atmosfer dan titik referensi stabil',
      isi: p
        ? `Koreksi atmosfer: ${p.koreksiAtmosfer || 'tidak dicatat'}. Titik referensi: ${p.referensi || 'tidak dicatat'}.`
        : TEKS[wilayah].acuan,
      status: olah,
    },
    {
      judul: 'Gerak garis pandang menjadi vertikal',
      isi:
        p?.vertikal === 'satu-lintasan'
          ? 'Hanya satu lintasan yang dipakai, jadi berlaku asumsi gerak dominan vertikal.'
          : 'Dua lintasan satelit (naik dan turun) digabung menjadi gerak vertikal. Piksel yang hanya punya satu lintasan memakai asumsi gerak dominan vertikal.',
      status: olah,
    },
    {
      judul: 'Validasi',
      isi: TEKS[wilayah].validasi,
      status: p ? (p.validasi ? 'Selesai' : 'Rencana') : olah,
    },
    {
      judul: 'Grid piksel dan ringkasan kelurahan',
      isi: 'Laju per piksel sekitar 80 m untuk laporan titik, plus median dan sebaran per kelurahan untuk Dashboard. Piksel yang tidak terukur ditandai data tidak memadai.',
      status: akhir,
    },
    { judul: 'Kategori dan Proyeksi Tenor', isi: 'Laju dikelompokkan dengan ambang terbuka, lalu diproyeksikan selama tenor KPR.', status: akhir },
    { judul: 'Ekspor ke web', isi: 'File grid dan ringkasan kelurahan yang dibaca langsung oleh aplikasi ini.', status: akhir },
  ]
}

/** Teks yang berbeda per wilayah: acuan GNSS, validasi, batasan, dan catatan sumber. */
const TEKS: Record<IdWilayah, { acuan: string; validasi: string; gnss: string; batasan: string; cekSumber: string; gantiResmi: string; batas: string }> = {
  semarang: {
    acuan: 'Gangguan atmosfer dikurangi. Acuan dipilih di area stabil dekat stasiun GNSS CSEM.',
    validasi: 'Hasil dua lintasan satelit dibandingkan satu sama lain, diikat ke stasiun GNSS CSEM (Susilo dkk. 2023), dan dibandingkan dengan angka penelitian terdahulu.',
    gnss: 'Di Kota Semarang hanya ada satu stasiun GNSS terbuka, yaitu CSEM, dan letaknya di area stabil. Karena itu GNSS dipakai sebagai titik ikat. Area yang ambles diperiksa lewat kecocokan dua lintasan satelit yang saling independen dan lewat kisaran angka penelitian terdahulu.',
    batasan: 'Validasi di Semarang bagian bawah masih terbatas karena stasiun GNSS acuan (CSEM) berada di area stabil.',
    cekSumber:
      'Sumber konteks dicek pada 13 sampai 16 November 2026. Lapis pola ruang memakai peta Pola Ruang skala 1:25.000 dari Dinas Penataan Ruang Kota Semarang, yang terbuka lewat layanan WFS geoportal Pemkot, dikelompokkan per zona. RDTR Kota Semarang belum tersedia terbuka, dan layanan GISTARU ATR/BPN meminta token. Layanan peta geologi ESDM sedang pemeliharaan, jadi raster Peta Geologi Lembar Magelang dan Semarang diunduh tim dari GeoMap Pusat Survei Geologi (perlu akun) lalu didigitasi. Peta Geologi Kuarter Lembar Semarang 1:50.000 yang lebih rinci belum diolah.',
    gantiResmi: 'Bila tim memperoleh RDTR Kota Semarang atau peta geologi yang lebih rinci',
    batas: 'Batas wilayah © OpenStreetMap contributors (ODbL).',
  },
  jakarta: {
    acuan: 'Dataran Jakarta hampir datar, jadi koreksi atmosfer berbasis ketinggian tidak dipakai. Acuan dipilih di area stabil dekat stasiun GNSS CBTU.',
    validasi: 'Hasil dua lintasan satelit dibandingkan satu sama lain, diikat ke stasiun GNSS CBTU, lalu dibandingkan dengan stasiun CJKT dan CTGR (Susilo dkk. 2023) serta angka penelitian terdahulu.',
    gnss: 'Di Jakarta ada tiga stasiun GNSS terbuka. CBTU yang stabil dipakai sebagai titik ikat. CJKT dan CTGR tidak dipakai saat olah, sehingga menjadi pembanding independen. Ketiganya berada di area yang relatif stabil, jadi area ambles cepat di pesisir utara diperiksa lewat kecocokan dua lintasan satelit dan kisaran angka penelitian terdahulu.',
    batasan: 'Stasiun GNSS terbuka di Jakarta berada di area relatif stabil; pesisir utara yang ambles cepat divalidasi lewat dua lintasan satelit.',
    cekSumber:
      'Sumber konteks dicek pada 14 November 2026. Lapis zona RDTR memakai RDTR DKI Jakarta 2022 (Pergub 31/2022) dari layanan peta publik DPMPTSP DKI, dirapikan per zona. Raster Peta Geologi Lembar Jakarta dan Kepulauan Seribu diunduh tim dari GeoMap Pusat Survei Geologi (perlu akun) lalu didigitasi: warna tiap satuan diambil dari kotak legenda lembar itu sendiri.',
    gantiResmi: 'Bila tim memperoleh peta geologi teknik atau data bor yang lebih rinci',
    batas: 'Batas wilayah © OpenStreetMap contributors (ODbL).',
  },
  pekalongan: {
    acuan: 'Gangguan atmosfer dikurangi dengan korelasi ketinggian di perbukitan selatan. Acuan diambil di tanah tinggi Kajen yang dianggap stabil, lalu disamakan dengan median area tinggi.',
    validasi: 'Hasil dua lintasan satelit dibandingkan satu sama lain, lalu dibandingkan dengan stasiun GNSS CPKL di kota Pekalongan (Susilo dkk. 2023) yang tidak dipakai saat olah, serta angka penelitian terdahulu.',
    gnss: 'Pekalongan tidak punya stasiun GNSS terbuka di area stabil. Stasiun CPKL justru berada di kota yang ambles cepat. Karena itu acuan diambil dari tanah tinggi di selatan, dan CPKL dipakai sebagai pembanding independen di area yang ambles.',
    batasan: 'Acuan Pekalongan memakai tanah tinggi yang dianggap stabil, bukan stasiun GNSS. Bila tanah tinggi itu ikut bergerak, seluruh angka bergeser sebesar gerak itu.',
    cekSumber:
      'Sumber konteks dicek pada 15 dan 16 November 2026. Lapis zona RDTR memakai Peta Rencana Pola Ruang RDTR Kota Pekalongan 2024-2044 (skala 1:5.000) dari layanan WFS geoportal Pemkot. RTRW Kota Pekalongan belum tersedia terbuka, dan layanan publik RTRW Provinsi Jawa Tengah hanya memuat Kendal, Semarang, Demak, dan Jepara. Raster Peta Geologi Lembar Banjarnegara dan Pekalongan diunduh tim dari GeoMap Pusat Survei Geologi (perlu akun) lalu didigitasi. Seluruh Kota Pekalongan berada di satuan Aluvium.',
    gantiResmi: 'Bila tim memperoleh RTRW Kota Pekalongan atau data bor yang menunjukkan tebal endapan lunak',
    batas: 'Batas wilayah: BPS 2020 lewat OCHA HDX (CC BY-IGO).',
  },
  demak: {
    acuan: 'Gangguan atmosfer dikurangi dengan korelasi ketinggian di perbukitan. Acuan dipilih di area stabil dekat stasiun GNSS CSEM di Semarang.',
    validasi: 'Hasil dua lintasan satelit dibandingkan satu sama lain, diikat ke stasiun GNSS CSEM (Susilo dkk. 2023), dan dibandingkan dengan angka penelitian terdahulu.',
    gnss: 'Demak tidak punya stasiun GNSS terbuka sendiri. Titik ikat memakai CSEM di Semarang yang stabil dan masih masuk kotak olah. Pesisir Sayung yang ambles cepat diperiksa lewat kecocokan dua lintasan satelit dan kisaran angka penelitian terdahulu.',
    batasan: 'Demak tidak punya stasiun GNSS pembanding; validasi bergantung pada kecocokan dua lintasan satelit.',
    cekSumber:
      'Sumber konteks dicek pada 14 sampai 16 November 2026. Lapis pola ruang memakai RTRW Provinsi Jawa Tengah yang tersedia sebagai layanan publik. Lapis zona RDTR memakai RDTR Kawasan Mranggen dari geoportal Pemkab Demak bila layanannya bisa diakses (15 November 2026 sedang pemeliharaan); RDTR untuk pesisir Sayung belum ada di geoportal itu. Raster Peta Geologi Lembar Kudus dan Lembar Salatiga diunduh tim dari GeoMap Pusat Survei Geologi (perlu akun) lalu didigitasi. Jalur sempit di barat 110°30′ BT diisi dari tepi lembar Kudus.',
    gantiResmi: 'Bila tim memperoleh RTRW Kabupaten Demak atau data bor yang menunjukkan tebal endapan lunak',
    batas: 'Batas wilayah: BPS 2020 lewat OCHA HDX (CC BY-IGO).',
  },
}

/** Sumber konteks khusus tiap wilayah: rencana tata ruang dan peta geologi.
 *  Baris tata ruang: [sumber, kegunaan, lapis yang dibentuknya]. Lapis null = tidak tersedia terbuka. */
const SUMBER_KONTEKS: Record<IdWilayah, { tataRuang: [string, string, 'rdtr' | 'rtrw' | null][]; peta: string; kuarter?: string }> = {
  semarang: {
    tataRuang: [
      ['RTRW Kota Semarang, Distaru (geoportal Pemkot, 1:25.000)', 'Lapis pola ruang RTRW', 'rtrw'],
      ['RDTR Kota Semarang', 'Zona rinci per blok', null],
    ],
    peta: 'Peta Geologi Lembar Magelang dan Semarang 1:100.000 (PSG)',
    kuarter: 'Peta Geologi Kuarter Lembar Semarang 1:50.000 (PSG)',
  },
  jakarta: { tataRuang: [['RDTR DKI Jakarta 2022 (Pergub 31/2022), layanan DPMPTSP DKI', 'Lapis zona RDTR', 'rdtr']], peta: 'Peta Geologi Lembar Jakarta dan Kepulauan Seribu 1:100.000 (PSG)' },
  pekalongan: {
    tataRuang: [
      ['RDTR Kota Pekalongan 2024-2044 (geoportal Pemkot, 1:5.000)', 'Lapis zona RDTR', 'rdtr'],
      ['RTRW Kota Pekalongan', 'Pola ruang kota', null],
      ['RTRW Provinsi Jawa Tengah 2024-2044', 'Layanan publiknya tidak mencakup Kota Pekalongan', null],
    ],
    peta: 'Peta Geologi Lembar Banjarnegara dan Pekalongan 1:100.000 (PSG)',
  },
  demak: {
    tataRuang: [
      ['RTRW Provinsi Jawa Tengah 2024-2044', 'Lapis pola ruang RTRW (skala provinsi)', 'rtrw'],
      ['RDTR Kawasan Mranggen (geoportal Pemkab Demak)', 'Lapis zona RDTR, hanya Kawasan Mranggen', 'rdtr'],
    ],
    peta: 'Peta Geologi Lembar Kudus dan Lembar Salatiga 1:100.000 (PSG)',
  },
}

function susunSumber(meta: DatasetMeta | null, konteks: Partial<Record<JenisLapis, LapisKonteks>>, wilayah: IdWilayah): [string, string, StatusPil][] {
  const sk = SUMBER_KONTEKS[wilayah]
  const p = prosesOlahan(meta)
  const geologiResmi = konteks.geologi?.meta.jenis === 'resmi'
  return [
    ['Batas kelurahan (OpenStreetMap)', 'Nama lokasi, garis batas, dan ringkasan', 'Dipakai'],
    ['Peta dasar (OpenFreeMap, OpenMapTiles)', 'Tampilan peta', 'Dipakai'],
    ['Pencarian alamat (Nominatim)', 'Cari lokasi', 'Dipakai'],
    ['Sentinel-1 lewat ASF HyP3', 'Laju penurunan', p ? 'Dipakai' : 'Rencana'],
    ['GNSS CORS Pantura (Susilo dkk. 2023)', 'Titik ikat dan validasi', p?.validasi?.gnss?.length ? 'Dipakai' : 'Rencana'],
    ['DEM Copernicus GLO-30', geologiResmi ? 'Koreksi saat olah, dan cek batas satuan geologi' : 'Koreksi saat olah, dan perkiraan satuan geologi', p || konteks.geologi ? 'Dipakai' : 'Rencana'],
    // Baris berikut: hasil cek layanan publik pada 13 sampai 16 November 2026 (lihat catatan di bawah tabel).
    ...sk.tataRuang.map(([a, b, j]): [string, string, StatusPil] => [a, b, j ? (konteks[j] ? 'Dipakai' : 'Rencana') : 'Tidak tersedia terbuka']),
    [sk.peta, 'Lapis geologi, didigitasi tim', geologiResmi ? 'Dipakai' : 'Perlu akun'],
    ...(geologiResmi ? [] : [['Satuan geologi dari bentuk lahan', 'Lapis geologi sementara', konteks.geologi ? 'Perkiraan' : 'Tidak tersedia terbuka'] as [string, string, StatusPil]]),
    ...(sk.kuarter ? [[sk.kuarter, 'Rincian endapan muda', 'Perlu akun'] as [string, string, StatusPil]] : []),
    ['Peta bidang tanah BHUMI ATR/BPN', 'Batas persil dan NIB: laporan menautkan ke BHUMI, karena tidak ada layanan peta terbuka', 'Ditautkan'],
    [
      'Bahaya banjir, gelombang ekstrem, dan abrasi (InaRISK BNPB)',
      'Lapis konteks bahaya, dengan atribusi (lisensi pemakaian ulang tidak dicantumkan)',
      konteks.banjir || konteks.abrasi ? 'Dipakai' : 'Rencana',
    ],
  ]
}

/** Tabel statistik laju per kelas dari satu lapis konteks. */
function TabelKonteks({ lapis }: { lapis: LapisKonteks }) {
  const st = lapis.meta.statistik
  if (!st.length) return null
  return (
    <div className="overflow-x-auto">
      <table className="tnum w-full min-w-[520px] text-left text-[13px]">
        <thead className="text-ink-3">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">
              Kelas
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Luas (km²)
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Piksel terukur
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              Median laju (cm/th)
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Piksel ≥ 4 cm/th
            </th>
          </tr>
        </thead>
        <tbody>
          {st.map((s) => (
            <tr key={s.nama} className="border-t border-line">
              <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-3 shrink-0 rounded-[4px] ring-1 ring-black/10" style={{ background: s.warna }} />
                  {s.nama}
                </span>
              </th>
              <td className="py-2 pr-3 text-right">{fmt(s.luasKm2, 1)}</td>
              <td className="py-2 pr-3 text-right">{fmt(s.nPiksel)}</td>
              <td className="py-2 pr-3 text-right font-semibold text-ink">{s.median != null ? fmt(s.median, 1) : 'terlalu sedikit'}</td>
              <td className="py-2 text-right">{s.porsiTinggi != null ? `${fmt(s.porsiTinggi * 100)}%` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Kesimpulan singkat lapis geologi: Aluvium dibanding semua satuan batuan lain. */
function ringkasGeologi(lapis: LapisKonteks): string | null {
  const a = lapis.meta.statistik.find((s) => s.kode === KODE_ALUVIUM)
  const lain = lapis.meta.statistik.filter((s) => s.kode !== KODE_ALUVIUM && s.median != null)
  if (a?.median == null || !lain.length) return null
  const medLain = Math.max(...lain.map((s) => s.median!))
  const porsiLain = Math.max(...lain.map((s) => s.porsiTinggi ?? 0))
  const persen = (v: number) => `${fmt(v * 100)}%`
  return `Median laju di Aluvium ${fmt(Math.max(0, a.median), 1)} cm/tahun dan ${persen(a.porsiTinggi ?? 0)} pikselnya turun minimal 4 cm/tahun. Di ${lain.length === 1 ? 'satuan batuan lain' : `${lain.length} satuan batuan lainnya`}, median paling tinggi ${fmt(Math.max(0, medLain), 1)} cm/tahun dan piksel yang turun secepat itu paling banyak ${persen(porsiLain)}.`
}

/** Dua sub-zona terluas sebagai contoh, mis. "Perumahan Kepadatan Tinggi, SPU Skala Kelurahan". */
function contohSubzona(l: LapisKonteks): string {
  const beda = l.fitur.filter((f) => f.zona && f.zona !== f.nama)
  const luas = (f: (typeof beda)[number]) => (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])
  const zonaTerpakai = new Set<string>()
  const pilih: string[] = []
  for (const f of [...beda].sort((a, b) => luas(b) - luas(a))) {
    if (zonaTerpakai.has(f.zona!)) continue
    zonaTerpakai.add(f.zona!)
    pilih.push(f.nama)
    if (pilih.length === 2) break
  }
  return `mis. ${pilih.join(', ')}`
}

function BagianKonteks({ konteks, wilayah }: { konteks: Partial<Record<JenisLapis, LapisKonteks>>; wilayah: IdWilayah }) {
  const ada = JENIS_LAPIS.filter((j) => konteks[j])
  return (
    <>
      <p>
        Lapis tambahan membantu membaca angka laju: zona RDTR (paling rinci, dasar KKPR untuk izin bangunan), pola ruang RTRW, geologi permukaan, serta bahaya banjir dan bahaya gelombang ekstrem dan
        abrasi dari InaRISK BNPB. Tidak semua wilayah punya semuanya. Semuanya bisa
        ditampilkan di peta lewat pilihan Lapis konteks di legenda, dan kelas di titik terpilih muncul di laporan. Lapis konteks tidak mengubah kategori. Kategori tetap hanya dari laju yang terukur
        satelit.
      </p>
      <p>Tabel di bawah menghitung laju dari piksel yang sama dengan yang tampil di peta, dikelompokkan menurut kelas tiap lapis.</p>
      {!ada.length && <p className="text-ink-3">Lapis konteks belum termuat.</p>}
      {ada.map((j) => {
        const l = konteks[j]!
        const kesimpulan = j === 'geologi' ? ringkasGeologi(l) : null
        return (
          <div key={j} className="space-y-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[16px] font-bold text-ink">{LABEL_LAPIS[j]}</h3>
              <Pil teks={l.meta.jenis === 'perkiraan' ? 'Perkiraan' : 'Dipakai'} />
            </div>
            <p className="text-[13.5px] font-semibold text-ink">
              {l.meta.judul}
              {l.meta.skala ? `, ${l.meta.skala}` : ''}
            </p>
            {l.meta.catatan && <p className="text-[13.5px]">{l.meta.catatan}</p>}
            {l.meta.aturan && <p className="text-[13.5px]">Aturan: {l.meta.aturan}</p>}
            {kesimpulan && <p className="text-[13.5px] font-semibold text-ink">{kesimpulan}</p>}
            {j === 'geologi' && (
              <p className="text-[13.5px]">
                Di peta terlihat ambles cepat terpusat di dataran aluvial bagian utara dan timur, sedangkan dataran aluvial di barat relatif stabil. Artinya berada di endapan aluvial tidak otomatis berarti ambles
                cepat. Angka pengukuran di titik itu tetap yang utama.
              </p>
            )}
            {j === 'banjir' && (
              <p className="text-[13.5px]">
                Indeks bahaya BNPB tidak memperhitungkan penurunan tanah, dan kelas bahaya tidak selalu sejalan dengan laju penurunan. Tabel di bawah menunjukkan seberapa cepat tanah turun di tiap kelas. Di
                tempat yang kelas bahayanya tinggi dan tanahnya juga cepat turun, genangan cenderung makin sering dari tahun ke tahun.
              </p>
            )}
            {j === 'rtrw' && /provinsi/i.test(l.meta.skala) && (
              <p className="text-[13.5px]">
                Pada skala provinsi sebagian besar kota tercatat sebagai Kawasan Permukiman, jadi statistik per kelas hanya gambaran kasar. Kelas dengan laju tinggi, seperti kawasan transportasi di pelabuhan, bandara,
                dan sekitarnya, tetap memberi petunjuk di mana infrastruktur besar ikut terdampak.
              </p>
            )}
            {lapisTataRuang(j) && l.fitur.some((f) => f.zona && f.zona !== f.nama) && (
              <p className="text-[13.5px]">
                Warna peta dan tabel di bawah dikelompokkan per zona. Tiap blok tetap menyimpan sub-zona aslinya ({contohSubzona(l)}), dan sub-zona itulah yang tampil di laporan titik.
              </p>
            )}
            <TabelKonteks lapis={l} />
            {l.meta.sumber.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                {l.meta.sumber.map((s) => (
                  <li key={s.nama}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-2">
                        {s.nama}
                      </a>
                    ) : (
                      <span className="text-ink">{s.nama}</span>
                    )}
                    {s.catatan ? ` ${s.catatan}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <a href={urlWilayah(wilayah).konteks[j]} download className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink underline underline-offset-2">
              <DownloadSimple size={15} aria-hidden="true" />
              Unduh lapis ini (GeoJSON)
            </a>
          </div>
        )
      })}
      <div className="border-t border-line pt-4 text-[13.5px]">
        <h3 className="text-[16px] font-bold text-ink">Mengganti dengan data resmi</h3>
        <p className="mt-1">
          Lapis disimpan juga sebagai shapefile di folder <code className="font-mono text-[12.5px] text-ink">data-raw/konteks</code> pada repositori. {TEKS[wilayah].gantiResmi}, jalankan{' '}
          <code className="font-mono text-[12.5px] text-ink">pipeline/07_konteks.py --rtrw</code> atau <code className="font-mono text-[12.5px] text-ink">--geologi</code> dengan file itu. Statistik dan peta ikut
          diperbarui.
        </p>
      </div>
    </>
  )
}

const ARTI: Record<Kategori, string> = {
  rendah: 'Perubahan kecil. Tetap lakukan pemeriksaan standar sebelum akad.',
  sedang: 'Ada penurunan yang perlu ditanyakan ke pengembang: elevasi lantai dan jenis pondasi.',
  tinggi: 'Penurunan cepat. Perlu pemeriksaan lebih dalam dan rencana adaptasi.',
  'tidak-memadai': 'Satelit belum bisa mengukur di sini. Bukan berarti aman, bukan berarti berisiko.',
}

function Pil({ teks }: { teks: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[11.5px] font-semibold',
        teks === 'Dipakai' || teks === 'Sudah di demo' || teks === 'Selesai'
          ? 'border-transparent bg-ink text-surface'
          : teks === 'Lisensi belum jelas' || teks === 'Perkiraan'
            ? 'border-notice-line bg-notice-bg text-notice-ink'
            : 'border-line-2 text-ink-2',
      )}
    >
      {teks}
    </span>
  )
}

function Bagian({ id, judul, children }: { id: string; judul: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-28 p-5 md:p-7">
      <h2 className="text-[20px] font-bold tracking-tight text-ink">{judul}</h2>
      <div className="mt-3 max-w-[72ch] space-y-3 text-[14.5px] leading-relaxed text-ink-2">{children}</div>
    </Card>
  )
}

function Kalkulator() {
  const [laju, setLaju] = useState('5')
  const [sigma, setSigma] = useState('1')
  const [tenor, setTenor] = useState<Tenor>(15)
  const l = Number(laju.replace(',', '.'))
  const s = Number(sigma.replace(',', '.'))
  const sah = Number.isFinite(l) && Number.isFinite(s) && l >= 0 && s >= 0 && laju !== '' && sigma !== ''
  const p = sah ? hitungProyeksi(l, s, tenor) : null
  const kelasInput = 'h-11 w-full rounded-[12px] border border-line-2 bg-surface px-3 text-[14px] text-ink'
  return (
    <div className="rounded-[16px] bg-surface-2 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="kalk-laju" className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
            Laju penurunan (cm/tahun)
          </label>
          <input id="kalk-laju" inputMode="decimal" value={laju} onChange={(e) => setLaju(e.target.value)} className={kelasInput} />
        </div>
        <div>
          <label htmlFor="kalk-sigma" className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
            Ketidakpastian ± (cm/tahun)
          </label>
          <input id="kalk-sigma" inputMode="decimal" value={sigma} onChange={(e) => setSigma(e.target.value)} className={kelasInput} />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Tenor KPR</div>
          <Segmented label="Tenor KPR" penuh nilai={tenor} onUbah={setTenor} opsi={TENORS.map((t) => ({ nilai: t, label: `${t} th` }))} />
        </div>
      </div>
      {p ? (
        <div className="mt-4">
          <dl className="tnum grid grid-cols-3 gap-3 text-ink">
            {(
              [
                ['Batas bawah', p.bawah],
                ['Proyeksi tengah', p.tengah],
                ['Batas atas', p.atas],
              ] as const
            ).map(([nama, v]) => (
              <div key={nama}>
                <dt className="text-[12px] text-ink-3">{nama}</dt>
                <dd className="text-[22px] font-bold tracking-tight">
                  {fmt(v)} <span className="text-[12px] font-medium text-ink-3">cm</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[14.5px] font-semibold text-ink">{kalimatProyeksi(p)}</p>
        </div>
      ) : (
        <p className="mt-4 text-[13.5px] text-ink-2">Isi laju dan ketidakpastian dengan angka nol atau lebih.</p>
      )}
    </div>
  )
}

function GantiData() {
  const kawasan = useApp((s) => s.kawasan)
  const meta = useApp((s) => s.meta)
  const pakaiDataset = useApp((s) => s.pakaiDataset)
  const muatDemo = useApp((s) => s.muatDemo)
  const [hasil, setHasil] = useState<{ nama: string; h: HasilImpor } | null>(null)
  const [terpakai, setTerpakai] = useState(false)
  const [seret, setSeret] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const baca = async (f: File | undefined) => {
    if (!f) return
    setTerpakai(false)
    if (f.size > 20 * 1024 * 1024) return setHasil({ nama: f.name, h: { ok: false, galat: ['Ukuran file melebihi 20 MB.'] } })
    try {
      const teks = await f.text()
      setHasil({ nama: f.name, h: /\.csv$/i.test(f.name) ? imporCSV(teks, kawasan, meta, f.name) : imporGeoJSON(teks, f.name) })
    } catch {
      setHasil({ nama: f.name, h: { ok: false, galat: ['File tidak bisa dibaca.'] } })
    }
  }

  return (
    <>
      <p>
        Anda bisa memakai data per kelurahan sendiri. Unggah GeoJSON lengkap, atau CSV yang berisi laju per kelurahan. CSV digabung ke batas kelurahan yang sedang dimuat.
      </p>
      <p>Data unggahan tidak membawa grid piksel. Selama data unggahan dipakai, peta dan laporan beralih ke rata-rata kelurahan, bukan angka per titik.</p>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setSeret(true)
        }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSeret(false)
          void baca(e.dataTransfer.files[0])
        }}
        className={cx('rounded-[16px] border-2 border-dashed p-6 text-center transition-colors', seret ? 'border-ink bg-surface-2' : 'border-line-2')}
      >
        <UploadSimple size={26} className="mx-auto text-ink-3" aria-hidden="true" />
        <p className="mt-2 text-[14.5px] font-semibold text-ink">Seret file ke sini, atau pilih dari komputer</p>
        <p className="mt-1 text-[12.5px] text-ink-3">Format .geojson, .json, atau .csv. File diproses di peramban Anda dan tidak dikirim ke server.</p>
        <input
          ref={input}
          type="file"
          accept=".geojson,.json,.csv"
          className="sr-only"
          aria-label="Pilih file data"
          onChange={(e) => {
            void baca(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button varian="primary" className="mt-4" onClick={() => input.current?.click()} ikon={<UploadSimple size={17} />}>
          Pilih file
        </Button>
      </div>

      {hasil && !hasil.h.ok && (
        <div role="alert" className="rounded-[12px] border border-notice-line bg-notice-bg p-4 text-[13.5px] text-notice-ink">
          <p className="font-bold">{hasil.nama} tidak bisa dipakai</p>
          <ul className="mt-1 list-disc pl-5">
            {hasil.h.galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {hasil && hasil.h.ok && (
        <div className="rounded-[16px] bg-surface-2 p-4 text-[13.5px] text-ink">
          <p className="font-bold">{terpakai ? `${hasil.nama} sedang dipakai` : `Pratinjau ${hasil.nama}`}</p>
          <dl className="tnum mt-2 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-[12px] text-ink-3">Baris dibaca</dt>
              <dd className="text-[20px] font-bold">{fmt(hasil.h.ringkasan.total)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">Cocok dengan kelurahan</dt>
              <dd className="text-[20px] font-bold">{fmt(hasil.h.ringkasan.cocok)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">Data memadai</dt>
              <dd className="text-[20px] font-bold">{fmt(hasil.h.ringkasan.memadai)}</dd>
            </div>
          </dl>
          {hasil.h.ringkasan.takCocok.length > 0 && <p className="mt-2 text-ink-2">Tidak cocok: {hasil.h.ringkasan.takCocok.join(', ')}.</p>}
          {hasil.h.peringatan.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-ink-2">
              {hasil.h.peringatan.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {terpakai ? (
              <Button varian="accent" onClick={() => navigasi('peta')} ikon={<ArrowRight size={17} />}>
                Lihat di peta
              </Button>
            ) : (
              <>
                <Button
                  varian="primary"
                  onClick={() => {
                    if (hasil.h.ok) pakaiDataset(hasil.h.dataset)
                    setTerpakai(true)
                  }}
                >
                  Pakai data ini
                </Button>
                <Button varian="ghost" onClick={() => setHasil(null)}>
                  Batal
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button ukuran="sm" onClick={() => unduhBerkas('templat-pantau-ambles.csv', templatCSV(kawasan), 'text/csv;charset=utf-8')} ikon={<DownloadSimple size={16} />} disabled={!kawasan.length}>
          Unduh templat CSV
        </Button>
        <Button
          ukuran="sm"
          onClick={() => meta && unduhBerkas('pantau-ambles-kawasan.geojson', JSON.stringify(keDataset(kawasan, meta)), 'application/geo+json')}
          ikon={<DownloadSimple size={16} />}
          disabled={!kawasan.length || !meta}
        >
          Unduh data saat ini (GeoJSON)
        </Button>
        {meta && meta.jenis === 'unggahan' && (
          <Button
            ukuran="sm"
            varian="ghost"
            onClick={() => {
              setHasil(null)
              void muatDemo()
            }}
            ikon={<ArrowCounterClockwise size={16} />}
          >
            Kembali ke data bawaan
          </Button>
        )}
      </div>
      <p className="text-[13px]">
        Kolom CSV: <code className="font-mono text-[12.5px] text-ink">id</code> atau <code className="font-mono text-[12.5px] text-ink">nama</code> (tambah{' '}
        <code className="font-mono text-[12.5px] text-ink">kecamatan</code> bila nama kelurahan kembar), <code className="font-mono text-[12.5px] text-ink">laju</code> dalam cm/tahun dengan nilai positif berarti turun,{' '}
        <code className="font-mono text-[12.5px] text-ink">sigma</code> untuk ketidakpastian. Opsional: <code className="font-mono text-[12.5px] text-ink">n_piksel</code>,{' '}
        <code className="font-mono text-[12.5px] text-ink">koherensi</code>, <code className="font-mono text-[12.5px] text-ink">memadai</code>.
      </p>
    </>
  )
}

export default function MethodView() {
  const status = useApp((s) => s.status)
  const meta = useApp((s) => s.meta)
  const kawasan = useApp((s) => s.kawasan)
  const grid = useApp((s) => s.grid)
  const t = useApp((s) => s.thresholds)
  const konteks = useApp((s) => s.konteks)
  const rute = useRute()
  const memadai = kawasan.filter((k) => k.memadai).length
  const titik = !!grid
  const lebarBlok = lebarBlokM(grid)
  const wilayah = useApp((s) => s.wilayah)
  const alur = susunAlur(meta, wilayah)
  const sumber = susunSumber(meta, konteks, wilayah)
  // tautan dari legenda peta: #/metode?bagian=konteks
  const bagian = rute.params.get('bagian')
  useEffect(() => {
    if (bagian) document.getElementById(bagian)?.scrollIntoView({ block: 'start' })
  }, [bagian])
  const proses = prosesOlahan(meta)
  const validasi = proses?.validasi
  const belumJalan = alur.filter((a) => a.status === 'Rencana').length
  const aturan: Record<Kategori, string> = {
    rendah: `Di bawah ${fmt(t.sedang, 1)} cm/tahun`,
    sedang: `${fmt(t.sedang, 1)} sampai di bawah ${fmt(t.tinggi, 1)} cm/tahun`,
    tinggi: `Mulai ${fmt(t.tinggi, 1)} cm/tahun`,
    'tidak-memadai': 'Koherensi rendah atau piksel terlalu sedikit',
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-2 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight text-ink md:text-[34px]">Data & metode</h1>
      <p className="mt-1 max-w-[65ch] text-[15px] text-ink-2">Dari mana angkanya, cara membacanya, dan apa batasannya, untuk {wilayahById(wilayah)?.nama}.</p>
      <nav aria-label="Bagian halaman" className="hp-tanpa-gulir -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {BAGIAN.map(([id, label]) => (
          <Chip key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {label}
          </Chip>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        <Bagian id="status" judul="Status data saat ini">
          {status === 'memuat' && <Skeleton className="h-24 w-full" />}
          {meta && (
            <>
              {meta.jenis === 'demo' && (
                <Notice nada="demo">
                  <strong>Data demo ilustratif.</strong> {meta.catatan}
                </Notice>
              )}
              {meta.jenis === 'unggahan' && <Notice>Anda sedang memakai data unggahan. Data ini hanya ada di peramban Anda dan hilang saat halaman dimuat ulang.</Notice>}
              {meta.jenis === 'olahan' && <Notice>Data ini hasil olah citra satelit. Angka validasinya ada di bagian Validasi di bawah.</Notice>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[14px]">
                <dt className="text-ink-3">Judul</dt>
                <dd className="text-ink">{meta.judul}</dd>
                <dt className="text-ink-3">Wilayah</dt>
                <dd className="text-ink">{meta.wilayah}</dd>
                {meta.periode[0] && meta.periode[1] && (
                  <>
                    <dt className="text-ink-3">Periode</dt>
                    <dd className="text-ink">
                      {fmtPeriode(meta.periode[0])} sampai {fmtPeriode(meta.periode[1])}
                    </dd>
                  </>
                )}
                {meta.dibuat && (
                  <>
                    <dt className="text-ink-3">Dibuat</dt>
                    <dd className="text-ink">{fmtTanggal(meta.dibuat)}</dd>
                  </>
                )}
                <dt className="text-ink-3">Unit laporan</dt>
                <dd className="tnum text-ink">
                  {grid
                    ? `Titik: blok sekitar ${lebarBlok} m dari grid piksel ${fmt(grid.kepala.ukuranSelM)} m (${fmt(grid.kepala.nValid)} piksel terukur)`
                    : 'Kelurahan (data ini tidak membawa grid piksel)'}
                </dd>
                <dt className="text-ink-3">Kawasan</dt>
                <dd className="tnum text-ink">
                  {fmt(kawasan.length)} kelurahan, {fmt(memadai)} dengan data memadai, {fmt(kawasan.length - memadai)} tidak memadai
                </dd>
              </dl>
              <p>{meta.metode}</p>
              {meta.sumber.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-[13.5px]">
                  {meta.sumber.map((s) => (
                    <li key={s.nama}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-2">
                          {s.nama}
                        </a>
                      ) : (
                        <span className="text-ink">{s.nama}</span>
                      )}
                      {s.catatan ? ` ${s.catatan}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Bagian>

        <Bagian id="kategori" judul="Cara membaca kategori">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13.5px]">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Kategori
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Aturan
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Artinya bagi calon pembeli
                  </th>
                </tr>
              </thead>
              <tbody>
                {URUTAN_KATEGORI.map((kat) => (
                  <tr key={kat} className="border-t border-line align-top">
                    <th scope="row" className="whitespace-nowrap py-2.5 pr-4 font-semibold text-ink">
                      <span className="inline-flex items-center gap-2">
                        <Swatch kategori={kat} />
                        {LABEL_KATEGORI[kat]}
                      </span>
                    </th>
                    <td className="tnum py-2.5 pr-4 text-ink">{aturan[kat]}</td>
                    <td className="py-2.5">{ARTI[kat]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Kategori hanya berasal dari laju penurunan. Pola ruang, geologi, dan bahaya banjir serta abrasi tampil sebagai lapis konteks terpisah. Lapis genangan rob khusus belum ada karena data terbukanya belum
            tersedia (lihat Sumber data). Karena itu tidak ada skor gabungan.
          </p>
          <p>Ambang kategori masih asumsi awal dan terbuka untuk diuji.</p>
          <Button ukuran="sm" onClick={() => navigasi('dashboard')} ikon={<ArrowRight size={16} />}>
            Coba ubah ambang di Dashboard
          </Button>
        </Bagian>

        <Bagian id="proyeksi" judul="Proyeksi Tenor">
          <p>Proyeksi Tenor memperkirakan total penurunan tanah selama masa cicilan KPR. Caranya sederhana: tren laju saat ini diperpanjang selama tenor, lalu ditampilkan sebagai rentang.</p>
          <ul className="space-y-1 rounded-[12px] bg-surface-2 p-4 font-mono text-[13px] text-ink">
            <li>Proyeksi tengah = laju × tenor</li>
            <li>Batas bawah = max(0, (laju - ketidakpastian) × tenor)</li>
            <li>Batas atas = (laju + ketidakpastian) × tenor</li>
          </ul>
          <Kalkulator />
          <p>Selalu dibaca sebagai rentang. Tren masa lalu bisa berubah.</p>
        </Bagian>

        <Bagian id="alur" judul="Alur olah data">
          {meta?.jenis === 'demo' && <Notice>{belumJalan} langkah pertama belum dijalankan. Peta saat ini memakai data demo ilustratif.</Notice>}
          {meta?.jenis === 'unggahan' && <Notice>Data unggahan tidak membawa catatan cara olahnya. Urutan di bawah adalah alur baku SubTen.</Notice>}
          {meta?.jenis === 'olahan' && !proses && <Notice>Data ini ditandai hasil olahan, tetapi tidak membawa catatan proses.</Notice>}
          <ol className="space-y-3">
            {alur.map((a, i) => (
              <li key={a.judul} className="flex gap-3">
                <span className="tnum grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12.5px] font-bold text-ink">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-ink">{a.judul}</span>
                    <Pil teks={a.status} />
                  </div>
                  <p className="text-[13.5px]">{a.isi}</p>
                </div>
              </li>
            ))}
          </ol>
        </Bagian>

        <Bagian id="sumber" judul="Sumber data">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[13.5px]">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Data
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Dipakai untuk
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sumber.map(([data, guna, st]) => (
                  <tr key={data} className="border-t border-line">
                    <th scope="row" className="py-2.5 pr-4 font-semibold text-ink">
                      {data}
                    </th>
                    <td className="py-2.5 pr-4">{guna}</td>
                    <td className="py-2.5">
                      <Pil teks={st} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px]">
            {TEKS[wilayah].cekSumber} Lapis bahaya banjir dan bahaya gelombang ekstrem dan abrasi diambil dari layanan InaRISK BNPB yang terbuka untuk publik, pada grid aslinya (100 m). BNPB tidak
            mencantumkan lisensi pemakaian ulang, jadi lapis ini ditampilkan dengan atribusi sebagai konteks. InaRISK tidak punya lapis genangan rob khusus.
          </p>
          <p className="text-[13px]">
            Elevasi tidak ditampilkan sebagai konteks. Galat DEM global beberapa meter, terlalu kasar untuk menilai rob di pesisir yang tingginya hanya satu sampai tiga meter di atas laut.
          </p>
          <p className="text-[13px]">{TEKS[wilayah].batas} Peta dasar OpenFreeMap © OpenMapTiles, data OpenStreetMap.</p>
        </Bagian>

        <Bagian id="konteks" judul="Lapis konteks: tata ruang dan geologi">
          <BagianKonteks konteks={konteks} wilayah={wilayah} />
        </Bagian>

        <Bagian id="validasi" judul="Validasi">
          {validasi ? (
            <>
              <Notice>{validasi.lulus ? 'Data ini lolos gerbang mutu yang ditetapkan.' : 'Data ini belum lolos gerbang mutu. Baca angka di bawah sebelum memakainya.'}</Notice>
              <dl className="tnum grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[14px]">
                {validasi.antarLintasan && (
                  <>
                    <dt className="text-ink-3">Dua lintasan satelit</dt>
                    <dd className="text-ink">
                      selisih RMSE {fmt(validasi.antarLintasan.rmse, 2)} cm/tahun, bias {fmt(validasi.antarLintasan.bias, 2)} cm/tahun, korelasi {fmt(validasi.antarLintasan.r, 3)}, dari{' '}
                      {fmt(validasi.antarLintasan.n)} piksel
                    </dd>
                  </>
                )}
                {validasi.gnss?.map((g) => (
                  <div key={g.stasiun} className="contents">
                    <dt className="text-ink-3">
                      Stasiun GNSS {g.stasiun}
                      {g.peran ? ` (${g.peran})` : ''}
                    </dt>
                    <dd className="text-ink">
                      {g.insar == null
                        ? `GNSS ${fmt(g.gnss, 2)} cm/tahun; InSAR tidak terukur di stasiun ini (di luar cakupan citra atau koherensi rendah)`
                        : g.periodeSama
                          ? `Periode sama (${Math.floor(g.periodeSama.awal)} sampai ${Math.ceil(g.periodeSama.akhir) - 1}): GNSS ${fmt(g.periodeSama.gnss, 2)}, InSAR ${fmt(g.periodeSama.insar, 2)} cm/tahun, selisih ${fmt(Math.abs(g.periodeSama.gnss - g.periodeSama.insar), 2)}. Seluruh catatan: GNSS ${fmt(g.gnss, 2)}, InSAR ${fmt(g.insar, 2)} cm/tahun.`
                          : `GNSS ${fmt(g.gnss, 2)} cm/tahun, InSAR ${fmt(g.insar, 2)} cm/tahun, selisih ${fmt(Math.abs(g.gnss - g.insar), 2)} cm/tahun`}
                    </dd>
                  </div>
                ))}
              </dl>
              {validasi.catatan && <p>{validasi.catatan}</p>}
            </>
          ) : (
            <p>
              Belum ada angka validasi, karena {meta?.jenis === 'demo' ? 'peta masih memakai data demo' : 'data ini tidak membawa catatan validasi'}. Setelah citra satelit diolah, bagian ini memuat selisih antara dua lintasan
              satelit dan perbandingan dengan stasiun GNSS.
            </p>
          )}
          <p>{TEKS[wilayah].gnss}</p>
        </Bagian>

        <Bagian id="batasan" judul="Batasan">
          <ul className="list-disc space-y-1.5 pl-5">
            {batasan(titik, lebarBlok).map((b) => (
              <li key={b}>{b}</li>
            ))}
            <li>Piksel yang hanya terukur dari satu lintasan satelit memakai asumsi gerak dominan vertikal.</li>
            <li>{TEKS[wilayah].batasan}</li>
            <li>Piksel atau kawasan yang tidak terukur ditandai data tidak memadai, bukan dianggap aman.</li>
          </ul>
          <p className="font-semibold text-ink">{PRINSIP}</p>
        </Bagian>

        <Bagian id="ganti-data" judul="Ganti data">
          <GantiData />
        </Bagian>
      </div>
    </div>
  )
}
