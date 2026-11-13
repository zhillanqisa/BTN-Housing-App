"""Langkah 4: deret waktu SBAS dengan MintPy untuk satu lintasan.

Menulis file konfigurasi MintPy lalu menjalankan smallbaselineApp di folder
<lintasan>/mintpy pada folder kerja.

Jalankan:
    python pipeline/04_mintpy.py --lintasan desc                      semua langkah
    python pipeline/04_mintpy.py --lintasan desc --langkah load_data  satu langkah saja
    python pipeline/04_mintpy.py --lintasan desc --dari modify_network --sampai velocity

Pilihan olah (semua tertulis di konfigurasi yang dihasilkan):
- Titik referensi: stasiun GNSS CSEM, yang stabil menurut Susilo dkk. (2023).
- Koreksi troposfer: korelasi fase dengan ketinggian (tanpa data cuaca luar).
- Koreksi galat DEM: aktif.
- Piksel dipakai bila koherensi temporal minimal 0,7.
"""
from __future__ import annotations

import argparse
import subprocess
import sys

from umum import CSEM_LALO, LINTASAN, dir_lintasan

MIN_KOHERENSI_TEMPORAL = 0.7


def konfigurasi(lintasan: str) -> str:
    d = dir_lintasan(lintasan).as_posix()
    lat, lon = CSEM_LALO
    return f"""# Konfigurasi MintPy untuk PANTAU AMBLES, lintasan {lintasan}. Dibuat oleh pipeline/04_mintpy.py.
mintpy.load.processor      = hyp3
mintpy.load.unwFile        = {d}/hyp3/*/*_unw_phase_clip.tif
mintpy.load.corFile        = {d}/hyp3/*/*_corr_clip.tif
mintpy.load.connCompFile   = {d}/hyp3/*/*_conncomp_clip.tif
mintpy.load.demFile        = {d}/geom/*_dem_clip.tif
mintpy.load.incAngleFile   = {d}/geom/*_lv_theta_clip.tif
mintpy.load.azAngleFile    = {d}/geom/*_lv_phi_clip.tif
mintpy.load.waterMaskFile  = {d}/geom/*_water_mask_clip.tif

mintpy.reference.lalo      = {lat:.5f}, {lon:.5f}

mintpy.troposphericDelay.method    = height_correlation
mintpy.deramp                      = no
mintpy.topographicResidual         = yes
mintpy.networkInversion.minTempCoh = {MIN_KOHERENSI_TEMPORAL}
"""


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), required=True)
    ap.add_argument("--langkah", help="jalankan satu langkah MintPy saja, mis. load_data")
    ap.add_argument("--dari", help="mulai dari langkah ini")
    ap.add_argument("--sampai", help="berhenti setelah langkah ini")
    a = ap.parse_args()

    kerja = dir_lintasan(a.lintasan) / "mintpy"
    kerja.mkdir(exist_ok=True)
    cfg = kerja / f"pantau_{a.lintasan}.cfg"
    cfg.write_text(konfigurasi(a.lintasan), encoding="utf-8")

    n = len(list((dir_lintasan(a.lintasan) / "hyp3").glob("*/*_unw_phase_clip.tif")))
    if not n:
        raise SystemExit(f"Belum ada interferogram terpotong untuk lintasan {a.lintasan}. Jalankan langkah 3 dulu.")
    print(f"Lintasan {a.lintasan}: {n} interferogram. Konfigurasi: {cfg}")

    perintah = [sys.executable, "-m", "mintpy.cli.smallbaselineApp", str(cfg)]
    if a.langkah:
        perintah += ["--dostep", a.langkah]
    if a.dari:
        perintah += ["--start", a.dari]
    if a.sampai:
        perintah += ["--end", a.sampai]
    raise SystemExit(subprocess.run(perintah, cwd=kerja).returncode)


if __name__ == "__main__":
    main()
