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
import io
import json
import math
import shutil
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import hyp3_sdk as sdk
import requests
from osgeo import gdal, osr
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from umum import AOI_KOTA, BANTALAN_M, EPSG_UTM, KERJA, LINTASAN, PIKSEL_M, PROYEK_HYP3, TITIK_KOTAK, dir_lintasan

gdal.UseExceptions()

JENIS_JOB = "INSAR_ISCE_MULTI_BURST"
KUNCI_GEOM = threading.Lock()
PITA_IFG = ("unw_phase", "corr", "conncomp")
PITA_GEOM = ("dem", "lv_theta", "lv_phi", "water_mask")


def kotak_utm() -> tuple[float, float, float, float]:
    """Kotak batas wilayah (ditambah titik ikat dan stasiun pembanding) dalam UTM, diberi bantalan dan dibulatkan keluar ke kelipatan piksel."""
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
    # titik ikat dan stasiun GNSS pembanding harus ikut terpotong
    for lat_t, lon_t in TITIK_KOTAK:
        lon.append(lon_t)
        lat.append(lat_t)
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


class _Rentang(io.RawIOBase):
    """Berkas di server yang dibaca per rentang byte (HTTP Range). Dengan ini zipfile hanya mengambil
    direktori pusat zip dan anggota yang diminta, bukan seluruh zip."""

    def __init__(self, url: str, ukuran: int):
        self.url, self.n, self.pos = url, ukuran, 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.n + offset
        return self.pos

    def readinto(self, b) -> int:
        k = min(len(b), self.n - self.pos)
        if k <= 0:
            return 0
        r = _sesi().get(self.url, headers={"Range": f"bytes={self.pos}-{self.pos + k - 1}"}, timeout=120)
        r.raise_for_status()
        if r.status_code != 206:
            raise RuntimeError(f"server tidak melayani permintaan Range (HTTP {r.status_code})")
        data = r.content
        b[: len(data)] = data
        self.pos += len(data)
        return len(data)


_LOKAL = threading.local()


def _sesi() -> requests.Session:
    """Satu sesi HTTP per utas (koneksi dipakai ulang), diulang otomatis bila koneksi tersendat."""
    if not hasattr(_LOKAL, "sesi"):
        s = requests.Session()
        s.headers["User-Agent"] = "pantau-ambles-demo-build/0.1"
        ulang = Retry(total=6, backoff_factor=3, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("GET",))
        s.mount("https://", HTTPAdapter(max_retries=ulang))
        _LOKAL.sesi = s
    return _LOKAL.sesi


def ekstrak_sebagian(url: str, ukuran: int, tujuan: Path, produk: str, pita: tuple[str, ...]) -> None:
    """Ambil dari zip di server hanya pita yang diminta dan metadata .txt, ke tujuan/<produk>/.
    CRC tiap anggota diperiksa zipfile saat dibaca sampai habis."""
    perlu = {f"{produk}/{produk}_{p}.tif" for p in pita} | {f"{produk}/{produk}.txt"}
    with zipfile.ZipFile(_Rentang(url, ukuran)) as z:
        for info in z.infolist():
            if info.filename not in perlu:
                continue
            keluar = tujuan / info.filename
            keluar.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(keluar, "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)


def basis_gdal(sumber: Path) -> str:
    """Induk folder produk untuk GDAL: zip lokal dibaca lewat /vsizip, hasil ekstrak sebagian dibaca biasa."""
    return f"/vsizip/{sumber.as_posix()}" if sumber.suffix == ".zip" else sumber.as_posix()


def potong(sumber: Path, produk: str, pita: str, tujuan: Path, kotak) -> bool:
    """Potong satu pita dari zip lokal atau folder hasil ekstrak sebagian. False bila pita tidak ada."""
    jalur = f"{basis_gdal(sumber)}/{produk}/{produk}_{pita}.tif"
    try:
        ds = gdal.Open(jalur)
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


def baca_txt(sumber: Path, produk: str) -> bytes:
    if sumber.suffix == ".zip":
        with zipfile.ZipFile(sumber) as z:
            return z.read(f"{produk}/{produk}.txt")
    return (sumber / produk / f"{produk}.txt").read_bytes()


def sudah_ada(folder: Path, produk: str) -> bool:
    return (folder / f"{produk}.txt").exists() and all((folder / f"{produk}_{p}_clip.tif").exists() for p in ("unw_phase", "corr"))


def hapus_sumber(sumber: Path) -> None:
    if sumber.suffix == ".zip":
        sumber.unlink(missing_ok=True)
    else:
        shutil.rmtree(sumber, ignore_errors=True)


def olah_job(job, lintasan: str, kotak, unduhan: Path, langsung: bool = False) -> str:
    berkas = job.files[0]["filename"]
    produk = berkas.removesuffix(".zip")
    folder = dir_lintasan(lintasan) / "hyp3" / produk
    if sudah_ada(folder, produk):
        return "lewati"
    geom = dir_lintasan(lintasan) / "geom"
    sumber = unduhan / berkas
    if not sumber.exists() and langsung:
        # hanya pita yang dipakai MintPy (sekitar 17% isi zip); pita geometri hanya bila lintasan ini belum punya
        sumber = unduhan / produk
        pita = PITA_IFG + (() if any(geom.glob("*_dem_clip.tif")) else PITA_GEOM)
        shutil.rmtree(sumber, ignore_errors=True)
        try:
            ekstrak_sebagian(job.files[0]["url"], job.files[0]["size"], sumber, produk, pita)
        except Exception:
            shutil.rmtree(sumber, ignore_errors=True)
            raise
    elif not sumber.exists():
        try:
            sumber = job.download_files(unduhan)[0]
        except Exception:
            # unduhan terputus meninggalkan zip setengah jadi: hapus supaya putaran berikut mengunduh ulang
            (unduhan / berkas).unlink(missing_ok=True)
            raise
    sementara = folder.with_name(folder.name + ".tmp")
    shutil.rmtree(sementara, ignore_errors=True)
    sementara.mkdir(parents=True)
    try:
        for pita in PITA_IFG:
            ada = potong(sumber, produk, pita, sementara, kotak)
            if not ada and pita != "conncomp":
                raise RuntimeError(f"{produk}: pita {pita} tidak ada di zip")
        (sementara / f"{produk}.txt").write_bytes(baca_txt(sumber, produk))
        # geometri cukup dari satu produk per lintasan; dikunci supaya unduhan bersamaan tidak menulis ganda
        with KUNCI_GEOM:
            geom.mkdir(exist_ok=True)
            if not any(geom.glob("*_dem_clip.tif")):
                for pita in PITA_GEOM:
                    potong(sumber, produk, pita, geom, kotak)
                shutil.copy(sementara / f"{produk}.txt", geom / f"{produk}.txt")
        shutil.rmtree(folder, ignore_errors=True)
        sementara.rename(folder)
    except Exception:
        shutil.rmtree(sementara, ignore_errors=True)
        # sumber yang tidak terbaca (mis. sisa unduhan terputus) dihapus dan diambil ulang di putaran berikut
        hapus_sumber(sumber)
        raise
    hapus_sumber(sumber)
    return "baru"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), required=True)
    ap.add_argument("--pekerja", type=int, default=3, help="jumlah unduhan bersamaan")
    ap.add_argument("--langsung", action="store_true", help="ambil dari zip di server hanya pita yang dipakai, lewat HTTP Range (hemat kuota sekitar 80%%)")
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
        tugas = {ex.submit(olah_job, j, a.lintasan, kotak, unduhan, a.langsung): j for j in sukses}
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
