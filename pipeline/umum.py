"""Jalur dan konstanta bersama untuk pipeline InSAR PANTAU AMBLES.

Data mentah dan hasil antara TIDAK disimpan di repo. Semuanya berada di folder
kerja (bawaan: ../pantau-ambles-olah di samping repo, atau isi variabel
lingkungan PA_OLAH).

Wilayah dipilih lewat variabel lingkungan PA_WILAYAH (bawaan: semarang), mis.
    PA_WILAYAH=jakarta python pipeline/01_cari_pasangan.py --lintasan asc
"""
from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OLAH = Path(os.environ.get("PA_OLAH", REPO.parent / "pantau-ambles-olah"))

# Stasiun GNSS Susilo dkk. (2023), Zenodo 10.5281/zenodo.7775016 (CC BY 4.0). lalo = (lintang, bujur).
# laju_turun: cm/tahun, positif = turun. CSEM dari deret 2010-2021; stasiun lain dari deret 2018-2021,
# bagian yang paling dekat dengan periode InSAR (2020 dan seterusnya).
GNSS = {
    "CSEM": {"lalo": (-6.9872694696, 110.3769383426), "laju_turun": 0.07, "lokasi": "Semarang"},
    "CJKT": {"lalo": (-6.1101105079, 106.8845313238), "laju_turun": 0.51, "lokasi": "Jakarta Utara"},
    "CTGR": {"lalo": (-6.2908318536, 106.6638042672), "laju_turun": 0.08, "lokasi": "Tangerang"},
    "CBTU": {"lalo": (-6.3083191942, 107.0963704253), "laju_turun": -0.10, "lokasi": "Kabupaten Bekasi"},
    "CPKL": {"lalo": (-6.8870135368, 109.6694425263), "laju_turun": 11.56, "lokasi": "Pekalongan"},
}

# Konfigurasi per wilayah.
# - lintasan: lintasan Sentinel-1 yang melintasi wilayah (dicek di katalog ASF, 13-14 November 2026)
# - referensi: stasiun GNSS stabil yang dipakai sebagai titik ikat MintPy, atau titik sementara bila tidak ada
# - area_stabil: bila ada, laju dan deret diikat ulang ke median piksel di atas tinggi ini (meter, elipsoid)
# - pembanding: stasiun GNSS di dalam kotak olah yang tidak dipakai sebagai titik ikat (pembanding independen)
# - troposfer: "bukit" = korelasi fase-ketinggian ditaksir dari piksel di atas tinggi_bukit, "tidak" = tanpa koreksi
# - maks_burst: biaya HyP3 tetap 1 kredit sampai 4 burst per pasangan
KONFIG = {
    "semarang": {
        "nama": "Kota Semarang",
        "lintasan": {"desc": {"arah": "DESCENDING", "path": 76}, "asc": {"arah": "ASCENDING", "path": 127}},
        "epsg": 32749,
        "proyek": "pantau-ambles",
        "kerja": "kerja",
        "referensi": "CSEM",
        "pembanding": [],
        "troposfer": "bukit",
        "tinggi_bukit": 80.0,
    },
    "jakarta": {
        "nama": "DKI Jakarta",
        "lintasan": {"desc": {"arah": "DESCENDING", "path": 47}, "asc": {"arah": "ASCENDING", "path": 98}},
        "epsg": 32748,
        "proyek": "pantau-ambles-jakarta",
        "kerja": "kerja-jakarta",
        "referensi": "CBTU",
        "pembanding": ["CJKT", "CTGR"],
        # dataran rendah tanpa perbukitan: korelasi fase-ketinggian tidak bermakna
        "troposfer": "tidak",
    },
    "pekalongan": {
        "nama": "Kota Pekalongan",
        "lintasan": {"desc": {"arah": "DESCENDING", "path": 76}, "asc": {"arah": "ASCENDING", "path": 25}},
        "epsg": 32749,
        "proyek": "pantau-ambles-pekalongan",
        "kerja": "kerja-pekalongan",
        # tidak ada GNSS stabil di dekatnya: titik sementara di tanah tinggi Kajen, lalu diikat ulang ke area stabil
        "referensi": {"nama": "tanah tinggi Kajen", "lalo": (-7.025, 109.588)},
        "area_stabil": {"tinggi_min": 90.0, "keterangan": "piksel di atas 90 m (elipsoid), sekitar 70 m di atas muka laut, di selatan kota"},
        "pembanding": ["CPKL"],
        "troposfer": "bukit",
        "tinggi_bukit": 90.0,
        "tambah_kotak": [(-7.04, 109.57)],
    },
    "demak": {
        "nama": "Kabupaten Demak",
        "lintasan": {"desc": {"arah": "DESCENDING", "path": 76}, "asc": {"arah": "ASCENDING", "path": 127}},
        "epsg": 32749,
        "proyek": "pantau-ambles-demak",
        "kerja": "kerja-demak",
        "referensi": "CSEM",
        "pembanding": [],
        "troposfer": "bukit",
        "tinggi_bukit": 80.0,
    },
}

