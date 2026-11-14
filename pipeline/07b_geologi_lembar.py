"""Langkah 7b: digitasi Peta Geologi PSG 1:100.000 untuk Jakarta, Pekalongan, dan Demak.

Semarang punya skrip sendiri (07a) karena aturannya disetel khusus Lembar Magelang dan Semarang.
Skrip ini umum: tiap lembar dijelaskan di LEMBAR (bingkai, letak kotak legenda, satuan yang
mungkin muncul di wilayah), tiap wilayah memakai satu atau beberapa lembar.

Raster diunduh dari GeoMap Badan Geologi (perlu akun) dan TIDAK disimpan di repo. Letakkan di
<PA_OLAH>/konteks/mentah/ dengan nama di LEMBAR[...]["berkas"]. Lisensi GeoMap: boleh dipakai dengan
menyebut sumber PSG, tidak untuk diperjualbelikan.

Cara kerja per lembar:
1. Sudut bingkai dicari otomatis di sekitar perkiraan letaknya (garis bingkai hitam), lalu
   georeferensi dari empat sudut dan warp ke UTM dengan piksel PIKSEL m.
2. Warna acuan tiap satuan diambil dari kotak legenda di lembar yang sama (median piksel yang
   bukan huruf atau garis tepi), jadi tidak ada warna yang disetel tangan.
3. Tiap piksel diberi satuan dengan warna terdekat (CIELAB) di antara satuan yang boleh muncul.
   Piksel yang jauh dari semua warna (huruf, garis, simbol kota, sungai) dikosongkan.
4. Pita tipis dibuang dengan opening, celah diisi satuan terdekat, modus 5 x 5, poligon kecil digabung.
Hasil semua lembar digabung, dipotong ke batas wilayah, dan ditulis sebagai
data-raw/konteks/<wilayah>-geologi-psg-100k.shp (KODE, NAMA, BATUAN, SIFAT, WARNA) beserta
berkas .json pendamping berisi judul, sumber, dan aturan untuk 07_konteks.py.

Jalankan:
    PA_WILAYAH=jakarta python pipeline/07b_geologi_lembar.py --cek   # gambar periksa saja
    PA_WILAYAH=jakarta python pipeline/07b_geologi_lembar.py
    PA_WILAYAH=jakarta python pipeline/07_konteks.py
"""
from __future__ import annotations

import argparse
import json
import sys

import geopandas as gpd
import numpy as np
import rasterio
from osgeo import gdal, osr
from PIL import Image
from pyproj import Transformer
from rasterio import features
from scipy import ndimage
from shapely.geometry import shape

from umum import AOI_KOTA, EPSG_UTM, OLAH, REPO, WILAYAH

gdal.UseExceptions()
Image.MAX_IMAGE_PIXELS = None

MENTAH = OLAH / "konteks" / "mentah"
KERJA = OLAH / "konteks" / WILAYAH
KELUAR = REPO / "data-raw" / "konteks" / f"{WILAYAH}-geologi-psg-100k.shp"
PIKSEL = 20.0
JARAK_MAKS = 16.0  # beda warna CIELAB terbesar yang masih dianggap satu satuan
LUAS_MIN_HA = 5
# Warna acuan diperhalus dari piksel peta yang paling mirip warna legenda (cetakan peta dan kotak legenda
# bisa sedikit beda). Geseran dari warna legenda dibatasi supaya tidak menyerap satuan lain.
GESER_MAKS = 8.0
CARI_SUDUT = 160  # jendela pencarian garis bingkai di sekitar perkiraan sudut (piksel raster asli)

