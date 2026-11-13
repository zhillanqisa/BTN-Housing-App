# PANTAU AMBLES

**Cek Tanah Sebelum KPR.** Web app untuk melihat laju penurunan tanah di sekitar sebuah titik di Kota Semarang dan proyeksinya selama masa cicilan KPR (Proyeksi Tenor). Dibuat untuk BTN Housingpreneur Batch 3, kategori Housing Innovation.

Laporan mengikuti titik yang dipilih: angkanya dihitung dari blok piksel sekitar 240 m di sekitar titik itu, bukan rata-rata satu kelurahan. Dua titik dalam kelurahan yang sama bisa memberi hasil berbeda.

**Demo:** https://zhillanqisa.github.io/BTN-Housing-App/

> **Status data:** peta saat ini memakai **data demo ilustratif**, bukan hasil pengukuran. Pola angkanya meniru rentang publikasi supaya antarmuka bisa didemokan. Olahan Sentinel-1 tim belum dijalankan. Jangan memakai angka di aplikasi ini untuk keputusan.

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

1. Di halaman **Cek lokasi**, klik kartu contoh "Tanah Mas" atau cari alamat, atau klik titik mana pun di peta. Kotak hijau di peta menandai blok piksel yang dipakai untuk laporan.
2. Baca **Laporan Ambles**: status di titik itu, grafik riwayat, lalu Proyeksi Tenor. Coba klik titik lain di kelurahan yang sama dan bandingkan angkanya.
3. Ganti tenor 10, 15, 20 tahun dan lihat rumah pada gambar ikut turun.
4. Tekan **Unduh PDF** untuk laporan satu halaman.
5. Tekan **Bandingkan**, pilih lokasi lain, lalu buka halaman **Bandingkan**.
6. Buka **Dashboard** untuk tampilan institusi: filter, grafik, tabel, uji sensitivitas ambang, unduh CSV.
7. Buka **Data & metode** untuk sumber data, batasan, dan fitur **Ganti data**.

Tautan bisa dibagikan: `#/?ll=<lintang>,<bujur>&t=<tenor>`. Tautan lama `#/?k=<id kelurahan>` tetap terbuka dan diarahkan ke pusat kelurahan itu.

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
    data.ts            muat dan validasi ringkasan per kelurahan
    importer.ts        impor CSV / GeoJSON
    pdf.ts             PDF Laporan Ambles (jsPDF, vektor)
    geocode.ts         pencarian lokal + Nominatim
    store.ts router.ts state aplikasi dan router hash
  ui/primitives.tsx    komponen dasar
  styles/app.css       token desain (terang dan gelap)
scripts/
  fetch-boundaries.mjs batas kelurahan dari OpenStreetMap (npm run data:boundaries)
  build-demo-data.mjs  data demo ilustratif: grid piksel dan ringkasan kelurahan (npm run data:demo)
