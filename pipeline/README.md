# Pipeline InSAR

Mengolah citra Sentinel-1 menjadi file yang dibaca aplikasi: grid piksel (`public/data/semarang-grid.*`) dan ringkasan per kelurahan (`public/data/semarang-kawasan.geojson`).

Alur: katalog ASF, interferogram di ASF HyP3, deret waktu SBAS di MintPy, gabung dua lintasan menjadi gerak vertikal, validasi, ekspor.

## Status

| Langkah | Skrip | Status |
|---|---|---|
| 1. Cari burst dan susun pasangan SBAS | `01_cari_pasangan.py` | Siap, tidak butuh login |
| 2. Pesan interferogram ke HyP3 | `02_pesan_hyp3.py` | Siap, butuh akun Earthdata dengan akses HyP3 |
| 3. Unduh dan potong ke wilayah kota | belum ditulis | Ditulis setelah uji kecil menghasilkan produk nyata |
| 4. Deret waktu MintPy per lintasan | belum ditulis | Sama |
| 5. Gerak vertikal dan validasi | belum ditulis | Sama |
| 6. Ekspor grid dan ringkasan kelurahan | belum ditulis | Sama |

Langkah 3 sampai 6 sengaja belum ditulis: susunan file produk HyP3 multi-burst dan keluaran MintPy harus dilihat dulu dari hasil nyata, supaya skripnya tidak menebak.

## Persiapan

1. Lingkungan. Butuh [micromamba](https://mamba.readthedocs.io/) atau conda:

   ```bash
   micromamba create -y -n insar -f pipeline/environment.yml
   ```

2. Folder kerja. Data mentah dan hasil antara tidak disimpan di repo. Bawaannya `../pantau-ambles-olah/kerja` di samping repo. Ganti lewat variabel lingkungan `PA_OLAH`.

3. Akun. Daftar gratis di `urs.earthdata.nasa.gov`. Pengguna baru HyP3 mungkin perlu mengisi formulir Requesting Access di dokumentasi HyP3. Simpan kredensial di file `.netrc` di folder pengguna, satu baris:

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
```

`02_pesan_hyp3.py` tanpa `--kirim` hanya memeriksa akses, sisa kredit, dan biaya. Dengan `--kirim` barulah memesan. Aman diulang: pasangan yang sudah dipesan tidak dipesan lagi.

## Pilihan yang dipakai

Semua ada di `umum.py`.

- Periode mulai 1 Januari 2020 sampai citra terbaru.
- Dua lintasan: descending path 76 dan ascending path 127.
- Looks 20x4, piksel sekitar 80 m.
- Jaringan SBAS: tiap citra dipasangkan dengan 3 citra berikutnya, ditambah satu pasangan berjarak sekitar setahun untuk tiap 2 citra. Pasangan panjang dipakai untuk meredam bias sinyal memudar yang muncul bila hanya memakai pasangan pendek.
- Masker air diaktifkan saat memesan.

## Data pembanding

- GNSS: Susilo dkk. (2023), Zenodo `10.5281/zenodo.7775016`, lisensi CC BY 4.0. Di Kota Semarang hanya ada stasiun CSEM (110,3769 BT; 6,9873 LS). Laju vertikalnya dari deret harian 2010 sampai 2021 sekitar -0,7 mm/tahun, artinya stabil, jadi dipakai sebagai titik ikat, bukan pembanding di area yang ambles.
