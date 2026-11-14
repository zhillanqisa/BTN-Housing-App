# Pipeline InSAR

Mengolah citra Sentinel-1 menjadi file yang dibaca aplikasi: grid piksel (`public/data/semarang-grid.*`) dan ringkasan per kelurahan (`public/data/semarang-kawasan.geojson`).

Alur: katalog ASF, interferogram di ASF HyP3, deret waktu SBAS di MintPy, gabung dua lintasan menjadi gerak vertikal, validasi, ekspor.

## Wilayah

Semua skrip membaca wilayah dari variabel lingkungan `PA_WILAYAH` (bawaan `semarang`). Pengaturan tiap wilayah (lintasan, stasiun acuan, pembanding, koreksi troposfer, area stabil) ada di `KONFIG` di `umum.py`. Folder kerja: `<PA_OLAH>/kerja` untuk Semarang, `<PA_OLAH>/kerja-<wilayah>` untuk wilayah lain.

```bash
PA_WILAYAH=jakarta python pipeline/01_cari_pasangan.py --lintasan asc
# ... langkah 2 sampai 6 sama seperti di bawah, semuanya dengan PA_WILAYAH yang sama
PA_WILAYAH=jakarta python pipeline/07b_geologi_lembar.py   # Semarang: 07a_digitasi_geologi.py
PA_WILAYAH=jakarta python pipeline/07_konteks.py
node scripts/ringkasan-wilayah.mjs                         # kartu perbandingan di Dashboard
```

| Wilayah | Lintasan | Acuan | Pembanding | Koreksi troposfer |
|---|---|---|---|---|
| semarang | desc 76, asc 127 | GNSS CSEM | - | perbukitan > 80 m |
| jakarta | desc 47, asc 98 | GNSS CBTU (Bekasi) | GNSS CJKT, CTGR | tidak (dataran) |
| pekalongan | desc 76, asc 25 | tanah tinggi Kajen, lalu diikat ulang ke median area > 90 m | GNSS CPKL | perbukitan > 90 m |
| demak | desc 76, asc 127 | GNSS CSEM | - | perbukitan > 80 m |

### Hasil Jakarta (14 November 2026)

| Ukuran | Nilai |
|---|---|
| Interferogram | 698 ascending (205 citra), 358 descending (110 citra) |
| Piksel DKI terukur | 95% (96.459 dari 101.479) |
| Selisih ascending dan descending | RMSE 0,45 cm/tahun, bias 0,42, korelasi 0,954 |
| GNSS CJKT (pembanding, Jakarta Utara) | GNSS 0,51, InSAR 0,92 cm/tahun |
| GNSS CTGR (pembanding, Tangerang) | GNSS 0,08, InSAR 0,22 cm/tahun |
| Laju tertinggi | 7,9 cm/tahun per piksel (Muara Angke); kelurahan tertinggi Pluit dan Kamal Muara 1,9 cm/tahun |
| Gerbang mutu | lulus |

### Temuan saat olah wilayah baru

1. **Stasiun acuan di piksel yang tidak tersambung.** CBTU jatuh di piksel yang komponen tersambungnya nol di sebagian interferogram, dan MintPy menolak titik itu. `04_mintpy.py` sekarang memindah acuan ke piksel andal terdekat (paling jauh 6 piksel). Karena pilihan asc dan desc bisa berbeda, `05_vertikal_validasi.py` mengikat ulang kedua lintasan ke satu piksel yang andal di keduanya.
2. **`waterMask.h5` belum ada pada olahan pertama.** Di Semarang berkas itu tersisa dari olahan lama. `04_mintpy.py` kini membaca masker air dari `inputs/geometryGeo.h5` bila perlu.
3. **Pembanding di luar cakupan citra** dicatat "tidak terukur" dan tidak ikut menentukan lulus. Titik ikat yang tidak terukur tetap membuat gerbang gagal.
4. **Statistik perbukitan** hanya dihitung bila wilayah memakai koreksi troposfer perbukitan. Di Jakarta piksel di atas 80 m hanyalah dataran selatan.
5. **Pekalongan: laju di stasiun CPKL lebih kecil dari GNSS.** Diuji tiga cara di lintasan ascending: jaringan lengkap -5,55 cm/tahun arah pandang, dengan koreksi galat unwrapping phase closure -5,55 (tidak berubah), hanya pasangan sampai 60 hari -4,20 (bias pasangan pendek). Jaringan lengkap tetap dipakai. GNSS CPKL 11,56 cm/tahun vertikal (2018-2021).
6. **Internet putus** membuat `status_hyp3.py` gagal dan putaran unduh mengira antrean kosong. Skrip putaran sekarang menganggap status yang gagal dibaca sebagai masih berjalan.