data-raw/              batas kelurahan, kecamatan, kota (hasil skrip)
public/data/           semarang-grid.* (grid piksel) dan semarang-kawasan.geojson, dibaca aplikasi
```

## Skema data

Aplikasi membaca dua kelompok file di `public/data/`.

### Grid piksel (peta dan laporan titik)

- `semarang-grid.json`: kepala grid.
- `semarang-grid-laju.bin` dan `semarang-grid-sigma.bin`: Int16 little-endian, satu nilai per piksel, baris pertama paling utara.
- `semarang-grid-deret.bin`: Int16, deret waktu hanya untuk piksel terukur, urut baris demi baris. Dimuat setelah peta tampil.

```json
{
  "versi": 1, "jenis": "olahan", "dibuat": "2026-12-01",
  "bbox": [110.26, -7.12, 110.51, -6.92],
  "nx": 336, "ny": 260, "ukuranSelM": 80,
  "nodata": -32768, "luar": -32767,
  "skalaLaju": 0.01, "skalaDeret": 0.1,
  "epoch": [2020.0, 2020.25],
  "berkas": { "laju": "semarang-grid-laju.bin", "sigma": "semarang-grid-sigma.bin", "deret": "semarang-grid-deret.bin" }
}
```

- `bbox`: `[barat, selatan, timur, utara]` tepi luar grid, derajat WGS84.
- Nilai laju dan sigma × `skalaLaju` = cm/tahun, **positif berarti turun**. Nilai deret × `skalaDeret` = cm, negatif berarti turun.
- `nodata`: piksel di dalam kota yang tidak terukur. `luar`: piksel di luar batas kota.
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

## Mengganti data demo dengan hasil olahan tim

1. **Lewat aplikasi:** halaman Data & metode, bagian Unggah data. Unggah GeoJSON lengkap, atau CSV (`id;nama;kecamatan;laju;sigma;n_piksel;koherensi`) yang digabung ke batas kelurahan. Templat CSV bisa diunduh di sana. Data unggahan hanya hidup di peramban dan tidak membawa grid, jadi selama dipakai, peta dan laporan beralih ke rata-rata kelurahan.
2. **Permanen:** ganti file grid dan `public/data/semarang-kawasan.geojson` dengan file berskema sama, set `jenis` menjadi `olahan`.
3. **Dari MintPy:** sketsa awal untuk ringkasan kelurahan ada di bawah. **Belum pernah dijalankan**, sesuaikan nama file dan ambang. Pipeline lengkap (termasuk penulisan grid) sedang disiapkan di folder `pipeline/`.

```python
import geopandas as gpd, json
from rasterstats import zonal_stats

kel = gpd.read_file("data-raw/semarang-kelurahan.geojson")
# velocity_vertikal_mm.tif: laju vertikal mm/tahun dari MintPy, negatif = turun
z = zonal_stats(kel, "velocity_vertikal_mm.tif", stats=["median", "std", "count"])
koh = zonal_stats(kel, "koherensi_rata.tif", stats=["mean"])
fitur = []
for (_, r), s, c in zip(kel.iterrows(), z, koh):
    memadai = (s["count"] or 0) >= 30 and (c["mean"] or 0) >= 0.32
    fitur.append({"type": "Feature", "geometry": r.geometry.__geo_interface__, "properties": {
        "id": r["id"], "nama": r["nama"], "kecamatan": r["kecamatan"],
        "laju": round(-s["median"] / 10, 1) if memadai else None,   # mm ke cm, positif = turun
        "sigma": round(s["std"] / 10, 1) if memadai else None,
        "nPiksel": s["count"] or 0, "koherensi": c["mean"], "memadai": memadai,
        "deret": [], "jarakPantaiKm": None}})
json.dump({"type": "FeatureCollection", "metadata": {"jenis": "olahan"}, "features": fitur},
          open("public/data/semarang-kawasan.geojson", "w"))
