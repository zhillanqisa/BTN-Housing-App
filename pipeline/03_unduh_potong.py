"""Langkah 3: unduh produk HyP3 yang selesai dan potong ke wilayah kota.

Untuk tiap job yang sukses: unduh zip, ambil pita yang dibutuhkan MintPy, potong ke
kotak batas kota (grid UTM 80 m yang sama untuk semua produk), simpan metadata .txt,
lalu hapus zip. Aman diulang: produk yang sudah dipotong dilewati.

Jalankan:
    python pipeline/03_unduh_potong.py --lintasan desc
    python pipeline/03_unduh_potong.py --lintasan asc --pekerja 4

Keluaran di folder kerja:
    <lintasan>/hyp3/<produk>/<produk>_{unw_phase,corr,conncomp}_clip.tif + <produk>.txt
    <lintasan>/geom/<produk>_{dem,lv_theta,lv_phi,water_mask}_clip.tif + <produk>.txt  (satu produk saja)
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import hyp3_sdk as sdk
from osgeo import gdal, osr

from umum import AOI_KOTA, BANTALAN_M, EPSG_UTM, KERJA, LINTASAN, PIKSEL_M, PROYEK_HYP3, dir_lintasan

gdal.UseExceptions()

JENIS_JOB = "INSAR_ISCE_MULTI_BURST"
KUNCI_GEOM = threading.Lock()
PITA_IFG = ("unw_phase", "corr", "conncomp")
PITA_GEOM = ("dem", "lv_theta", "lv_phi", "water_mask")


def kotak_utm() -> tuple[float, float, float, float]:
    """Kotak batas kota dalam UTM (xmin, ymin, xmax, ymax), diberi bantalan dan dibulatkan keluar ke kelipatan piksel."""
    gj = json.loads(AOI_KOTA.read_text(encoding="utf-8"))
    lon: list[float] = []
    lat: list[float] = []

    def kumpul(c):
        if isinstance(c[0], (int, float)):
            lon.append(c[0])
            lat.append(c[1])
        else:
            for x in c:
                kumpul(x)

    for f in gj["features"]:
        kumpul(f["geometry"]["coordinates"])
    wgs = osr.SpatialReference()
    wgs.ImportFromEPSG(4326)
    wgs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    utm = osr.SpatialReference()
    utm.ImportFromEPSG(EPSG_UTM)
    ke_utm = osr.CoordinateTransformation(wgs, utm)
    sudut = [ke_utm.TransformPoint(x, y)[:2] for x in (min(lon), max(lon)) for y in (min(lat), max(lat))]
    xs = [p[0] for p in sudut]
    ys = [p[1] for p in sudut]
    bawah = lambda v: math.floor((v - BANTALAN_M) / PIKSEL_M) * PIKSEL_M  # noqa: E731
    atas = lambda v: math.ceil((v + BANTALAN_M) / PIKSEL_M) * PIKSEL_M  # noqa: E731
    return bawah(min(xs)), bawah(min(ys)), atas(max(xs)), atas(max(ys))


def potong(zip_path: Path, produk: str, pita: str, tujuan: Path, kotak) -> bool:
    """Potong satu pita langsung dari zip. False bila pita tidak ada di zip."""
    sumber = f"/vsizip/{zip_path.as_posix()}/{produk}/{produk}_{pita}.tif"
    try:
        ds = gdal.Open(sumber)
    except RuntimeError:
        return False
    gt = ds.GetGeoTransform()
    if abs(gt[1] - PIKSEL_M) > 1e-6 or gt[0] % PIKSEL_M or gt[3] % PIKSEL_M:
        raise RuntimeError(f"{produk}: grid tidak sejajar pada kelipatan {PIKSEL_M} m (asal {gt[0]}, {gt[3]}; piksel {gt[1]})")
    # grid sumber sejajar, jadi 'near' di sini hanya menyalin piksel tanpa menggeser nilainya
    gdal.Warp(
        str(tujuan / f"{produk}_{pita}_clip.tif"),
        ds,
        outputBounds=kotak,
        xRes=PIKSEL_M,
        yRes=PIKSEL_M,
        resampleAlg="near",
        creationOptions=["COMPRESS=DEFLATE", "TILED=YES"],
    )
    return True


def sudah_ada(folder: Path, produk: str) -> bool:
    return (folder / f"{produk}.txt").exists() and all((folder / f"{produk}_{p}_clip.tif").exists() for p in ("unw_phase", "corr"))


def olah_job(job, lintasan: str, kotak, unduhan: Path) -> str:
    berkas = job.files[0]["filename"]
    produk = berkas.removesuffix(".zip")
    folder = dir_lintasan(lintasan) / "hyp3" / produk
    if sudah_ada(folder, produk):
        return "lewati"
    zip_path = unduhan / berkas
    if not zip_path.exists():
        zip_path = job.download_files(unduhan)[0]
    sementara = folder.with_name(folder.name + ".tmp")
    shutil.rmtree(sementara, ignore_errors=True)
    sementara.mkdir(parents=True)
    try:
        for pita in PITA_IFG:
            ada = potong(zip_path, produk, pita, sementara, kotak)
            if not ada and pita != "conncomp":
                raise RuntimeError(f"{produk}: pita {pita} tidak ada di zip")
        with zipfile.ZipFile(zip_path) as z:
            (sementara / f"{produk}.txt").write_bytes(z.read(f"{produk}/{produk}.txt"))
        # geometri cukup dari satu produk per lintasan; dikunci supaya unduhan bersamaan tidak menulis ganda
        geom = dir_lintasan(lintasan) / "geom"
        with KUNCI_GEOM:
            geom.mkdir(exist_ok=True)
            if not any(geom.glob("*_dem_clip.tif")):
                for pita in PITA_GEOM:
                    potong(zip_path, produk, pita, geom, kotak)
                shutil.copy(sementara / f"{produk}.txt", geom / f"{produk}.txt")
        shutil.rmtree(folder, ignore_errors=True)
        sementara.rename(folder)
    except Exception:
        shutil.rmtree(sementara, ignore_errors=True)
        raise
    zip_path.unlink()
    return "baru"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), required=True)
    ap.add_argument("--pekerja", type=int, default=3, help="jumlah unduhan bersamaan")
    a = ap.parse_args()

    kotak = kotak_utm()
    lebar = int((kotak[2] - kotak[0]) / PIKSEL_M)
    tinggi = int((kotak[3] - kotak[1]) / PIKSEL_M)
    print(f"Kotak potong UTM: {kotak} = {lebar} x {tinggi} piksel")

    hyp3 = sdk.HyP3()
    job = list(hyp3.find_jobs(name=f"{PROYEK_HYP3}-{a.lintasan}", job_type=JENIS_JOB))
    sukses = [j for j in job if j.status_code == "SUCCEEDED" and not j.expired()]
    kedaluwarsa = sum(1 for j in job if j.status_code == "SUCCEEDED" and j.expired())
    print(f"Job {a.lintasan}: {len(job)} total, {len(sukses)} siap diunduh, {kedaluwarsa} kedaluwarsa, {sum(1 for j in job if j.status_code == 'FAILED')} gagal, {sum(1 for j in job if j.status_code in ('RUNNING', 'PENDING'))} masih diproses")

    unduhan = KERJA / "unduhan"
    unduhan.mkdir(parents=True, exist_ok=True)
    hasil = {"baru": 0, "lewati": 0, "galat": 0}
    with ThreadPoolExecutor(max_workers=a.pekerja) as ex:
        tugas = {ex.submit(olah_job, j, a.lintasan, kotak, unduhan): j for j in sukses}
        for n, t in enumerate(as_completed(tugas), 1):
            try:
                hasil[t.result()] += 1
            except Exception as e:  # satu produk rusak tidak boleh menghentikan sisanya; dicatat dan dilaporkan
                hasil["galat"] += 1
                print(f"  GALAT {tugas[t].files[0]['filename']}: {e}")
            if n % 50 == 0:
                print(f"  {n}/{len(sukses)}")
    total = len(list((dir_lintasan(a.lintasan) / "hyp3").glob("*/*_unw_phase_clip.tif")))
    print(f"Selesai. Baru {hasil['baru']}, dilewati {hasil['lewati']}, galat {hasil['galat']}. Produk terpotong di disk: {total}.")
    if hasil["galat"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