## Status Semarang

Semua langkah sudah dijalankan penuh pada 14 November 2026.

| Langkah | Skrip | Hasil |
|---|---|---|
| 1. Cari burst dan susun pasangan SBAS | `01_cari_pasangan.py` | 575 pasangan descending, 865 ascending |
| 2. Pesan interferogram ke HyP3 | `02_pesan_hyp3.py` | 1.440 job, semua sukses, 1.440 kredit |
| 3. Unduh dan potong ke wilayah kota | `03_unduh_potong.py` | 1.440 produk, tanpa galat |
| 4. Deret waktu MintPy per lintasan | `04_mintpy.py` | 170 tanggal descending, 259 ascending |
| 5. Gerak vertikal dan validasi | `05_vertikal_validasi.py` | Gerbang mutu lulus |
| 6. Ekspor grid dan ringkasan kelurahan | `06_ekspor.py` | 49.830 piksel terukur, 177 kelurahan |
| 7a. Digitasi peta geologi PSG | `07a_digitasi_geologi.py` | 7 satuan batuan di dalam kota |
| 7. Lapis konteks: pola ruang dan geologi | `07_konteks.py` | 9 kelas pola ruang, 7 satuan geologi, statistik laju per kelas |

`status_hyp3.py` menampilkan status job di HyP3 dan sisa kredit.

## Hasil validasi

| Ukuran | Nilai |
|---|---|
| Piksel kota terukur | 82% (49.830 dari 61.060) |
| Piksel yang terukur dari dua lintasan | 91% dari piksel terukur |
| Selisih laju ascending dan descending | RMSE 0,34 cm/tahun, bias -0,08, korelasi 0,995, dari 44.715 piksel |
| Perbukitan selatan (semestinya stabil) | median -0,04 cm/tahun, 80% piksel antara -0,12 dan 0,08 |
| Laju tertinggi di dalam kota | 12,7 cm/tahun per piksel, 11,6 cm/tahun per kelurahan |
| Gerbang mutu | RMSE antarlintasan paling besar 1 cm/tahun: lulus |

Yang belum ada: pembanding lapangan (GNSS, sipat datar) di kawasan yang ambles. Stasiun CSEM dipakai sebagai titik ikat, jadi kecocokan di sana bukan bukti independen.

## Temuan saat olah

Tiga hal ini mengubah cara olah dan perlu diingat bila pipeline diulang.

1. **Koreksi troposfer bawaan MintPy menyerap sinyal ambles.** Metode korelasi fase dengan ketinggian menaksir dari semua piksel. Di Semarang dataran rendah ambles dan perbukitan stabil, jadi ambles ikut berkorelasi dengan ketinggian. Akibatnya perbukitan tampak turun sekitar 1,5 cm/tahun per 100 m, padahal data mentahnya stabil. `04_mintpy.py` menaksir koreksi hanya dari piksel perbukitan (tinggi di atas 80 m elipsoid). Setelah itu perbukitan kembali 0,0 cm/tahun, dan derau deret di perbukitan lintasan descending tetap turun dari 7,8 ke 5,5 mm.
2. **Satu citra ascending rusak.** Ketujuh interferogram dengan citra 1 Mei 2025 hampir tanpa piksel tersambung (1%, yang lain minimal 60%). `04_mintpy.py` mencari citra semacam ini otomatis dan membuangnya.
3. **Kawasan tak terukur.** Tambak dan pesisir Tugu, serta lereng bervegetasi di Mijen dan Gunungpati, tidak lolos koherensi temporal 0,7. Di aplikasi piksel itu ditandai data tidak memadai.

