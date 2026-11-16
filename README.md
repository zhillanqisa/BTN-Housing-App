# SubTen

**Subsidence × Tenor.** Nama sebelumnya: PANTAU AMBLES.

**Cek Tanah Sebelum KPR.** Web app untuk melihat laju penurunan tanah di sekitar sebuah titik di kota pesisir utara Jawa yang ambles (Semarang, Jakarta, Pekalongan, Demak) dan proyeksinya selama masa cicilan KPR (Proyeksi Tenor). Dibuat untuk BTN Housingpreneur Batch 3, kategori Housing Innovation.

Laporan mengikuti titik yang dipilih: angkanya dihitung dari blok piksel sekitar 240 m di sekitar titik itu, bukan rata-rata satu kelurahan. Dua titik dalam kelurahan yang sama bisa memberi hasil berbeda. Saat titik dipilih, batas kelurahannya disorot di peta.

Lapis konteks bisa ditumpangkan di peta dan muncul di laporan: zona RDTR (rencana zona per blok, dasar KKPR), pola ruang RTRW, geologi permukaan, serta bahaya banjir dan bahaya gelombang ekstrem dan abrasi dari InaRISK BNPB, masing-masing dengan laju median per kelas sebagai bahan analisis.

**Demo:** https://zhillanqisa.github.io/BTN-Housing-App/

> **Status data:** peta memakai **hasil olah InSAR Sentinel-1** Januari 2020 sampai November 2026 (dua arah lintasan satelit, piksel 80 m). Angka ini bahan pertimbangan, bukan satu-satunya dasar keputusan. Rincian di [pipeline/README.md](pipeline/README.md).

## Wilayah

Pilih wilayah di bilah atas atau di kartu awal. Tautan menyimpan wilayahnya (`#/?w=jakarta`). Klik titik di wilayah lain langsung memindah wilayah.

| Wilayah | Data | Piksel terukur | Antarlintasan (RMSE) | Pembanding GNSS | Geologi | Tata ruang |
|---|---|---|---|---|---|---|
| Kota Semarang | 1.433 interferogram | 82% | 0,34 cm/tahun | CSEM (titik ikat) | Lembar Magelang dan Semarang | RTRW Kota Semarang 1:25.000 (Distaru); RDTR belum terbuka |
| DKI Jakarta | 1.056 interferogram | 95% | 0,45 cm/tahun | CBTU (titik ikat); periode sama 2020-2021: CJKT selisih 0,36, CTGR selisih 0,87 cm/tahun | Lembar Jakarta dan Kepulauan Seribu | RDTR DKI 2022 |
| Kota Pekalongan | 1.086 interferogram | 84% | 0,71 cm/tahun | CPKL (pembanding); periode sama 2020-2021: GNSS 10,00, InSAR 10,01 cm/tahun | Lembar Banjarnegara dan Pekalongan | RDTR Kota Pekalongan 2024-2044 (1:5.000) |
| Kabupaten Demak | sedang diolah | | | CSEM (titik ikat) | Lembar Kudus dan Salatiga | RTRW Prov. Jateng 2024-2044; RDTR Mranggen bila geoportal Pemkab bisa diakses |

Dashboard punya kartu **Perbandingan wilayah pesisir** (luas yang turun minimal 4 cm/tahun, kelurahan berkategori tinggi, kelurahan tercepat, gerbang mutu), dibaca dari `public/data/ringkasan-wilayah.json` yang ditulis `node scripts/ringkasan-wilayah.mjs`.

Temuan utama: Semarang 60 km² turun minimal 4 cm/tahun (tercepat Kelurahan Penggaron Lor 11,6 cm/tahun). Jakarta jauh lebih pelan dibanding angka 1982-2010: hanya 1,2 km² turun minimal 4 cm/tahun, terpusat di pesisir Muara Angke (sekitar 5 cm/tahun) dan Muara Baru (3 sampai 5 cm/tahun); rata-rata semua kelurahan di bawah 2 cm/tahun.

## Menjalankan