# Sudut: (kolom, baris) perkiraan di raster asli, urutan kiri-atas, kanan-atas, kiri-bawah, kanan-bawah.
# Bingkai: bujur barat/timur, lintang utara/selatan. utara None = dihitung dari perbandingan sisi bingkai.
# Legenda: kotak warna satuan (kolom0, baris0, kolom1, baris1) di raster asli.
LEMBAR: dict[str, dict] = {
    "jakarta": {
        "berkas": "peta_geologi_jakarta_100k.jpg",
        "judul": "Peta Geologi Lembar Jakarta dan Kepulauan Seribu, Jawa",
        "pustaka": "Turkandi, Sidarto, Agustiyanto dan Purbo Hadiwidjoyo (1992), Peta Geologi Lembar Jakarta dan Kepulauan Seribu, Jawa, skala 1:100.000, Pusat Penelitian dan Pengembangan Geologi",
        "bingkai": (106.5, 107.0, -6.0, -6.5),
        "sudut": [(200, 414), (5771, 414), (200, 6036), (5762, 6015)],
        "legenda": {
            "Qa": (8498, 1929, 8617, 1985),
            "Qbr": (8498, 2025, 8617, 2078),
            "Qav": (8498, 2153, 8617, 2205),
            "Ql": (8498, 2258, 8617, 2313),
            "QTvb": (8498, 2673, 8617, 2729),
        },
    },
    "banjarnegara": {
        "berkas": "peta_geologi_banjarnegara_pekalongan_100k.jpg",
        "judul": "Peta Geologi Lembar Banjarnegara dan Pekalongan, Jawa",
        "pustaka": "Condon, Pardyanto, Ketner, Amin, Gafoer dan Samodra (1996), Peta Geologi Lembar Banjarnegara dan Pekalongan, Jawa, skala 1:100.000, Pusat Penelitian dan Pengembangan Geologi",
        "bingkai": (109.5, 110.0, -(6 + 47.5 / 60), -7.5),
        "sudut": [(167, 305), (5599, 274), (212, 7970), (5640, 7940)],
        "legenda": {
            "Qa": (5706, 1731, 5803, 1773),
            "Qf": (5706, 2200, 5803, 2246),
            "Qla": (5706, 2273, 5803, 2316),
        },
    },
    "kudus": {
        "berkas": "peta_geologi_kudus_100k.jpg",
        "judul": "Peta Geologi Lembar Kudus, Jawa",
        "pustaka": "Suwarti dan Wikarno (1992), Peta Geologi Lembar Kudus, Jawa, skala 1:100.000, Pusat Penelitian dan Pengembangan Geologi",
        # Batas utara bingkai tidak bulat (lembar diperpanjang ke utara). Dihitung dari tanda 6°25' di sisi
        # kanan bingkai (baris 809, sudut atas 414, sudut bawah 6916): 6°22,74' LS.
        "bingkai": (110.5, 111.0, -(6 + 22.74 / 60), -7.0),
        "sudut": [(333, 436), (5610, 411), (373, 6926), (5650, 6901)],
        "legenda": {
            "Qa": (1814, 7947, 1934, 8000),
            "Qvtm": (1814, 8163, 1934, 8211),
        },
    },
    "salatiga": {
        "berkas": "peta_geologi_salatiga_100k.jpg",
        "judul": "Peta Geologi Lembar Salatiga, Jawa",
        "pustaka": "Sukardi dan Budhitrisna (1992), Peta Geologi Lembar Salatiga, Jawa, skala 1:100.000, Pusat Penelitian dan Pengembangan Geologi",
        "bingkai": (110.5, 111.0, -7.0, -7.5),
        "sudut": [(328, 314), (5544, 300), (330, 5490), (5544, 5476)],
        "legenda": {
            "Qa": (439, 7950, 549, 8012),
            "Tmpk": (1981, 7118, 2081, 7180),
            "Tmkk": (1981, 7437, 2081, 7501),
            "Tmkd": (1981, 7593, 2081, 7657),
            "Tmkb": (1981, 7743, 2081, 7809),
        },
    },
}

