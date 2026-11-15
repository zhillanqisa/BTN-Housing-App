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
- Titik referensi: stasiun GNSS acuan wilayah (Semarang: CSEM, stabil menurut Susilo dkk. 2023).
  Bila piksel stasiun tidak tersambung di semua interferogram, dipakai piksel andal terdekat
  dalam radius RADIUS_REF_PIKSEL.
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
import numpy as np
from pyproj import Transformer

from umum import CSEM_LALO, EPSG_UTM, LINTASAN, TINGGI_BUKIT_M, TROPOSFER, UNWRAP, MAKS_HARI_PASANGAN, dir_lintasan

MIN_KOHERENSI_TEMPORAL = 0.7
# Citra dibuang bila interferogram terbaiknya pun tersambung di bawah pecahan ini dari piksel darat.
# Interferogram normal di Semarang tersambung 60% ke atas; citra rusak sekitar 1%.
MIN_TERSAMBUNG = 0.2
# Bila piksel stasiun acuan tidak tersambung di semua interferogram: cari piksel andal dalam radius ini (80 m/piksel).
RADIUS_REF_PIKSEL = 6
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


def konfigurasi(
    lintasan: str,
    buang_tanggal: list[str],
    tropo: bool = TROPOSFER == "bukit",
    ref: tuple[float, float] = CSEM_LALO,
    buang_pasangan: list[str] | None = None,
) -> str:
    d = dir_lintasan(lintasan).as_posix()
    lat, lon = ref
    buang = ",".join(buang_tanggal) if buang_tanggal else "no"
    buang12 = ",".join(buang_pasangan) if buang_pasangan else "no"
    return f"""# Konfigurasi MintPy untuk PANTAU AMBLES, lintasan {lintasan}. Dibuat oleh pipeline/04_mintpy.py.
# Citra rusak (semua interferogramnya nyaris tanpa piksel tersambung), dicari otomatis oleh 04_mintpy.py.
mintpy.network.excludeDate = {buang}
# Pasangan yang baseline tegak lurusnya tidak terhitung di produk HyP3 ("Baseline: nan").
# Nilai NaN membuat inversi baseline MintPy gagal (SVD tidak konvergen), jadi pasangan ini dibuang.
mintpy.network.excludeDate12 = {buang12}
# Pasangan lebih lama dari ini tidak dipakai inversi (umum.py: maks_hari_pasangan).
mintpy.network.tempBaseMax = {MAKS_HARI_PASANGAN or 'auto'}

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
mintpy.troposphericDelay.method    = {"height_correlation" if tropo else "no"}
mintpy.deramp                      = no
# Koreksi galat unwrapping (umum.py: unwrap). phase_closure memakai triplet jaringan SBAS.
mintpy.unwrapError.method          = {UNWRAP}
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
    # waterMask.h5 baru dibuat MintPy di langkah sesudah load_data; pada olahan pertama ambil dari geometri
    if (kerja / "waterMask.h5").exists():
        with h5py.File(kerja / "waterMask.h5", "r") as h:
            darat = h["waterMask"][:].astype(bool)
    else:
        with h5py.File(kerja / "inputs" / "geometryGeo.h5", "r") as h:
            tinggi = h["height"][:]
            darat = h["waterMask"][:].astype(bool) if "waterMask" in h else tinggi == tinggi
    with h5py.File(kerja / "inputs" / "ifgramStack.h5", "r") as h:
        pasangan = [(a.decode(), b.decode()) for a, b in h["date"][:]]
        tersambung = [float((h["connectComponent"][i][darat] > 0).mean()) for i in range(len(pasangan))]
    terbaik: dict[str, float] = {}
    for (a, b), f in zip(pasangan, tersambung):
        for t in (a, b):
            terbaik[t] = max(terbaik.get(t, 0.0), f)
    return sorted(t for t, f in terbaik.items() if f < MIN_TERSAMBUNG)


def pasangan_tanpa_baseline(kerja: Path) -> list[str]:
    """Pasangan (YYYYMMDD_YYYYMMDD) yang baseline tegak lurusnya bukan bilangan hingga."""
    with h5py.File(kerja / "inputs" / "ifgramStack.h5", "r") as h:
        bperp = h["bperp"][:]
        pasangan = [f"{a.decode()}_{b.decode()}" for a, b in h["date"][:]]
    return [p for p, b in zip(pasangan, bperp) if not np.isfinite(b)]


def referensi_andal(kerja: Path, buang_tanggal: list[str], buang_pasangan: list[str] = ()) -> tuple[float, float]:
    """Titik acuan: piksel stasiun bila tersambung di semua interferogram, bila tidak piksel andal terdekat.

    Andal = komponen tersambung bukan nol di semua interferogram yang dipakai (syarat masker
    maskConnComp MintPy) dengan koherensi rata-rata tertinggi, sedikit dikurangi jarak.
    """
    lat, lon = CSEM_LALO
    with h5py.File(kerja / "inputs" / "ifgramStack.h5", "r") as h:
        at = dict(h.attrs)
        pasangan = [(a.decode(), b.decode()) for a, b in h["date"][:]]
        pakai = [i for i, (a, b) in enumerate(pasangan) if a not in buang_tanggal and b not in buang_tanggal and f"{a}_{b}" not in buang_pasangan]
        ny, nx = h["connectComponent"].shape[1:]
        sambung = np.ones((ny, nx), bool)
        koh = np.zeros((ny, nx), np.float64)
        for i in pakai:
            sambung &= h["connectComponent"][i] != 0
            koh += h["coherence"][i]
        koh /= max(1, len(pakai))
    x, y = Transformer.from_crs(4326, EPSG_UTM, always_xy=True).transform(lon, lat)
    x0, y0, dx, dy = (float(at[k]) for k in ("X_FIRST", "Y_FIRST", "X_STEP", "Y_STEP"))
    c, r = int((x - x0) / dx), int((y - y0) / dy)
    if sambung[r, c]:
        print(f"Acuan di piksel stasiun ({r}, {c}), koherensi rata-rata {koh[r, c]:.2f}.", flush=True)
        return lat, lon
    rr, cc = np.mgrid[max(0, r - RADIUS_REF_PIKSEL) : min(ny, r + RADIUS_REF_PIKSEL + 1), max(0, c - RADIUS_REF_PIKSEL) : min(nx, c + RADIUS_REF_PIKSEL + 1)]
    jarak = np.hypot(rr - r, cc - c)
    skor = np.where(sambung[rr, cc] & (jarak <= RADIUS_REF_PIKSEL), koh[rr, cc] - 0.01 * jarak, -np.inf)
    if not np.isfinite(skor.max()):
        raise SystemExit(f"Tidak ada piksel tersambung dalam {RADIUS_REF_PIKSEL} piksel dari stasiun acuan. Pilih acuan lain di umum.py.")
    k = np.unravel_index(np.argmax(skor), skor.shape)
    r2, c2 = int(rr[k]), int(cc[k])
    lon2, lat2 = Transformer.from_crs(EPSG_UTM, 4326, always_xy=True).transform(x0 + (c2 + 0.5) * dx, y0 + (r2 + 0.5) * dy)
    print(f"Piksel stasiun tidak tersambung di semua interferogram. Acuan dipindah {jarak[k] * abs(dx):.0f} m ke ({r2}, {c2}), koherensi rata-rata {koh[r2, c2]:.2f}.", flush=True)
    return float(lat2), float(lon2)


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
    tanpa_bl = pasangan_tanpa_baseline(kerja)
    print(f"Pasangan tanpa baseline yang dibuang: {', '.join(tanpa_bl) if tanpa_bl else 'tidak ada'}", flush=True)
    ref = referensi_andal(kerja, rusak, tanpa_bl)
    cfg.write_text(konfigurasi(a.lintasan, rusak, ref=ref, buang_pasangan=tanpa_bl), encoding="utf-8")
    jalankan(["mintpy.cli.smallbaselineApp", str(cfg), "--start", "modify_network", "--end", "correct_ionosphere"], kerja)

    for nama in (*TURUNAN_TROPOSFER, "timeseries_demErr.h5"):
        (kerja / nama).unlink(missing_ok=True)
    pakai_tropo = TROPOSFER == "bukit"
    if pakai_tropo:
        n_bukit = masker_bukit(kerja)
        if n_bukit < 1000:
            print(f"Hanya {n_bukit} piksel perbukitan yang andal: koreksi troposfer dilewati.", flush=True)
            pakai_tropo = False
        else:
            print(f"Koreksi troposfer ditaksir dari {n_bukit} piksel perbukitan (tinggi di atas {TINGGI_BUKIT_M:.0f} m).", flush=True)
            jalankan(
                ["mintpy.cli.tropo_phase_elevation", "timeseries.h5", "-g", "inputs/geometryGeo.h5", "-m", "maskBukit.h5", "-o", "timeseries_tropHgt.h5"],
                kerja,
            )
    else:
        print("Wilayah datar: koreksi troposfer korelasi-ketinggian tidak dipakai.", flush=True)
    if not pakai_tropo:
        cfg.write_text(konfigurasi(a.lintasan, rusak, tropo=False, ref=ref, buang_pasangan=tanpa_bl), encoding="utf-8")

    jalankan(["mintpy.cli.smallbaselineApp", str(cfg), "--start", "deramp"], kerja)


if __name__ == "__main__":
    main()