```

## Rencana realisasi

Acuan: spreadsheet tim "Sumber & Alur Olah Data" dan draf ide. Hal di luar keduanya ditandai sebagai asumsi atau usulan.

**Tujuan.** Menerjemahkan data penurunan tanah menjadi satu laporan per lokasi yang dipahami orang awam, lengkap dengan langkah berikutnya.

**Definisi keberhasilan MVP (USULAN, perlu disepakati tim).** Seorang calon pembeli, tanpa bantuan, dapat mencari satu lokasi di Kota Semarang, membaca kategori dan Proyeksi Tenor, lalu mengunduh PDF dalam waktu kurang dari 2 menit. Diuji ke minimal 20 responden, target minimal 80% menjawab benar dua pertanyaan pemahaman (arti kategori, dan arti "jika tren bertahan").

**Arsitektur.** Sentinel-1 lewat ASF HyP3, deret waktu MintPy/SBAS, koreksi atmosfer dan titik referensi stabil, konversi ke laju vertikal, validasi GNSS, agregasi per kelurahan, lalu satu file GeoJSON. Web app statis (Vite, React, MapLibre GL JS) membaca file itu. Tanpa server, hosting gratis.

**Antarmuka.** Cari alamat atau klik peta, Laporan Ambles (status, riwayat, Proyeksi Tenor, langkah berikutnya, sumber dan batasan), unduh PDF, bandingkan lokasi. Dashboard untuk institusi. Halaman Data & metode memuat input data.

**Kategori yang transparan.** Kategori hanya dari laju: rendah di bawah 2, sedang 2 sampai di bawah 4, tinggi mulai 4 cm/tahun. Ambang bisa digeser di Dashboard untuk uji sensitivitas. Ketidakpastian selalu tampil sebagai plus minus dan sebagai rentang proyeksi. Rumus: tengah = laju × tenor, bawah = max(0, (laju - sigma) × tenor), atas = (laju + sigma) × tenor.

**Jadwal.** Menurut spreadsheet tim: langkah web sekitar 10 hari, total langkah 1 sampai 16 sekitar 37 hari kerja, sebagian paralel. Uji pemahaman laporan dan wawancara pengembang berjalan paralel dengan pengolahan data.

## Asumsi yang belum ditetapkan tim

- Ambang kategori 2 dan 4 cm/tahun.
- Unit laporan: blok 3 × 3 piksel (sekitar 240 m) di sekitar titik, memadai bila minimal 4 piksel terukur.
- Ketidakpastian titik = akar dari (sebaran laju dalam blok² + galat ukur piksel²).
- Ringkasan kelurahan memadai bila minimal 15 piksel terukur dan menutup minimal 20% luasnya.
- Bila hanya satu lintasan satelit: asumsi gerak dominan vertikal.
- Model data demo (pola utara-timur makin cepat) hanya ilustrasi.
- Pilihan teknologi: MapLibre GL JS, peta dasar OpenFreeMap, Nominatim.
- Tanpa Patok Pantau, mengikuti rangkuman proyek versi terakhir (v3).
- Referensi visual: dua gambar acuan dari tim (peta 3D bernuansa terang, dan peta gelap miring) dipakai sebagai arah tampilan terang dan gelap.

## Risiko dan hal yang perlu dicek

- Ketersediaan peta genangan rob dan data pasang surut.
- Unduhan vektor tata ruang (GISTARU) dan format digital peta geologi.
- Mutu koherensi InSAR di kawasan bervegetasi dan tambak.
- Validasi di Semarang bagian bawah: stasiun GNSS acuan (CSEM) berada di area stabil.
- Nominatim: maksimal 1 permintaan per detik dan tanpa autocomplete. Karena itu pencarian alamat hanya dikirim saat tombol Cari ditekan. Untuk pemakaian ramai, siapkan layanan geocoding sendiri.
- Paket pengembangan `osmtogeojson` membawa dependensi lama (`@xmldom/xmldom`) yang ditandai `npm audit`. Hanya dipakai skrip pengambil batas, tidak ikut ke aplikasi.

## Lisensi dan atribusi

- Batas wilayah: © OpenStreetMap contributors (ODbL).
- Peta dasar: OpenFreeMap, © OpenMapTiles, data OpenStreetMap.
- Pencarian alamat: Nominatim, [kebijakan pemakaian](https://operations.osmfoundation.org/policies/nominatim/).

## Batasan produk

- Laporan menggambarkan blok sekitar 240 m di sekitar titik, bukan satu bangunan. Dashboard dan data unggahan bersifat per kelurahan.
- Kategori bukan jaminan bahwa suatu rumah aman atau tidak aman.
- Tidak menggantikan pemeriksaan legalitas tanah, survei geoteknik, penilaian bangunan, atau prosedur pembiayaan resmi.
- Proyeksi adalah perpanjangan tren masa lalu. Selalu dibaca "jika tren bertahan".
- Informasi untuk adaptasi, bukan penolakan.