Butuh Node 20.19 atau lebih baru.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tes unit
npm run build      # typecheck + build ke dist/
npm run preview    # menyajikan dist/
npm run deploy     # build lalu terbitkan dist/ ke cabang gh-pages (GitHub Pages)
```

Hasil `dist/` berupa file statis dan bisa di-host gratis (GitHub Pages, Netlify, Vercel). Untuk GitHub Pages: di repo buka Settings, Pages, pilih Source "Deploy from a branch", lalu Branch `gh-pages` dan folder `/ (root)`. Setelah itu cukup jalankan `npm run deploy` tiap kali ingin memperbarui situs. Aplikasi butuh internet untuk peta dasar dan pencarian alamat. Tanpa internet, data kawasan tetap tampil di atas latar polos.

## Alur demo yang disarankan

1. Di halaman **Cek lokasi**, pilih wilayah di bilah atas, lalu klik kartu contoh (mis. "Tanah Mas" di Semarang, "Muara Angke" di Jakarta) atau cari alamat, atau klik titik mana pun di peta. Kotak hijau di peta menandai blok piksel yang dipakai untuk laporan, dan garis bercahaya menandai batas kelurahannya.
   Di legenda, pilih **Lapis konteks** RDTR, RTRW, Geologi, Banjir, atau Abrasi untuk menumpangkan zona tata ruang, satuan geologi, atau kelas bahaya. Bagian **Konteks lokasi** di laporan menyebut sub-zona (mis. Perumahan Kepadatan Tinggi), zonanya, satuan geologi, dan tingkat bahaya banjir atau abrasi di titik itu.
2. Baca **Laporan Ambles**: status di titik itu, grafik riwayat, lalu Proyeksi Tenor. Coba klik titik lain di kelurahan yang sama dan bandingkan angkanya.
3. Ganti tenor 10, 15, 20 tahun dan lihat rumah pada gambar ikut turun.
4. Tekan **Unduh PDF** untuk laporan satu halaman.
5. Tekan **Bandingkan**, pilih lokasi lain, lalu buka halaman **Bandingkan**.
6. Buka **Dashboard** untuk tampilan institusi: perbandingan antarwilayah, lalu filter, grafik, tabel, uji sensitivitas ambang, dan unduh CSV per kelurahan.
7. Buka **Data & metode** untuk sumber data, batasan, dan fitur **Ganti data**.

Tautan bisa dibagikan: `#/?w=<wilayah>&ll=<lintang>,<bujur>&t=<tenor>`. Tautan lama `#/?k=<id kelurahan>` tetap terbuka dan diarahkan ke pusat kelurahan itu.

## Struktur proyek

```
src/
  App.tsx              shell, sinkron tautan dan pilihan lokasi
  components/          peta (MapLibre), pencarian, Laporan Ambles, grafik, legenda
  views/               Dashboard, Bandingkan, Data & metode
  lib/
    types.ts config.ts tipe data dan semua ambang/asumsi
    risk.ts            kategori, Proyeksi Tenor, kalimat laporan
    grid.ts            grid piksel: baca file, nilai piksel, statistik blok di sekitar titik
    lokasi.ts          bacaan satu lokasi (blok piksel, atau kelurahan bila data tanpa grid)
    konteks.ts         lapis konteks (zona RDTR, pola ruang RTRW, geologi): muat, validasi, kelas di satu titik
    data.ts            muat dan validasi ringkasan per kelurahan
    importer.ts        impor CSV / GeoJSON
    pdf.ts             PDF Laporan Ambles (jsPDF, vektor)
    geocode.ts         pencarian lokal + Nominatim
    wilayah.ts         daftar wilayah (kotak batas, lokasi contoh) dan alamat file data tiap wilayah
    store.ts router.ts state aplikasi dan router hash
  ui/primitives.tsx    komponen dasar
  styles/app.css       token desain (terang dan gelap)
scripts/
  fetch-boundaries.mjs batas kelurahan dari OpenStreetMap (npm run data:boundaries)
  ambil-batas-wilayah.mjs, siapkan-kawasan.mjs  batas wilayah baru dan kerangka ringkasan kelurahan
  ringkasan-wilayah.mjs  ringkasan lintas wilayah untuk Dashboard
  build-demo-data.mjs  data demo ilustratif untuk uji antarmuka (npm run data:demo, menolak menimpa hasil olah asli tanpa --paksa)
pipeline/              olah InSAR dari citra Sentinel-1 sampai file di public/data, dan lapis konteks (Python, lihat pipeline/README.md)
data-raw/              batas kelurahan, kecamatan, kota (hasil skrip)
data-raw/konteks/      shapefile zona RDTR, pola ruang RTRW, dan geologi permukaan, bisa disunting di QGIS
public/data/           <wilayah>-grid.*, <wilayah>-kawasan.geojson, <wilayah>-konteks-*.geojson, ringkasan-wilayah.json
```