WILAYAH = os.environ.get("PA_WILAYAH", "semarang")
if WILAYAH not in KONFIG:
    raise SystemExit(f"PA_WILAYAH tidak dikenal: {WILAYAH}. Pilihan: {', '.join(KONFIG)}")
K = KONFIG[WILAYAH]

KERJA = OLAH / K["kerja"]
AOI_KOTA = REPO / "data-raw" / f"{WILAYAH}-kota.geojson"
NAMA_WILAYAH = K["nama"]

# Awal periode olah. Akhir = citra terbaru saat skrip dijalankan.
MULAI = "2020-01-01"

LINTASAN = K["lintasan"]

# Nama proyek di HyP3 dan jumlah looks (20x4 = piksel sekitar 80 m).
PROYEK_HYP3 = K["proyek"]
LOOKS = "20x4"
MAKS_BURST = 4

# Jaringan SBAS: tiap citra dipasangkan dengan N citra berikutnya, ditambah pasangan
# berjarak sekitar satu tahun untuk meredam bias sinyal memudar pada pasangan pendek.
TETANGGA = 3
HARI_TAHUNAN = 365
TOLERANSI_TAHUNAN = 24  # hari
TAHUNAN_TIAP = 2  # satu pasangan tahunan untuk tiap N citra

# Produk HyP3: UTM zona wilayah, piksel 80 m, grid sejajar pada kelipatan 80 m.
EPSG_UTM = K["epsg"]
PIKSEL_M = 80
BANTALAN_M = 1000  # ruang di luar kotak batas kota saat memotong

# Titik ikat
if isinstance(K["referensi"], str):
    REF_NAMA = K["referensi"]
    REF_LALO = GNSS[REF_NAMA]["lalo"]
    REF_LAJU_TURUN_CM: float | None = GNSS[REF_NAMA]["laju_turun"]
else:
    REF_NAMA = K["referensi"]["nama"]
    REF_LALO = K["referensi"]["lalo"]
    REF_LAJU_TURUN_CM = None
AREA_STABIL = K.get("area_stabil")
PEMBANDING = {n: GNSS[n] for n in K["pembanding"]}
TROPOSFER = K["troposfer"]
TINGGI_BUKIT_M = K.get("tinggi_bukit", 80.0)
# koreksi galat unwrapping MintPy: "no" atau "phase_closure"
UNWRAP = K.get("unwrap", "no")
# Diuji di Pekalongan 14 November 2026 dan tidak dipakai: phase_closure tidak mengubah laju; membatasi
# pasangan ke <=60 hari menurunkan laju di CPKL dari -5,55 ke -4,20 cm/tahun LOS (bias fading pasangan pendek).
# batas lama pasangan yang dipakai inversi (hari); None = semua pasangan
MAKS_HARI_PASANGAN = K.get("maks_hari_pasangan")
# titik tambahan (lintang, bujur) yang harus masuk kotak potong: titik ikat dan stasiun pembanding
TITIK_KOTAK = [REF_LALO, *(g["lalo"] for g in PEMBANDING.values()), *K.get("tambah_kotak", [])]

# Nama lama, dipakai skrip Semarang
CSEM_LALO = REF_LALO
CSEM_LAJU_TURUN_CM = REF_LAJU_TURUN_CM if REF_LAJU_TURUN_CM is not None else 0.0


def pastikan_kerja() -> Path:
    KERJA.mkdir(parents=True, exist_ok=True)
    return KERJA


def dir_lintasan(lintasan: str) -> Path:
    """Folder kerja satu lintasan: hyp3/<produk>/ (interferogram), geom/ (geometri), mintpy/."""
    d = KERJA / lintasan
    d.mkdir(parents=True, exist_ok=True)
    return d