Catatan lain:

- Produk HyP3 berada di UTM zona 49 Selatan, piksel 80 m, grid sejajar pada kelipatan 80 m. Pemotongan hanya menyalin piksel, tanpa resampling. Kotak potong kota 360 x 284 piksel, satu produk terpotong sekitar 0,6 MB.
- MintPy 1.6.4 berjalan di Windows tanpa WSL. Olah descending sekitar 4 menit, ascending sekitar 15 menit.
- Produk HyP3 hanya disimpan 14 hari. Jalankan langkah 3 sebelum itu.
- Tinggi DEM di produk HyP3 adalah tinggi di atas elipsoid (muka laut sekitar 22 m). Jangan dipakai sebagai elevasi di atas laut tanpa koreksi geoid.

## Lapis konteks (langkah 7)

Sumber dicek 14 November 2026:

| Data | Yang dicoba | Hasil |
|---|---|---|
| RTRW Kota Semarang | GISTARU, geoportal Pemkot (`geoportal.data.semarangkota.go.id`), Satu Peta BIG, katalog Tanah Air Indonesia | GISTARU meminta token; yang lain tidak merespons atau menolak (403) |
| RTRW Provinsi Jawa Tengah 2024-2044 | Layanan ArcGIS publik "Peta Rencana Perda Jawa Tengah No 8 Tahun 2024" | Terbuka. Dipakai, skala provinsi |
| Peta geologi PSG | Layanan peta geologi ESDM, GeoMap Badan Geologi | ESDM sedang pemeliharaan. Raster Lembar Magelang dan Semarang 1:100.000 diunduh tim lewat akun GeoMap; lisensinya terbuka dengan menyebut sumber PSG, tidak untuk diperjualbelikan |
| DEM Copernicus GLO-30 | AWS Open Data | Terbuka. Dipakai untuk memeriksa letak batas Aluvium hasil digitasi |

Digitasi geologi (`07a_digitasi_geologi.py`, raster di `<PA_OLAH>/konteks/mentah/`): georeferensi dari empat sudut bingkai, klasifikasi warna CIELAB dengan warna acuan dari pengelompokan k-means, lalu garis kontur, sungai, jalan, dan huruf dibuang dan celah diisi satuan terdekat. Dua aturan dari membaca peta: satuan gunungapi Gajahmungkur dan Jongkong hanya di selatan kota, dan Formasi Kerek hanya di lajur tengah berarsir, tenggara, dan tepi barat. Batas Aluvium hasil digitasi cocok 87% dengan dataran rendah pada DEM, dan menggeser peta tidak memperbaiki kecocokan, jadi tidak ada koreksi datum. Bila raster tidak ada, `07_konteks.py` kembali ke perkiraan dari bentuk lahan pada DEM.

Hasil statistik (laju median dari grid aplikasi):

| Kelas | Median (cm/tahun) | Piksel ≥ 4 cm/tahun |
|---|---|---|
| Aluvium | 3,6 | 48% |
| Enam satuan batuan lain | -0,1 sampai 0,0 | 0% |
| Pola ruang: Kawasan Transportasi | 6,7 | 58% |
| Pola ruang: Kawasan Permukiman | 0,0 | 18% |

Untuk mengganti dengan data resmi, simpan SHP-nya lalu jalankan `07_konteks.py --rtrw <file>` atau `--geologi <file>`. Kolom yang dibutuhkan ada di docstring skrip.

## Persiapan

