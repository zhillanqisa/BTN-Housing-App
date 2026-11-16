"""Langkah 7c: lapis bahaya banjir dan bahaya gelombang ekstrem dan abrasi dari InaRISK BNPB.

Keluaran (format sama dengan lapis konteks lain di 07_konteks.py):
    data-raw/konteks/<wilayah>-bahaya-{banjir,abrasi}.shp   kelas bahaya di dalam wilayah
    public/data/<wilayah>-konteks-{banjir,abrasi}.geojson   sama, dengan statistik laju per kelas

Jalankan sesudah 06_ekspor.py (statistik membaca grid laju aplikasi):
    PA_WILAYAH=semarang python pipeline/07c_bahaya.py

Sumber (dicek 16 November 2026): layanan ArcGIS ImageServer InaRISK di gis.bnpb.go.id, grid 100 m
EPSG:3395, nilai indeks 0 sampai 1. Raster diambil di grid aslinya (tanpa resampling), lalu dibagi
menjadi tiga kelas BNPB dan diubah menjadi poligon. BNPB tidak mencantumkan lisensi pemakaian ulang,
jadi lapis ini ditampilkan dengan atribusi sebagai konteks, bukan sebagai penentu kategori.
"""

from __future__ import annotations

import importlib
from datetime import date

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import requests
from pyproj import Transformer
from rasterio import features
from scipy import ndimage
from shapely.geometry import Polygon, shape
from shapely.ops import unary_union

from umum import EPSG_UTM, NAMA_WILAYAH, WILAYAH

konteks = importlib.import_module("07_konteks")
UA, KONTEKS, KELUAR = konteks.UA, konteks.KONTEKS, konteks.KELUAR

DASAR = "https://gis.bnpb.go.id/server/rest/services/inarisk"
# Pembagian kelas indeks bahaya BNPB. Nilai tepat 0,333 di layanan termasuk rendah.
BATAS_KELAS = (0.3335, 0.6665)

LAPIS = {
    "banjir": {
        "layanan": "INDEKS_BAHAYA_BANJIR",
        "judul": "Indeks bahaya banjir (InaRISK BNPB)",
        "warna": {"rendah": "#9fd3e6", "sedang": "#3f8fc4", "tinggi": "#1d4f91"},
        "catatan": (
            "Indeks bahaya banjir InaRISK adalah hasil pemodelan nasional pada grid 100 m, bukan catatan kejadian banjir. "
            "Rob tidak dimodelkan sebagai lapis tersendiri. Riwayat genangan di satu jalan tetap perlu ditanyakan ke warga, "
            "pengembang, atau BPBD setempat."
        ),
    },
    "abrasi": {
        "layanan": "layer_bahaya_gelombang_ekstrim_dan_abrasi",
        "judul": "Indeks bahaya gelombang ekstrem dan abrasi (InaRISK BNPB)",
        "warna": {"rendah": "#f2d29b", "sedang": "#e08a3c", "tinggi": "#a8461d"},
        "catatan": (
            "Bahaya gelombang ekstrem dan abrasi hanya dipetakan di jalur pantai. Lapis ini hasil pemodelan nasional pada grid 100 m, "
            "bukan pengukuran garis pantai terbaru."
        ),
    },
}
NAMA_KELAS = {"rendah": "Rendah", "sedang": "Sedang", "tinggi": "Tinggi"}


def unduh(layanan: str) -> tuple[np.ndarray, rasterio.Affine]:
    """Indeks bahaya di kotak wilayah, di grid asli layanan (EPSG:3395, 100 m). Disimpan sebagai cache."""
    tujuan = KONTEKS / f"inarisk-{layanan}.tif"
    if not tujuan.exists():
        info = requests.get(f"{DASAR}/{layanan}/ImageServer", params={"f": "json"}, headers=UA, timeout=60).json()
        ox, oy, px = info["extent"]["xmin"], info["extent"]["ymax"], info["pixelSizeX"]
        t = Transformer.from_crs(4326, 3395, always_xy=True)
        barat, selatan, timur, utara = konteks.KOTAK
        x0, y0 = t.transform(barat, selatan)
        x1, y1 = t.transform(timur, utara)
        # kotak dipaskan ke garis grid layanan supaya piksel tidak diresampel
        xmin = ox + np.floor((x0 - ox) / px) * px
        xmax = ox + np.ceil((x1 - ox) / px) * px
        ymax = oy - np.floor((oy - y1) / px) * px
        ymin = oy - np.ceil((oy - y0) / px) * px
        lebar, tinggi = int(round((xmax - xmin) / px)), int(round((ymax - ymin) / px))
        r = requests.get(
            f"{DASAR}/{layanan}/ImageServer/exportImage",
            params={
                "bbox": f"{xmin},{ymin},{xmax},{ymax}",
                "bboxSR": 3395,
                "imageSR": 3395,
                "size": f"{lebar},{tinggi}",
                "format": "tiff",
                "pixelType": "F32",
                "noData": -1,
                "interpolation": "RSP_NearestNeighbor",
                "f": "json",
            },
            headers=UA,
            timeout=180,
        )
        r.raise_for_status()
        isi = requests.get(r.json()["href"], headers=UA, timeout=180)
        isi.raise_for_status()
        tujuan.write_bytes(isi.content)
    with rasterio.open(tujuan) as ds:
        if ds.crs.to_epsg() != 3395:
            raise SystemExit(f"{tujuan.name}: CRS {ds.crs} tidak terduga")
        return ds.read(1), ds.transform