## Skema data

Aplikasi membaca file per wilayah di `public/data/`, dengan awalan id wilayah (`semarang`, `jakarta`, `pekalongan`, `demak`). Contoh di bawah memakai Semarang.

### Grid piksel (peta dan laporan titik)

- `semarang-grid.json`: kepala grid.
- `semarang-grid-laju.bin` dan `semarang-grid-sigma.bin`: Int16 little-endian, satu nilai per piksel, baris pertama paling utara.
- `semarang-grid-deret.bin`: Int16, deret waktu hanya untuk piksel terukur, urut baris demi baris. Dimuat setelah peta tampil.

```json
{
  "versi": 1, "jenis": "olahan", "dibuat": "2026-11-14",
  "bbox": [110.26, -7.12, 110.51, -6.92],
  "nx": 336, "ny": 260, "ukuranSelM": 80,
  "nodata": -32768, "luar": -32767,
  "skalaLaju": 0.01, "skalaDeret": 0.1,
  "epoch": [2020.125, 2020.375],
  "berkas": { "laju": "semarang-grid-laju.bin", "sigma": "semarang-grid-sigma.bin", "deret": "semarang-grid-deret.bin" }
}
```

- `bbox`: `[barat, selatan, timur, utara]` tepi luar grid, derajat WGS84.
- Nilai laju dan sigma × `skalaLaju` = cm/tahun, **positif berarti turun**. Nilai deret × `skalaDeret` = cm, negatif berarti turun.
- `nodata`: piksel di dalam kota yang tidak terukur. `luar`: piksel di luar batas kota.
- `epoch`: tahun desimal titik tengah tiap triwulan. Deret dihitung relatif ke epoch pertama.
- Laporan titik memakai blok 3 × 3 piksel di sekitar titik: laju = median piksel terukur, dan dianggap memadai bila minimal 4 piksel terukur.

Bila file grid tidak ada, aplikasi tetap jalan dan memakai rata-rata kelurahan.

### Ringkasan per kelurahan (Dashboard dan nama lokasi)