1. Lingkungan. Butuh [micromamba](https://mamba.readthedocs.io/) atau conda:

   ```bash
   micromamba create -y -n insar -f pipeline/environment.yml
   ```

2. Folder kerja. Data mentah dan hasil antara tidak disimpan di repo. Bawaannya `../pantau-ambles-olah/kerja` di samping repo. Ganti lewat variabel lingkungan `PA_OLAH`.

3. Akun. Daftar gratis di `urs.earthdata.nasa.gov`, lalu setujui aplikasi HyP3 di halaman Applications akun itu. Simpan kredensial di file `.netrc` di folder pengguna, satu baris:

   ```
   machine urs.earthdata.nasa.gov login NAMA_PENGGUNA password KATA_SANDI
   ```

   Jangan pernah memasukkan file ini ke repo.

## Menjalankan

Semua perintah dari akar repo, dengan Python milik env `insar`.

```bash
python pipeline/01_cari_pasangan.py --lintasan desc
python pipeline/01_cari_pasangan.py --lintasan asc
python pipeline/02_pesan_hyp3.py --lintasan desc
python pipeline/02_pesan_hyp3.py --lintasan desc --uji 5 --kirim
python pipeline/02_pesan_hyp3.py --lintasan desc --kirim
python pipeline/status_hyp3.py
python pipeline/03_unduh_potong.py --lintasan desc
python pipeline/04_mintpy.py --lintasan desc
python pipeline/04_mintpy.py --lintasan asc
python pipeline/05_vertikal_validasi.py
python pipeline/06_ekspor.py
python pipeline/07a_digitasi_geologi.py
python pipeline/07_konteks.py
```

`02_pesan_hyp3.py` tanpa `--kirim` hanya memeriksa akses, sisa kredit, dan biaya. Dengan `--kirim` barulah memesan. Aman diulang: pasangan yang sudah dipesan tidak dipesan lagi.

`05_vertikal_validasi.py` menulis `hasil/vertikal.npz`, `hasil/validasi.json`, dan gambar `hasil/tinjau_*.png` di folder kerja. Lihat gambarnya sebelum menjalankan langkah 6.

`06_ekspor.py` menimpa file di `public/data/`. Periksa hasilnya di `npm run dev` sebelum commit.

## Pilihan yang dipakai

Konstanta ada di `umum.py` dan di kepala tiap skrip.

- Periode mulai 1 Januari 2020 sampai citra terbaru. Laju = tren linear seluruh periode.
- Dua lintasan: descending path 76 dan ascending path 127.
- Looks 20x4, piksel sekitar 80 m. Masker air diaktifkan saat memesan.
- Jaringan SBAS: tiap citra dipasangkan dengan 3 citra berikutnya, ditambah satu pasangan berjarak sekitar setahun untuk tiap 2 citra. Pasangan panjang dipakai untuk meredam bias sinyal memudar yang muncul bila hanya memakai pasangan pendek.
- Titik referensi: piksel stasiun GNSS CSEM.
- Koreksi troposfer: korelasi fase dengan ketinggian, ditaksir dari piksel perbukitan. Koreksi galat DEM aktif. Tanpa pembuangan ramp.
- Piksel dipakai bila koherensi temporal minimal 0,7.
- Vertikal: piksel yang terukur di dua lintasan diurai menjadi komponen vertikal dan timur-barat. Piksel satu lintasan dianggap bergerak vertikal seluruhnya.
- Galat laju per piksel: yang terbesar dari galat formal, RMSE antarlintasan, dan setengah selisih dua lintasan di piksel itu. Galat formal MintPy saja (sekitar 0,03 cm/tahun) terlalu optimistis.
- Deret waktu di aplikasi: titik tengah tiap triwulan, relatif ke triwulan pertama 2020.

## Data pembanding

- GNSS: Susilo dkk. (2023), Zenodo `10.5281/zenodo.7775016`, lisensi CC BY 4.0. Di Kota Semarang hanya ada stasiun CSEM (110,3769 BT; 6,9873 LS). Laju vertikalnya dari deret harian 2010 sampai 2021 sekitar -0,7 mm/tahun, artinya stabil, jadi dipakai sebagai titik ikat, bukan pembanding di area yang ambles.
- Kisaran publikasi yang dirujuk rangkuman tim: Tanah Mas 5,5 sampai 7,2 cm/tahun (Pujiastuti dkk. 2015). Hasil olah ini: Kelurahan Panggung Lor 5,9 cm/tahun (80% piksel antara 5,1 dan 6,8).
