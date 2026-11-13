"""Jalur dan konstanta bersama untuk pipeline InSAR PANTAU AMBLES.

Data mentah dan hasil antara TIDAK disimpan di repo. Semuanya berada di folder
kerja (bawaan: ../pantau-ambles-olah di samping repo, atau isi variabel
lingkungan PA_OLAH).
"""
from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OLAH = Path(os.environ.get("PA_OLAH", REPO.parent / "pantau-ambles-olah"))
KERJA = OLAH / "kerja"
AOI_KOTA = REPO / "data-raw" / "semarang-kota.geojson"

# Awal periode olah. Akhir = citra terbaru saat skrip dijalankan.
MULAI = "2020-01-01"

# Lintasan Sentinel-1 yang melintasi Kota Semarang (dicek di katalog ASF, 13 Nov 2026).
LINTASAN = {
    "desc": {"arah": "DESCENDING", "path": 76},
    "asc": {"arah": "ASCENDING", "path": 127},
}

# Nama proyek di HyP3 dan jumlah looks (20x4 = piksel sekitar 80 m).
PROYEK_HYP3 = "pantau-ambles"
LOOKS = "20x4"

# Jaringan SBAS: tiap citra dipasangkan dengan N citra berikutnya, ditambah pasangan
# berjarak sekitar satu tahun untuk meredam bias sinyal memudar pada pasangan pendek.
TETANGGA = 3
HARI_TAHUNAN = 365
TOLERANSI_TAHUNAN = 24  # hari
TAHUNAN_TIAP = 2  # satu pasangan tahunan untuk tiap N citra


# Produk HyP3 untuk Semarang: UTM zona 49 Selatan, piksel 80 m, grid sejajar pada kelipatan 80 m.
EPSG_UTM = 32749
PIKSEL_M = 80
BANTALAN_M = 1000  # ruang di luar kotak batas kota saat memotong

# Stasiun GNSS CSEM (Susilo dkk. 2023): stabil, dipakai sebagai titik referensi.
CSEM_LALO = (-6.9872694696, 110.3769383426)


def pastikan_kerja() -> Path:
    KERJA.mkdir(parents=True, exist_ok=True)
    return KERJA


def dir_lintasan(lintasan: str) -> Path:
    """Folder kerja satu lintasan: hyp3/<produk>/ (interferogram), geom/ (geometri), mintpy/."""
    d = KERJA / lintasan
    d.mkdir(parents=True, exist_ok=True)
    return d