def kelaskan(nilai: np.ndarray) -> np.ndarray:
    """0 = tidak ada bahaya atau di luar data; 1 rendah, 2 sedang, 3 tinggi."""
    k = np.zeros(nilai.shape, dtype="uint8")
    ada = nilai > 0
    k[ada] = 1 + (nilai[ada] >= BATAS_KELAS[0]).astype("uint8") + (nilai[ada] >= BATAS_KELAS[1]).astype("uint8")
    return k


# Penghalusan batas kelas. Raster 100 m diperbesar 4 kali (25 m), lalu tiap tingkat kumulatif
# (>= rendah, >= sedang, >= tinggi) dikaburkan dan dipotong di 0,5. Sudut kotak menjadi bulat tetapi
# batasnya tetap di tepi piksel asli, dan karena tingkat kumulatif bersarang, batas kelas yang
# bersinggungan tetap sama persis: tidak ada celah atau tumpang tindih palsu di antara kelas.
PERBESAR = 4
SIGMA = 2.0  # dalam piksel hasil perbesaran, sekitar 50 m
TOLERANSI_M = 15
TOLERANSI_AKHIR_M = 3  # sesudah Chaikin: membuang titik yang hampir segaris, kurva tetap halus di zoom 15
LUAS_MIN_HA = 1.0


def _chaikin_cincin(xy: np.ndarray, ulang: int) -> np.ndarray:
    for _ in range(ulang):
        p = xy[:-1]
        q = np.roll(p, -1, axis=0)
        baru = np.empty((len(p) * 2, 2))
        baru[0::2] = 0.75 * p + 0.25 * q
        baru[1::2] = 0.25 * p + 0.75 * q
        xy = np.vstack([baru, baru[:1]])
    return xy