# Satuan yang boleh muncul di tiap wilayah, per lembar. Satuan lain di lembar itu berada jauh dari wilayah.
WILAYAH_LEMBAR: dict[str, list[tuple[str, list[str]]]] = {
    "jakarta": [("jakarta", ["Qa", "Qbr", "Qav", "QTvb"])],
    "pekalongan": [("banjarnegara", ["Qa", "Qf"])],
    "demak": [("kudus", ["Qa", "Qvtm"]), ("salatiga", ["Qa", "Tmpk", "Tmkk", "Tmkd", "Tmkb"])],
}

SATUAN: dict[str, dict[str, str]] = {
    "Qa": {
        "nama": "Aluvium",
        "batuan": "Endapan sungai, pantai, dan rawa: lempung, lanau, pasir, dan kerikil",
        "sifat": "Endapan muda dan lunak, mudah memampat saat dibebani bangunan dan saat air tanah disedot.",
        "warna": "#efdf96",
    },
    "Qbr": {
        "nama": "Endapan Pematang Pantai",
        "batuan": "Pasir halus sampai kasar, terpilah baik, dengan cangkang moluska",
        "sifat": "Pasir lebih padat daripada lempung aluvium, tetapi lapisan lempung di bawahnya tetap bisa memampat.",
        "warna": "#f2c46b",
    },
    "Qav": {
        "nama": "Kipas Aluvium",
        "batuan": "Tuf halus berlapis, tuf pasiran, berselingan dengan tuf konglomeratan",
        "sifat": "Endapan gunungapi yang lebih tua dan lebih padat dari aluvium, amblesannya kecil.",
        "warna": "#e3b7a6",
    },
    "Qf": {
        "nama": "Kipas Aluvium",
        "batuan": "Terutama bahan rombakan gunungapi, sudah tersayat sungai",
        "sifat": "Lebih padat dari aluvium pantai, amblesannya kecil.",
        "warna": "#e3b7a6",
    },
    "QTvb": {
        "nama": "Tuf Banten",
        "batuan": "Tuf, tuf batuapung, dan batupasir tufan",
        "sifat": "Endapan gunungapi tua yang sudah padat, hampir tidak ambles.",
        "warna": "#d99aa8",
    },
    "Tmpk": {
        "nama": "Formasi Kalibeng",
        "batuan": "Napal pejal di bagian atas; napal bersisipan batupasir tufan dan bintal batugamping di bagian bawah",
        "sifat": "Batuan sedimen tua yang padat, hampir tidak ambles. Napal mudah lapuk, lereng rawan longsor.",
        "warna": "#9cc3d8",
    },
    "Tmkk": {
        "nama": "Anggota Kapung Formasi Kalibeng",
        "batuan": "Batugamping pejal di bagian bawah, perselingan batugamping pasiran dan napal di atasnya",
        "sifat": "Batuan padat, tidak ambles.",
        "warna": "#6f9fd8",
    },
    "Tmkd": {
        "nama": "Anggota Damar Formasi Kalibeng",
        "batuan": "Konglomerat, batupasir kerikilan, batupasir gampingan bersisipan batugamping",
        "sifat": "Batuan padat, tidak ambles.",
        "warna": "#d7a467",
    },
    "Tmkb": {
        "nama": "Anggota Banyak Formasi Kalibeng",
        "batuan": "Perselingan batupasir tufan, batulanau gampingan, batupasir, dan batupasir kerikilan",
        "sifat": "Batuan padat, tidak ambles.",
        "warna": "#c9925f",
    },
    "Qvtm": {
        "nama": "Tuf Muria",
        "batuan": "Tuf, lahar, dan tuf pasiran dari Gunung Muria",
        "sifat": "Endapan gunungapi yang lebih padat dari aluvium, hampir tidak ambles.",
        "warna": "#e3a37f",
    },
}