Satu file GeoJSON `FeatureCollection` dengan anggota `metadata`. Satu fitur = satu kelurahan.

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "jenis": "olahan",
    "judul": "Laju penurunan tanah per kelurahan",
    "wilayah": "Kota Semarang",
    "periode": ["2020-01", "2025-10"],
    "metode": "Sentinel-1, ASF HyP3, MintPy SBAS, validasi GNSS",
    "sumber": [{ "nama": "Sentinel-1 (ESA)", "url": "https://search.asf.alaska.edu" }],
    "dibuat": "2026-12-01",
    "catatan": ""
  },
  "features": [{
    "type": "Feature",
    "properties": {
      "id": "osm-1", "nama": "Contoh", "kecamatan": "Contoh",
      "laju": 5.2, "sigma": 1.1, "nPiksel": 240, "koherensi": 0.66,
      "memadai": true, "deret": [[2020.0, 0], [2020.25, -1.3]], "jarakPantaiKm": 1.4
    },
    "geometry": { "type": "Polygon", "coordinates": [] }
  }]
}
```

- `laju`: cm/tahun, **positif berarti turun**. `sigma`: ketidakpastian, plus minus cm/tahun.
- `sebaran` (opsional): persentil 10 dan 90 laju piksel di kelurahan itu.
- `memadai: false` berarti "data tidak memadai" (koherensi rendah atau piksel terlalu sedikit). `laju` diisi `null`.
- `deret`: pasangan tahun desimal dan perpindahan kumulatif dalam cm (negatif berarti turun).
- `metadata.jenis`: `demo`, `olahan`, atau `unggahan`. Selama `demo`, aplikasi dan PDF menampilkan penanda data demo.

### Lapis konteks (peta dan laporan)

`<wilayah>-konteks-rdtr.geojson`, `<wilayah>-konteks-rtrw.geojson`, dan `<wilayah>-konteks-geologi.geojson`, ditulis oleh `pipeline/07_konteks.py`, serta `<wilayah>-konteks-banjir.geojson` dan `<wilayah>-konteks-abrasi.geojson`, ditulis oleh `pipeline/07c_bahaya.py`. Satu fitur = satu kelas (sub-zona untuk RDTR dan RTRW Kota, satuan untuk geologi, kelas rendah, sedang, atau tinggi untuk bahaya).

- Properti fitur: `kode`, `nama`, `warna` (hex). RDTR dan RTRW menambah `zona` (kelompok zona, mis. Perumahan untuk sub-zona Perumahan Kepadatan Tinggi) dan `fungsi` (Lindung atau Budi daya). Geologi menambah `batuan` dan `sifat`. Statistik RDTR dan RTRW dihitung per zona.
- `metadata`: `judul`, `jenis` (`resmi` atau `perkiraan`), `skala`, `sumber`, `catatan`, `aturan` (cara digitasi atau perkiraan), dan `statistik`: per kelas `kode`, `nama`, `luasKm2`, `nPiksel`, `cakupan`, `median`, `p75`, `porsiTinggi` (bagian piksel yang turun minimal 4 cm/tahun).
- Lapis konteks tidak mengubah kategori. Bila file tidak ada, aplikasi tetap jalan tanpa pilihan lapis itu.

| Lapis | Sumber saat ini | Catatan |
|---|---|---|
| Zona RDTR (Pekalongan) | Peta Rencana Pola Ruang RDTR Kota Pekalongan 2024-2044, WFS geoportal Pemkot (`palapa:POLARUANG_AR_5K`) | Skala 1:5.000, 33 sub-zona dikelompokkan ke 18 zona. Badan Jalan tidak ditampilkan. Nomor Perwal belum tercantum di metadata |
| Zona RDTR (Demak) | RDTR Kawasan Mranggen, WFS geoportal Pemkab Demak | Hanya Mranggen. GeoServer Pemkab sedang 503 pada 15 November 2026; `07_konteks.py` melewatinya bila layanan menolak. RDTR pesisir Sayung belum ada di geoportal itu |
| Pola ruang RTRW (Semarang) | Pola Ruang skala 1:25.000, Dinas Penataan Ruang Kota Semarang, WFS geoportal Pemkot (`palapa:POLARUANG_AR_25K`) | 39 sub-zona dikelompokkan ke 17 zona. RDTR Kota Semarang belum tersedia terbuka (dicek 15 November 2026) |
| Pola ruang RTRW (Demak) | RTRW Provinsi Jawa Tengah 2024-2044 (Perda Nomor 8 Tahun 2024), dari layanan ArcGIS publik | Skala provinsi 1:250.000 |
| Pola ruang RTRW (Pekalongan, Jakarta) | Belum ada | Pekalongan: layanan provinsi hanya memuat Kendal, Semarang, Demak, dan Jepara. Jakarta memakai RDTR |
| Persil (bidang tanah) | BHUMI ATR/BPN (bhumi.atrbpn.go.id/peta), ditautkan dari laporan bersama koordinat titik | BHUMI tidak menyediakan layanan peta terbuka untuk aplikasi lain dan dilindungi firewall serta reCAPTCHA, jadi batas persil tidak ditampilkan langsung (dicek 15 November 2026) |
| Zona RDTR (Jakarta) | RDTR DKI Jakarta 2022 (Pergub Nomor 31 Tahun 2022), layanan peta publik DPMPTSP DKI | Rinci sampai blok. Badan Jalan tidak ditampilkan; celah jalan antarblok ditutup supaya peta ringan |
| Geologi (Semarang) | Peta Geologi Lembar Magelang dan Semarang 1:100.000 (Thanden dkk. 1996), didigitasi dengan `pipeline/07a_digitasi_geologi.py` | 7 satuan. Batas Aluvium cocok 87% dengan kaki bukit pada DEM tanpa digeser |
| Bahaya banjir, gelombang ekstrem, dan abrasi (semua wilayah) | InaRISK BNPB, ArcGIS ImageServer `INDEKS_BAHAYA_BANJIR` dan `layer_bahaya_gelombang_ekstrim_dan_abrasi` di gis.bnpb.go.id, diambil dengan `pipeline/07c_bahaya.py` | Grid asli 100 m tanpa resampling, dibagi ke kelas BNPB (rendah sampai 0,333, sedang sampai 0,666, tinggi). Lisensi pemakaian ulang tidak dicantumkan; ditampilkan dengan atribusi. Demak menyusul setelah grid lajunya jadi |
| Geologi (Jakarta, Pekalongan, Demak) | Lembar Jakarta dan Kepulauan Seribu (Turkandi dkk. 1992), Banjarnegara dan Pekalongan (Condon dkk. 1996), Kudus (Suwarti dan Wikarno 1992), dan Salatiga (Sukardi dan Budhitrisna 1992); didigitasi dengan `pipeline/07b_geologi_lembar.py` | Warna satuan diambil dari kotak legenda lembar itu sendiri. Ketelitian batas sekitar 100 sampai 200 m |

Hasil analisis: median laju di Aluvium 3,6 cm/tahun dan 48% pikselnya turun minimal 4 cm/tahun. Di keenam satuan batuan lain (Formasi Damar, Kaligetas, Kerek, Kalibeng, Jongkong, dan batuan gunungapi Gajahmungkur) median sekitar 0 dan tidak ada piksel yang turun secepat itu. Di dalam Aluvium pun ambles cepat terpusat di bagian utara dan timur; Aluvium di barat relatif stabil.

Untuk mengganti dengan data resmi: `python pipeline/07_konteks.py --rtrw rtrw_kota.shp` (kolom `NAMOBJ`, `KODKWS`) atau `--geologi geologi.shp` (kolom `KODE`, `NAMA`, `BATUAN`, `SIFAT`, `WARNA`).

## Memperbarui data

1. **Olah ulang dari citra satelit:** jalankan pipeline di folder `pipeline/` (enam skrip, urutannya di [pipeline/README.md](pipeline/README.md)). Langkah terakhir menulis file grid dan ringkasan kelurahan ke `public/data/`. Butuh akun NASA Earthdata gratis dan sekitar 25 GB unduhan sementara.
2. **Lewat aplikasi:** halaman Data & metode, bagian Unggah data. Unggah GeoJSON lengkap, atau CSV (`id;nama;kecamatan;laju;sigma;n_piksel;koherensi`) yang digabung ke batas kelurahan. Templat CSV bisa diunduh di sana. Data unggahan hanya hidup di peramban dan tidak membawa grid, jadi selama dipakai, peta dan laporan beralih ke rata-rata kelurahan.
3. **Data demo untuk uji antarmuka:** `npm run data:demo -- --paksa` menimpa `public/data/` dengan data ilustratif. Jangan di-commit ke cabang yang diterbitkan.

## Rencana realisasi

Acuan: spreadsheet tim "Sumber & Alur Olah Data" dan draf ide. Hal di luar keduanya ditandai sebagai asumsi atau usulan.

**Tujuan.** Menerjemahkan data penurunan tanah menjadi satu laporan per lokasi yang dipahami orang awam, lengkap dengan langkah berikutnya.

**Definisi keberhasilan MVP (USULAN, perlu disepakati tim).** Seorang calon pembeli, tanpa bantuan, dapat mencari satu lokasi di Kota Semarang, membaca kategori dan Proyeksi Tenor, lalu mengunduh PDF dalam waktu kurang dari 2 menit. Diuji ke minimal 20 responden, target minimal 80% menjawab benar dua pertanyaan pemahaman (arti kategori, dan arti "jika tren bertahan").

**Arsitektur.** Sentinel-1 lewat ASF HyP3, deret waktu MintPy/SBAS, koreksi atmosfer dan titik referensi stabil (stasiun GNSS CSEM), gabung dua lintasan menjadi laju vertikal, validasi antarlintasan, lalu grid piksel dan ringkasan per kelurahan. Web app statis (Vite, React, MapLibre GL JS) membaca file itu. Tanpa server, hosting gratis. Seluruh alur olah sudah dijalankan pada 14 November 2026.

**Antarmuka.** Cari alamat atau klik peta, Laporan Ambles (status, riwayat, Proyeksi Tenor, langkah berikutnya, sumber dan batasan), unduh PDF, bandingkan lokasi. Dashboard untuk institusi. Halaman Data & metode memuat input data.

**Kategori yang transparan.** Kategori hanya dari laju: rendah di bawah 2, sedang 2 sampai di bawah 4, tinggi mulai 4 cm/tahun. Ambang bisa digeser di Dashboard untuk uji sensitivitas. Ketidakpastian selalu tampil sebagai plus minus dan sebagai rentang proyeksi. Rumus: tengah = laju × tenor, bawah = max(0, (laju - sigma) × tenor), atas = (laju + sigma) × tenor.

**Jadwal.** Menurut spreadsheet tim: langkah web sekitar 10 hari, total langkah 1 sampai 16 sekitar 37 hari kerja, sebagian paralel. Uji pemahaman laporan dan wawancara pengembang berjalan paralel dengan pengolahan data.

## Asumsi yang belum ditetapkan tim

- Ambang kategori 2 dan 4 cm/tahun.
- Unit laporan: blok 3 × 3 piksel (sekitar 240 m) di sekitar titik, memadai bila minimal 4 piksel terukur.
- Ketidakpastian titik = akar dari (sebaran laju dalam blok² + galat ukur piksel²). Galat ukur piksel paling kecil sama dengan RMSE antarlintasan (0,34 cm/tahun).
- Ringkasan kelurahan memadai bila minimal 15 piksel terukur dan menutup minimal 20% luasnya.
- Piksel yang terukur dari satu lintasan saja (9% piksel terukur): asumsi gerak dominan vertikal.
- Periode olah Januari 2020 sampai November 2026, dan laju = tren linear seluruh periode. Percepatan atau perlambatan dalam periode itu tidak tercermin di angka laju, hanya terlihat di grafik riwayat.
- Piksel dipakai bila koherensi temporal minimal 0,7.
- Perbukitan selatan dianggap stabil saat menaksir koreksi atmosfer.
- Pilihan teknologi: MapLibre GL JS, peta dasar OpenFreeMap, Nominatim.
- Tanpa Patok Pantau, mengikuti rangkuman proyek versi terakhir (v3).
- Referensi visual: dua gambar acuan dari tim (peta 3D bernuansa terang, dan peta gelap miring) dipakai sebagai arah tampilan terang dan gelap.

## Risiko dan hal yang perlu dicek

- Belum ada pembanding lapangan di kawasan yang ambles. Stasiun GNSS terbuka satu-satunya di kota (CSEM) berada di area stabil dan dipakai sebagai titik ikat. Bila tim memperoleh data sipat datar atau GNSS di Semarang bawah, bandingkan dengan laporan titik di lokasi itu.
- 18% piksel kota tidak terukur, terutama tambak dan pesisir Tugu serta lereng bervegetasi di Mijen dan Gunungpati. Di sana aplikasi menulis "data tidak memadai".
- RDTR terbuka baru ada untuk Jakarta, Kota Pekalongan, dan Kawasan Mranggen (Demak). Semarang memakai RTRW Kota 1:25.000 dan Demak di luar Mranggen memakai RTRW Provinsi 1:250.000, keduanya belum cukup untuk memastikan peruntukan satu persil. Kepastian tetap di KKPR. GISTARU ATR/BPN menyimpan RDTR nasional di balik token.
- Lapis geologi berskala 1:100.000 dan menggambarkan batuan di permukaan, bukan tebal endapan lunak di bawah satu persil. Peta Geologi Kuarter Lembar Semarang 1:50.000 yang lebih rinci untuk endapan muda belum didigitasi.
- Lapis bahaya banjir dan abrasi diambil dari InaRISK BNPB, yang tidak mencantumkan lisensi pemakaian ulang. Lapis ini ditampilkan dengan atribusi sebagai konteks; bila dipakai di luar kompetisi, minta izin tertulis ke BNPB. Indeks bahaya adalah model nasional 100 m, bukan catatan kejadian, dan tidak memperhitungkan penurunan tanah. Lapis genangan rob khusus belum ada. Elevasi dari DEM global tidak ditampilkan karena galatnya beberapa meter.
- Data berhenti di November 2026. Pembaruan berarti menjalankan ulang pipeline; belum otomatis.
- Nominatim: maksimal 1 permintaan per detik dan tanpa autocomplete. Karena itu pencarian alamat hanya dikirim saat tombol Cari ditekan. Untuk pemakaian ramai, siapkan layanan geocoding sendiri.
- Paket pengembangan `osmtogeojson` membawa dependensi lama (`@xmldom/xmldom`) yang ditandai `npm audit`. Hanya dipakai skrip pengambil batas, tidak ikut ke aplikasi.

## Lisensi dan atribusi

- Citra radar: berisi data Copernicus Sentinel yang dimodifikasi (2020 sampai 2026), diunduh lewat Alaska Satellite Facility.
- Interferogram: ASF HyP3. Deret waktu: MintPy (Yunjun, Fattahi & Amelung 2019).
- GNSS (CSEM, CBTU, CJKT, CTGR, CPKL): Susilo dkk. (2023), Zenodo `10.5281/zenodo.7775016`, CC BY 4.0.
- Tata ruang: RDTR DKI Jakarta 2022 (Peraturan Gubernur DKI Jakarta Nomor 31 Tahun 2022), layanan DPMPTSP DKI; Peta Rencana Pola Ruang RDTR Kota Pekalongan 2024-2044, Geoportal Kota Pekalongan; Pola Ruang skala 1:25.000, Dinas Penataan Ruang Kota Semarang, Geoportal Kota Semarang; RTRW Provinsi Jawa Tengah 2024-2044 (Perda Provinsi Jawa Tengah Nomor 8 Tahun 2024); RDTR Kawasan Mranggen, Geoportal Kabupaten Demak (bila termuat).
- DEM: Copernicus GLO-30, © DLR e.V. 2010-2014 dan © Airbus Defence and Space GmbH 2014-2018, disediakan di bawah program Copernicus.
- Geologi (semua raster dari GeoMap Badan Geologi, milik Pusat Survei Geologi, tidak diperjualbelikan, tidak disimpan di repo): Thanden, Sumadirdja, Richards, Sutisna dan Amin (1996), Lembar Magelang dan Semarang; Turkandi, Sidarto, Agustiyanto dan Purbo Hadiwidjoyo (1992), Lembar Jakarta dan Kepulauan Seribu; Condon, Pardyanto, Ketner, Amin, Gafoer dan Samodra (1996), Lembar Banjarnegara dan Pekalongan; Suwarti dan Wikarno (1992), Lembar Kudus; Sukardi dan Budhitrisna (1992), Lembar Salatiga; semuanya skala 1:100.000.
- Batas wilayah: Semarang dan Jakarta © OpenStreetMap contributors (ODbL); Pekalongan dan Demak dari BPS 2020 lewat OCHA HDX (CC BY-IGO).
- Rentang pembanding Jakarta: Abidin dkk. (2011), Natural Hazards 59.
- Peta dasar: OpenFreeMap, © OpenMapTiles, data OpenStreetMap.
- Pencarian alamat: Nominatim, [kebijakan pemakaian](https://operations.osmfoundation.org/policies/nominatim/).

## Batasan produk

- Laporan menggambarkan blok sekitar 240 m di sekitar titik, bukan satu bangunan. Dashboard dan data unggahan bersifat per kelurahan.
- Kategori bukan jaminan bahwa suatu rumah aman atau tidak aman.
- Tidak menggantikan pemeriksaan legalitas tanah, survei geoteknik, penilaian bangunan, atau prosedur pembiayaan resmi.
- Proyeksi adalah perpanjangan tren masa lalu. Selalu dibaca "jika tren bertahan".
- Informasi untuk adaptasi, bukan penolakan.