def chaikin(g, ulang: int = 2):
    """Haluskan sudut poligon dengan pemotongan sudut Chaikin (bentuk tetap, tangga piksel hilang)."""
    if g.is_empty:
        return g
    if g.geom_type == "Polygon":
        if len(g.exterior.coords) < 4:
            return g
        luar = _chaikin_cincin(np.asarray(g.exterior.coords)[:, :2], ulang)
        dalam = [_chaikin_cincin(np.asarray(r.coords)[:, :2], ulang) for r in g.interiors if len(r.coords) >= 4]
        return Polygon(luar, dalam).buffer(0)
    if g.geom_type in ("MultiPolygon", "GeometryCollection"):
        return unary_union([chaikin(x, ulang) for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")])
    return g


def tingkat_halus(kelas: np.ndarray, tr: rasterio.Affine) -> tuple[list[np.ndarray], rasterio.Affine]:
    besar = np.repeat(np.repeat(kelas, PERBESAR, axis=0), PERBESAR, axis=1)
    tr_besar = tr * rasterio.Affine.scale(1 / PERBESAR)
    tingkat = [ndimage.gaussian_filter((besar >= k).astype("float32"), SIGMA) >= 0.5 for k in (1, 2, 3)]
    return tingkat, tr_besar


def poligon_tingkat(m: np.ndarray, tr: rasterio.Affine, batas_kota):
    if not m.any():
        return Polygon()
    bentuk = [shape(g) for g, _ in features.shapes(m.astype("uint8"), mask=m, transform=tr)]
    u = gpd.GeoSeries([unary_union(bentuk)], crs=3395).to_crs(EPSG_UTM).iloc[0]
    # tangga 25 m disederhanakan dulu, sudutnya dipotong Chaikin, lalu titik yang hampir segaris dibuang
    u = chaikin(u.simplify(TOLERANSI_M, preserve_topology=True), ulang=2).simplify(TOLERANSI_AKHIR_M, preserve_topology=True)
    return u.intersection(batas_kota)


def bersihkan(g):
    """Buang serpihan tipis di tepi kelas (sisa penghalusan) dan bagian yang terlalu kecil."""
    g = g.buffer(-2, join_style="mitre").buffer(2, join_style="mitre").simplify(TOLERANSI_AKHIR_M, preserve_topology=True)
    bagian = [p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and p.area >= LUAS_MIN_HA * 10_000]
    return unary_union(bagian) if bagian else Polygon()


def olah(jenis: str, kota: gpd.GeoDataFrame) -> gpd.GeoDataFrame | None:
    a = LAPIS[jenis]
    nilai, tr = unduh(a["layanan"])
    kelas = kelaskan(nilai)
    if not kelas.any():
        return None
    batas_kota = kota.geometry.union_all()
    tingkat, tr_besar = tingkat_halus(kelas, tr)
    s1, s2, s3 = (poligon_tingkat(m, tr_besar, batas_kota) for m in tingkat)
    # pastikan bersarang setelah penghalusan, lalu pecah menjadi kelas yang tidak saling tumpang
    s2 = s2.intersection(s1)
    s3 = s3.intersection(s2)
    eksklusif = {"tinggi": s3, "sedang": s2.difference(s3), "rendah": s1.difference(s2)}
    baris = []
    for kode, geom in eksklusif.items():
        geom = bersihkan(geom)
        if not geom.is_empty:
            baris.append({"KODE": kode, "NAMA": NAMA_KELAS[kode], "WARNA": a["warna"][kode], "geometry": geom})
    if not baris:
        return None
    # kelas tertinggi lebih dulu: di tepi kelas yang bersinggungan, titik dibaca sebagai kelas yang lebih tinggi
    return gpd.GeoDataFrame(baris, crs=EPSG_UTM)


def meta(jenis: str, g: gpd.GeoDataFrame) -> dict:
    a = LAPIS[jenis]
    luas = {k: round(float(v), 1) for k, v in (g.set_index("KODE").geometry.area / 1e6).items()}
    print(f"{jenis}: luas per kelas di {NAMA_WILAYAH} (km2) {luas}")
    return {
        "judul": a["judul"],
        "jenis": "resmi",
        "skala": "100 m per piksel",
        "sumber": [
            {
                "nama": f"InaRISK BNPB, layanan {a['layanan']}",
                "url": "https://inarisk.bnpb.go.id/",
                "catatan": (
                    f"Diunduh {date.today().isoformat()} dari ArcGIS ImageServer gis.bnpb.go.id. "
                    "BNPB tidak mencantumkan lisensi pemakaian ulang; ditampilkan dengan atribusi sebagai konteks."
                ),
            }
        ],
        "catatan": a["catatan"],
        "aturan": "Kelas mengikuti pembagian indeks bahaya BNPB: rendah sampai 0,333, sedang sampai 0,666, tinggi di atasnya. Indeks 0 tidak ditampilkan.",
    }


def main() -> None:
    KONTEKS.mkdir(parents=True, exist_ok=True)
    if not (KELUAR / f"{WILAYAH}-grid.json").exists():
        print(f"{WILAYAH}: grid laju belum diekspor (06_ekspor.py), lapis bahaya dilewati")
        return
    kota = konteks.kota_utm()
    for jenis in LAPIS:
        g = olah(jenis, kota)
        if g is None:
            print(f"{jenis}: tidak ada kelas bahaya di dalam {NAMA_WILAYAH}, lapis tidak dibuat")
            (KELUAR / f"{WILAYAH}-konteks-{jenis}.geojson").unlink(missing_ok=True)
            continue
        # legenda dan tabel mengikuti urutan kelas (rendah ke tinggi), bukan luas
        urut = {"rendah": 0, "sedang": 1, "tinggi": 2}
        stat = sorted(konteks.statistik(g, "NAMA", "KODE"), key=lambda s: urut[s["kode"]])
        konteks.tulis(g, f"bahaya-{jenis}", jenis, meta(jenis, g), {"kode": "KODE", "nama": "NAMA", "warna": "WARNA"}, stat)


if __name__ == "__main__":
    pd.options.mode.copy_on_write = True
    main()
