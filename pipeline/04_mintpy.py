"""Langkah 4: deret waktu SBAS dengan MintPy untuk satu lintasan.

Menulis file konfigurasi MintPy lalu menjalankan smallbaselineApp di folder
<lintasan>/mintpy pada folder kerja, dalam tiga tahap:

1. MintPy sampai inversi jaringan.
2. Koreksi troposfer (korelasi fase dengan ketinggian) yang ditaksir HANYA dari
   piksel perbukitan.
3. MintPy dari koreksi galat DEM sampai laju.

Tahap 2 dijalankan sendiri karena bawaan MintPy menaksir korelasi dari semua piksel.
Di Semarang dataran rendah ambles dan perbukitan stabil, jadi ambles ikut berkorelasi
dengan ketinggian. Taksiran dari semua piksel menyerap sinyal ambles dan membuat
perbukitan tampak turun sekitar 1,5 cm/tahun per 100 m (diuji 14 November 2026).
Ditaksir dari perbukitan saja, perbukitan kembali stabil dan derau deret tetap turun.

Jalankan:
    python pipeline/04_mintpy.py --lintasan desc

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
from pathlib import Path

import h5py

from umum import CSEM_LALO, LINTASAN, dir_lintasan

MIN_KOHERENSI_TEMPORAL = 0.7
# Piksel di atas tinggi ini (meter di atas elipsoid, sekitar 55 m di atas laut) dianggap
# perbukitan stabil dan dipakai menaksir koreksi troposfer.
TINGGI_BUKIT_M = 80.0
# Citra dibuang bila interferogram terbaiknya pun tersambung di bawah pecahan ini dari piksel darat.
# Interferogram normal di Semarang tersambung 60% ke atas; citra rusak sekitar 1%.
MIN_TERSAMBUNG = 0.2
# Keluaran yang bergantung pada koreksi troposfer. Dihapus sebelum tahap 2 supaya tidak ada sisa olah lama.
TURUNAN_TROPOSFER = (
    "timeseries_tropHgt.h5",
    "timeseries_tropHgt_demErr.h5",
    "demErr.h5",
    "timeseriesResidual.h5",
    "timeseriesResidual_ramp.h5",
    "rms_timeseriesResidual_ramp.txt",
    "rms_timeseriesResidual_ramp.pdf",
    "reference_date.txt",
    "velocity.h5",
)


def konfigurasi(lintasan: str, buang_tanggal: list[str]) -> str:
    d = dir_lintasan(lintasan).as_posix()
    lat, lon = CSEM_LALO
    buang = ",".join(buang_tanggal) if buang_tanggal else "no"
    return f"""# Konfigurasi MintPy untuk PANTAU AMBLES, lintasan {lintasan}. Dibuat oleh pipeline/04_mintpy.py.
# Citra rusak (semua interferogramnya nyaris tanpa piksel tersambung), dicari otomatis oleh 04_mintpy.py.
mintpy.network.excludeDate = {buang}