def ke_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB 0..255 -> CIELAB (D65)."""
    c = rgb.astype(np.float64) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def baca(lem: dict) -> Image.Image:
    f = MENTAH / lem["berkas"]
    if not f.exists():
        sys.exit(f"Raster tidak ada: {f}. Unduh '{lem['judul']}' dari GeoMap Badan Geologi.")
    return Image.open(f).convert("RGB")


def cari_sudut(im: Image.Image, kira: list[tuple[int, int]]) -> list[tuple[float, float]]:
    """Perhalus letak sudut: garis bingkai = kolom/baris dengan piksel gelap terbanyak di jendela sekitar perkiraan."""
    hasil = []
    for i, (cx, cy) in enumerate(kira):
        r = CARI_SUDUT
        a = np.asarray(im.crop((cx - r, cy - r, cx + r, cy + r)).convert("L"), dtype=np.float32)
        gelap = a < 110
        # garis bingkai hanya menjulur ke satu arah dari sudut: kiri-atas ke kanan dan ke bawah, dst.
        kanan = i in (0, 2)
        bawah = i in (0, 1)
        kol = gelap[r:, :] if bawah else gelap[:r, :]
        bar = gelap[:, r:] if kanan else gelap[:, :r]
        x = int(np.argmax(kol.sum(axis=0)))
        y = int(np.argmax(bar.sum(axis=1)))
        hasil.append((cx - r + x + 0.5, cy - r + y + 0.5))
    return hasil


def gcp_lembar(lem: dict, sudut: list[tuple[float, float]]) -> list:
    barat, timur, utara, selatan = lem["bingkai"]
    if utara is None:
        # lintang 1 menit hampir sama panjang dengan bujur 1 menit di sekitar 7° LS (beda < 0,1%)
        lebar = np.hypot(sudut[3][0] - sudut[2][0], sudut[3][1] - sudut[2][1])
        tinggi = np.hypot(sudut[2][0] - sudut[0][0], sudut[2][1] - sudut[0][1])
        utara = selatan + (timur - barat) * tinggi / lebar
        lem["bingkai"] = (barat, timur, utara, selatan)
        print(f"  batas utara bingkai dihitung dari sisi bingkai: {-utara:.4f}° LS ({int(-utara)}°{(-utara % 1) * 60:.1f}')")
    lonlat = [(barat, utara), (timur, utara), (barat, selatan), (timur, selatan)]
    return [gdal.GCP(lon, lat, 0, px, py) for (px, py), (lon, lat) in zip(sudut, lonlat)]


def warna_legenda(im: Image.Image, kotak: tuple[int, int, int, int]) -> tuple[float, float, float]:
    x0, y0, x1, y1 = kotak
    # buang tepi kotak (garis hitam) lalu buang piksel huruf dan peralihannya
    dx, dy = (x1 - x0) // 6, (y1 - y0) // 5
    a = np.asarray(im.crop((x0 + dx, y0 + dy, x1 - dx, y1 - dy)), dtype=np.float64).reshape(-1, 3)
    lab = ke_lab(a)
    terang = lab[lab[:, 0] > np.percentile(lab[:, 0], 40)]
    return tuple(float(v) for v in np.median(terang, axis=0))


def warp(lem: dict, gcp: list, kotak_utm: tuple[float, float, float, float]) -> tuple[np.ndarray, rasterio.Affine]:
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    KERJA.mkdir(parents=True, exist_ok=True)
    vrt = KERJA / f"{lem['nama']}_gcp.vrt"
    tif = KERJA / f"{lem['nama']}_utm.tif"
    gdal.Translate(str(vrt), str(MENTAH / lem["berkas"]), format="VRT", GCPs=gcp, outputSRS=srs.ExportToWkt())
    gdal.Warp(str(tif), str(vrt), dstSRS=f"EPSG:{EPSG_UTM}", outputBounds=kotak_utm, xRes=PIKSEL, yRes=PIKSEL, resampleAlg="near", polynomialOrder=1, creationOptions=["COMPRESS=DEFLATE"])
    with rasterio.open(tif) as s:
        return np.dstack([s.read(i) for i in (1, 2, 3)]), s.transform


def perhalus_acuan(rgb: np.ndarray, acuan: dict[str, tuple], dalam: np.ndarray) -> dict[str, tuple]:
    lab = ke_lab(rgb[dalam].astype(np.float64))
    awal = {k: np.array(v) for k, v in acuan.items()}
    pusat = dict(awal)
    kode = list(acuan)
    for _ in range(2):
        jarak = np.stack([np.linalg.norm(lab - pusat[k], axis=-1) for k in kode], axis=-1)
        dekat = np.argmin(jarak, axis=-1)
        for i, k in enumerate(kode):
            sel = lab[(dekat == i) & (jarak[:, i] < JARAK_MAKS)]
            if len(sel) < 500:
                continue
            baru = np.median(sel, axis=0)
            geser = baru - awal[k]
            n = np.linalg.norm(geser)
            pusat[k] = awal[k] + (geser if n <= GESER_MAKS else geser * GESER_MAKS / n)
    return {k: tuple(float(x) for x in v) for k, v in pusat.items()}


def klasifikasi(rgb: np.ndarray, acuan: dict[str, tuple], dalam: np.ndarray) -> np.ndarray:
    """0 = belum ada satuan; i = indeks satuan + 1."""
    kode = list(acuan)
    lab = ke_lab(rgb)
    jarak = np.stack([np.linalg.norm(lab - np.array(acuan[k]), axis=-1) for k in kode], axis=-1)
    kelas = (np.argmin(jarak, axis=-1) + 1).astype(np.uint8)
    kelas[(jarak.min(axis=-1) > JARAK_MAKS) | ~dalam] = 0
    # pita tipis (huruf, garis, tepi warna) dibuang: lebar minimum 3 piksel (60 m)
    for i in range(1, len(kode) + 1):
        m = kelas == i
        kelas[m & ~ndimage.binary_opening(m, structure=np.ones((3, 3)))] = 0
    return kelas


def rapikan(kelas: np.ndarray, n_kode: int) -> np.ndarray:
    if not (kelas > 0).any():
        return kelas
    _, (ir, ic) = ndimage.distance_transform_edt(kelas == 0, return_indices=True)
    kelas = kelas[ir, ic]
    skor = np.stack([ndimage.uniform_filter((kelas == i).astype(np.float32), 5) for i in range(1, n_kode + 1)], axis=-1)
    kelas = (np.argmax(skor, axis=-1) + 1).astype(np.uint8)
    ny, nx = kelas.shape
    drv = gdal.GetDriverByName("MEM").Create("", nx, ny, 1, gdal.GDT_Byte)
    drv.GetRasterBand(1).WriteArray(kelas)
    gdal.SieveFilter(drv.GetRasterBand(1), None, drv.GetRasterBand(1), int(LUAS_MIN_HA * 10_000 / PIKSEL**2), 8)
    return drv.GetRasterBand(1).ReadAsArray().astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cek", action="store_true", help="hanya tulis gambar periksa sudut, legenda, dan potongan wilayah")
    a = ap.parse_args()
    if WILAYAH not in WILAYAH_LEMBAR:
        sys.exit(f"Wilayah {WILAYAH} tidak memakai skrip ini (Semarang: 07a_digitasi_geologi.py).")
    kota = gpd.read_file(AOI_KOTA).to_crs(EPSG_UTM)
    b = kota.total_bounds
    kotak_utm = (b[0] - 1000, b[1] - 1000, b[2] + 1000, b[3] + 1000)
    nx = int(round((kotak_utm[2] - kotak_utm[0]) / PIKSEL))
    ny = int(round((kotak_utm[3] - kotak_utm[1]) / PIKSEL))
    kotak_utm = (kotak_utm[0], kotak_utm[3] - ny * PIKSEL, kotak_utm[0] + nx * PIKSEL, kotak_utm[3])
    tr = rasterio.Affine(PIKSEL, 0, kotak_utm[0], 0, -PIKSEL, kotak_utm[3])
    xs = kotak_utm[0] + (np.arange(nx) + 0.5) * PIKSEL
    ys = kotak_utm[3] - (np.arange(ny) + 0.5) * PIKSEL
    xx, yy = np.meshgrid(xs, ys)
    lon, lat = Transformer.from_crs(EPSG_UTM, 4326, always_xy=True).transform(xx, yy)

    semua_kode: list[str] = []
    for _, kode in WILAYAH_LEMBAR[WILAYAH]:
        semua_kode += [k for k in kode if k not in semua_kode]
    gabung = np.zeros((ny, nx), np.uint8)
    tercakup = np.zeros((ny, nx), bool)
    sumber, rgb_cek = [], []
    for nama, kode in WILAYAH_LEMBAR[WILAYAH]:
        lem = dict(LEMBAR[nama], nama=nama)
        print(f"Lembar {lem['judul']}")
        im = baca(lem)
        sudut = cari_sudut(im, lem["sudut"])
        for (kx, ky), (sx, sy) in zip(lem["sudut"], sudut):
            print(f"  sudut perkiraan ({kx}, {ky}) -> bingkai ({sx:.0f}, {sy:.0f})")
        gcp = gcp_lembar(lem, sudut)
        acuan = {k: warna_legenda(im, lem["legenda"][k]) for k in kode}
        for k, v in acuan.items():
            print(f"  warna legenda {k:5} L={v[0]:.1f} a={v[1]:.1f} b={v[2]:.1f}")
        rgb, _ = warp(lem, gcp, kotak_utm)
        barat, timur, utara, selatan = lem["bingkai"]
        dalam = (lon >= barat) & (lon <= timur) & (lat <= utara) & (lat >= selatan)
        rgb_cek.append((nama, rgb, dalam))
        if a.cek:
            KERJA.mkdir(parents=True, exist_ok=True)
            for k, (x0, y0, x1, y1) in lem["legenda"].items():
                im.crop((x0 - 40, y0 - 20, x1 + 40, y1 + 20)).save(KERJA / f"cek_legenda_{nama}_{k}.png")
            for i, (sx, sy) in enumerate(sudut):
                c = im.crop((int(sx) - 60, int(sy) - 60, int(sx) + 60, int(sy) + 60)).resize((240, 240), Image.NEAREST)
                c.save(KERJA / f"cek_sudut_{nama}_{i}.png")
            continue
        acuan = perhalus_acuan(rgb, acuan, dalam)
        for k, v in acuan.items():
            print(f"  warna peta    {k:5} L={v[0]:.1f} a={v[1]:.1f} b={v[2]:.1f}")
        kelas = klasifikasi(rgb, acuan, dalam)
        peta = np.array([0] + [semua_kode.index(k) + 1 for k in kode], np.uint8)
        baru = dalam & ~tercakup
        gabung[baru] = peta[kelas[baru]]
        tercakup |= dalam
        sumber.append({"nama": lem["pustaka"], "url": "https://geologi.esdm.go.id/geomap/", "catatan": "Raster dari GeoMap Badan Geologi. Milik Pusat Survei Geologi, tidak diperjualbelikan."})
        print(f"  piksel lembar ini tanpa satuan sebelum dirapikan: {100 * (kelas[dalam] == 0).mean():.1f}%")

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    if a.cek:
        for nama, rgb, _ in rgb_cek:
            fig, ax = plt.subplots(figsize=(12, 12 * ny / nx))
            ax.imshow(rgb, extent=(kotak_utm[0], kotak_utm[2], kotak_utm[1], kotak_utm[3]))
            kota.boundary.plot(ax=ax, color="red", linewidth=0.8)
            ax.set_title(f"{nama}: raster tergeoreferensi + batas wilayah")
            plt.tight_layout()
            plt.savefig(KERJA / f"cek_wilayah_{nama}.png", dpi=80)
            plt.close(fig)
        print(f"Gambar periksa di {KERJA}")
        return

    kelas = rapikan(gabung, len(semua_kode))
    dalam_kota = features.rasterize(((g, 1) for g in kota.geometry), out_shape=(ny, nx), transform=tr).astype(bool)
    luar_kota = ~tercakup & dalam_kota
    poli = [{"KODE": semua_kode[int(v) - 1], "geometry": shape(g)} for g, v in features.shapes(kelas, transform=tr) if v > 0]
    g = gpd.GeoDataFrame(poli, crs=EPSG_UTM).dissolve(by="KODE", as_index=False)
    g = gpd.clip(g, kota)
    g["geometry"] = g.geometry.simplify(15, preserve_topology=True).buffer(0)
    for k in ("NAMA", "BATUAN", "SIFAT", "WARNA"):
        g[k] = g["KODE"].map(lambda kode, k=k: SATUAN[kode][k.lower()])
    KELUAR.parent.mkdir(parents=True, exist_ok=True)
    g.to_crs(4326).to_file(KELUAR, encoding="utf-8")
    luas = g.geometry.area / 1e6
    total = kota.area.sum() / 1e6
    for (_, r), l in zip(g.iterrows(), luas):
        print(f"  {r['KODE']:5} {r['NAMA']:28} {l:7.1f} km2 ({100 * l / total:.0f}%)")
    km_luar = luar_kota.sum() * PIKSEL**2 / 1e6
    if km_luar > 0.5:
        print(f"  bagian wilayah di luar lembar (diisi satuan terdekat): {km_luar:.1f} km2")
    judul = " dan ".join(LEMBAR[n]["judul"].replace("Peta Geologi ", "").replace(", Jawa", "") for n, _ in WILAYAH_LEMBAR[WILAYAH])
    pendamping = {
        "judul": f"Peta Geologi {judul}",
        "sumber": sumber,
        "aturan": (
            "Digitasi semi-otomatis: georeferensi dari empat sudut bingkai, warna tiap satuan diambil dari kotak legenda lembar, "
            "piksel diberi satuan dengan warna terdekat, lalu huruf, garis, dan simbol dibuang dan celahnya diisi satuan terdekat. "
            "Ketelitian batas sekitar 100 sampai 200 m."
            + (f" Sekitar {km_luar:.0f} km² wilayah berada di luar lembar dan diisi satuan dari tepi lembar terdekat." if km_luar > 0.5 else "")
        ),
    }
    KELUAR.with_suffix(".json").write_text(json.dumps(pendamping, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Tersimpan: {KELUAR}")

    fig, ax = plt.subplots(1, len(rgb_cek) + 1, figsize=(10 * (len(rgb_cek) + 1), 10 * ny / nx))
    ax = np.atleast_1d(ax)
    for i, (nama, rgb, _) in enumerate(rgb_cek):
        ax[i].imshow(rgb, extent=(kotak_utm[0], kotak_utm[2], kotak_utm[1], kotak_utm[3]))
        g.boundary.plot(ax=ax[i], color="k", linewidth=0.6)
        ax[i].set_title(f"{nama}: peta asli + batas digitasi")
    g.plot(ax=ax[-1], color=g["WARNA"], edgecolor="k", linewidth=0.4)
    for _, r in g.iterrows():
        p = r.geometry.representative_point()
        ax[-1].annotate(r["KODE"], (p.x, p.y), fontsize=9)
    ax[-1].set_title("Hasil digitasi")
    for s in ax:
        kota.boundary.plot(ax=s, color="red", linewidth=0.8)
        s.set_xlim(kotak_utm[0], kotak_utm[2])
        s.set_ylim(kotak_utm[1], kotak_utm[3])
    plt.tight_layout()
    plt.savefig(KERJA / "digitasi_geologi.png", dpi=70)
    print(f"Gambar periksa: {KERJA / 'digitasi_geologi.png'}")


if __name__ == "__main__":
    main()