mintpy.load.processor      = hyp3
mintpy.load.unwFile        = {d}/hyp3/*/*_unw_phase_clip.tif
mintpy.load.corFile        = {d}/hyp3/*/*_corr_clip.tif
mintpy.load.connCompFile   = {d}/hyp3/*/*_conncomp_clip.tif
mintpy.load.demFile        = {d}/geom/*_dem_clip.tif
mintpy.load.incAngleFile   = {d}/geom/*_lv_theta_clip.tif
mintpy.load.azAngleFile    = {d}/geom/*_lv_phi_clip.tif
mintpy.load.waterMaskFile  = {d}/geom/*_water_mask_clip.tif

mintpy.reference.lalo      = {lat:.5f}, {lon:.5f}

# Koreksi troposfer dijalankan oleh 04_mintpy.py dengan masker perbukitan (lihat docstring skrip).
# Nilai ini hanya memberi tahu MintPy nama file deret waktu yang sudah dikoreksi.
mintpy.troposphericDelay.method    = height_correlation
mintpy.deramp                      = no
mintpy.topographicResidual         = yes
mintpy.networkInversion.minTempCoh = {MIN_KOHERENSI_TEMPORAL}

# Gambar dan KMZ bawaan MintPy tidak dipakai; gambar tinjauan dibuat di langkah 5.
mintpy.plot                        = no
mintpy.save.kmz                    = no
"""


def jalankan(perintah: list[str], kerja: Path) -> None:
    kode = subprocess.run([sys.executable, "-m", *perintah], cwd=kerja).returncode
    if kode:
        raise SystemExit(kode)


def tanggal_rusak(kerja: Path) -> list[str]:
    """Tanggal citra yang SEMUA interferogramnya tersambung di bawah MIN_TERSAMBUNG piksel darat."""
    with h5py.File(kerja / "waterMask.h5", "r") as h:
        darat = h["waterMask"][:].astype(bool)
    with h5py.File(kerja / "inputs" / "ifgramStack.h5", "r") as h:
        pasangan = [(a.decode(), b.decode()) for a, b in h["date"][:]]
        tersambung = [float((h["connectComponent"][i][darat] > 0).mean()) for i in range(len(pasangan))]
    terbaik: dict[str, float] = {}
    for (a, b), f in zip(pasangan, tersambung):
        for t in (a, b):
            terbaik[t] = max(terbaik.get(t, 0.0), f)
    return sorted(t for t, f in terbaik.items() if f < MIN_TERSAMBUNG)


def masker_bukit(kerja: Path) -> int:
    """Tulis maskBukit.h5: piksel andal (lolos koherensi temporal) di perbukitan. Mengembalikan jumlah piksel."""
    with h5py.File(kerja / "inputs" / "geometryGeo.h5", "r") as h:
        tinggi = h["height"][:]
    with h5py.File(kerja / "maskTempCoh.h5", "r") as h:
        andal = h["mask"][:].astype(bool)
        atribut = dict(h.attrs)
    bukit = andal & (tinggi > TINGGI_BUKIT_M)
    with h5py.File(kerja / "maskBukit.h5", "w") as h:
        h.create_dataset("mask", data=bukit)
        for k, v in atribut.items():
            h.attrs[k] = v
    return int(bukit.sum())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), required=True)
    a = ap.parse_args()

    kerja = dir_lintasan(a.lintasan) / "mintpy"
    kerja.mkdir(exist_ok=True)
    cfg = kerja / f"pantau_{a.lintasan}.cfg"

    n = len(list((dir_lintasan(a.lintasan) / "hyp3").glob("*/*_unw_phase_clip.tif")))
    if not n:
        raise SystemExit(f"Belum ada interferogram terpotong untuk lintasan {a.lintasan}. Jalankan langkah 3 dulu.")
    print(f"Lintasan {a.lintasan}: {n} interferogram. Konfigurasi: {cfg}", flush=True)

    cfg.write_text(konfigurasi(a.lintasan, []), encoding="utf-8")
    jalankan(["mintpy.cli.smallbaselineApp", str(cfg), "--dostep", "load_data"], kerja)
    rusak = tanggal_rusak(kerja)
    print(f"Citra rusak yang dibuang: {', '.join(rusak) if rusak else 'tidak ada'}", flush=True)
    cfg.write_text(konfigurasi(a.lintasan, rusak), encoding="utf-8")
    jalankan(["mintpy.cli.smallbaselineApp", str(cfg), "--start", "modify_network", "--end", "correct_ionosphere"], kerja)

    for nama in TURUNAN_TROPOSFER:
        (kerja / nama).unlink(missing_ok=True)
    n_bukit = masker_bukit(kerja)
    if n_bukit < 1000:
        raise SystemExit(f"Hanya {n_bukit} piksel perbukitan yang andal; terlalu sedikit untuk menaksir koreksi troposfer.")
    print(f"Koreksi troposfer ditaksir dari {n_bukit} piksel perbukitan (tinggi di atas {TINGGI_BUKIT_M:.0f} m).", flush=True)
    jalankan(
        ["mintpy.cli.tropo_phase_elevation", "timeseries.h5", "-g", "inputs/geometryGeo.h5", "-m", "maskBukit.h5", "-o", "timeseries_tropHgt.h5"],
        kerja,
    )

    jalankan(["mintpy.cli.smallbaselineApp", str(cfg), "--start", "deramp"], kerja)


if __name__ == "__main__":
    main()
