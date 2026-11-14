"""Langkah 7a: digitasi Peta Geologi Lembar Magelang dan Semarang untuk wilayah kota.

Sumber: Thanden, Sumadirdja, Richards, Sutisna dan Amin (1996), Peta Geologi Lembar Magelang dan
Semarang, Jawa, skala 1:100.000, Pusat Survei Geologi. Raster diunduh dari GeoMap Badan Geologi
(perlu akun). Lisensi GeoMap: boleh dipakai dengan menyebut sumber PSG, tidak untuk diperjualbelikan.
Raster tidak disimpan di repo; letakkan di <PA_OLAH>/konteks/mentah/.

Cara kerja:
1. Georeferensi dari empat sudut bingkai (110°00'-110°30' BT, 6°50'-7°30' LS), lalu warp ke
   UTM 49S dengan piksel 40 m.
2. Tiap piksel diberi satuan berdasarkan warna terdekat (ruang warna CIELAB) terhadap contoh warna
   yang diambil dari dalam peta di tempat yang labelnya terbaca. Piksel yang warnanya jauh dari semua
   satuan (garis kontur, sungai, jalan, huruf) dikosongkan.
3. Garis tipis yang kebetulan berwarna mirip satuan dibuang dengan opening morfologi, celah diisi
   satuan terdekat, lalu disaring modus 5 x 5 dan poligon di bawah 10 ha digabung ke tetangganya.
4. Pergeseran datum diperiksa dengan mencocokkan batas Aluvium dengan dataran rendah pada DEM
   Copernicus (langkah 7). Pergeseran terbaik dipakai bila memperbaiki kecocokan.
5. Kota sedikit melewati tepi timur lembar (110°30' BT). Jalur itu diisi satuan dari tepi lembar
   terdekat dan dicatat.

Keluaran: data-raw/konteks/geologi-psg-100k.shp (KODE, NAMA, BATUAN, SIFAT, WARNA), dipakai
otomatis oleh 07_konteks.py. Gambar periksa: <PA_OLAH>/konteks/digitasi_geologi.png.

Jalankan:
    python pipeline/07a_digitasi_geologi.py
    python pipeline/07_konteks.py
"""
from __future__ import annotations

import json
import sys

import geopandas as gpd
import numpy as np
import rasterio
from osgeo import gdal, osr
from pyproj import Transformer
from rasterio import features
from scipy import ndimage
from shapely.geometry import shape

from umum import AOI_KOTA, EPSG_UTM, OLAH, REPO, WILAYAH

gdal.UseExceptions()

MENTAH = OLAH / "konteks" / "mentah" / "peta_geologi_magelang_semarang_100k.jpg"
KERJA = OLAH / "konteks"
KELUAR = REPO / "data-raw" / "konteks" / f"{WILAYAH}-geologi-psg-100k.shp"
DEM_LOWLAND = REPO / "public" / "data" / f"{WILAYAH}-konteks-geologi.geojson"

# Sudut bingkai di raster (kolom, baris) -> bujur, lintang. Dibaca dari gambar, ketelitian sekitar 1 piksel (50 m).
SUDUT = [
    (34.0, 59.5, 110.0, -(6 + 50 / 60)),
    (1157.5, 63.0, 110.5, -(6 + 50 / 60)),
    (34.5, 1553.5, 110.0, -7.5),
    (1158.0, 1550.0, 110.5, -7.5),
]
BUJUR_TIMUR_LEMBAR = 110.5
PIKSEL = 40.0
KOTAK = (418000, 9212480, 446800, 9235200)  # sama dengan kotak potong InSAR
JARAK_MAKS = 18.0  # beda warna CIELAB terbesar yang masih dianggap satu satuan
LUAS_MIN_HA = 10

# Warna acuan (CIELAB). Didapat dari pengelompokan k-means warna peta di dalam kota (12 kelompok,
# 14 November 2026), lalu tiap kelompok dicocokkan dengan satuan lewat letaknya dan label di peta.
# Qpj terlalu kecil untuk jadi kelompok sendiri, jadi warnanya diambil langsung dari bercak berlabel.
ACUAN = {
    "Qa": [(93.6, -0.7, 1.9), (92.4, 0.3, -2.6)],  # putih kebiruan; yang kedua isian sungai dan pantai
    "Qpkg": [(89.2, 5.8, 5.6)],
    "QTd": [(81.2, 10.4, 12.2)],
    "Tmkl": [(64.8, -0.5, -21.9)],
    "Tmk": [(73.8, 1.2, -1.6), (62.1, 1.6, -3.6)],  # abu-abu dan arsirannya
    "Qhg": [(81.3, 10.4, 7.9)],
    "Qpj": [(47.5, 21.0, 7.5)],
}
# Kelompok yang ternyata hanya garis kontur, jalan, dan tepi warna: dikosongkan lalu diisi tetangga.
GARIS = [(80.9, 5.9, 5.3), (72.4, 9.3, 8.6), (85.1, -0.3, 0.3), (61.0, 8.0, 6.6)]
# Lebar minimum (piksel 40 m) satuan yang di peta selalu berupa bidang luas. Sungai dan jalan yang
# warnanya mirip abu-abu Formasi Kerek atau biru Formasi Kalibeng lebih sempit dari 200 m.
LEBAR_MIN = {"Tmk": 5, "Tmkl": 5, "Qhg": 5}
# Qhg dan Qpj di peta hanya ada di selatan kota (di dalam busur Gunungpati), di selatan northing ini.
UTARA_GUNUNGAPI = 9219000
# Formasi Kerek (abu-abu berarsir) di peta hanya ada di tiga tempat: lajur tengah, tenggara, dan tepi
# barat. Abu-abu di tempat lain adalah alur sungai dan simbol kota. Kotak UTM (barat, selatan, timur, utara).
TEMPAT_TMK = [(418000, 9219000, 446800, 9223000), (436800, 9212480, 446800, 9219000), (418000, 9219000, 421500, 9224000)]
KODE = list(ACUAN)

SATUAN = {
    "Qa": {
        "nama": "Aluvium",
        "batuan": "Endapan dataran pantai, sungai, dan danau. Endapan pantai berupa lempung, lanau, dan pasir yang tebalnya bisa 50 m atau lebih",
        "sifat": "Endapan muda dan lunak, mudah memampat saat dibebani bangunan dan saat air tanah disedot.",
        "warna": "#efdf96",
    },
    "QTd": {
        "nama": "Formasi Damar",
        "batuan": "Batupasir tufan, konglomerat, dan breksi vulkanik",
        "sifat": "Batuan lebih tua dan padat, hampir tidak ambles. Lapukannya di lereng terjal bisa bergerak.",
        "warna": "#e3a37f",
    },
    "Qpkg": {
        "nama": "Formasi Kaligetas",
        "batuan": "Breksi vulkanik, aliran lava, tuf, batupasir tufan, dan batulempung",
        "sifat": "Padat, hampir tidak ambles. Sisipan batulempung dapat memicu gerakan tanah di lereng.",
        "warna": "#e8bcc3",
    },
    "Tmkl": {
        "nama": "Formasi Kalibeng",
        "batuan": "Napal pejal dengan sisipan batupasir tufan dan batugamping",
        "sifat": "Padat, hampir tidak ambles. Napal mudah lapuk, jadi lereng di satuan ini rawan longsor.",
        "warna": "#6f9fd8",
    },
    "Tmk": {
        "nama": "Formasi Kerek",
        "batuan": "Perselingan batulempung, napal, batupasir tufan, konglomerat, breksi vulkanik, dan batugamping",
        "sifat": "Padat, hampir tidak ambles. Lereng batulempung rawan gerakan tanah.",
        "warna": "#9ea4ab",
    },
    "Qhg": {
        "nama": "Batuan Gunungapi Gajahmungkur",
        "batuan": "Andesit hornblende augit, umumnya berupa aliran lava",
        "sifat": "Batuan gunungapi keras, tidak ambles.",
        "warna": "#d38aa5",
    },
    "Qpj": {
        "nama": "Formasi Jongkong",
        "batuan": "Breksi andesit hornblende augit dan aliran lava",
        "sifat": "Batuan gunungapi keras, tidak ambles.",
        "warna": "#9b5a64",
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


def georeferensi(geser: tuple[float, float] = (0.0, 0.0)) -> tuple[np.ndarray, rasterio.Affine]:
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    gcp = [gdal.GCP(lon, lat, 0, px, py) for px, py, lon, lat in SUDUT]
    vrt = KERJA / "geologi_gcp.vrt"
    gdal.Translate(str(vrt), str(MENTAH), format="VRT", GCPs=gcp, outputSRS=srs.ExportToWkt())
    tif = KERJA / "geologi_utm.tif"
    gdal.Warp(str(tif), str(vrt), dstSRS=f"EPSG:{EPSG_UTM}", outputBounds=KOTAK, xRes=PIKSEL, yRes=PIKSEL, resampleAlg="near", polynomialOrder=1, creationOptions=["COMPRESS=DEFLATE"])
    with rasterio.open(tif) as s:
        rgb = np.dstack([s.read(i) for i in (1, 2, 3)])
        tr = s.transform
    # geser = koreksi datum (meter): titik peta dipindah sejauh (dx, dy)
    return rgb, rasterio.Affine(tr.a, tr.b, tr.c + geser[0], tr.d, tr.e, tr.f + geser[1])


def klasifikasi(rgb: np.ndarray, tr: rasterio.Affine) -> tuple[np.ndarray, np.ndarray]:
    lab = ke_lab(rgb)
    # jarak ke acuan terdekat tiap satuan; kelas 0 = garis atau warna asing
    jarak = np.stack([np.min([np.linalg.norm(lab - np.array(r), axis=-1) for r in ACUAN[k]], axis=0) for k in KODE], axis=-1)
    garis = np.min([np.linalg.norm(lab - np.array(r), axis=-1) for r in GARIS], axis=0)
    kelas = np.argmin(jarak, axis=-1) + 1
    kelas[(jarak.min(axis=-1) > JARAK_MAKS) | (garis < jarak.min(axis=-1))] = 0
    # di luar lembar (timur 110°30')
    ny, nx = kelas.shape
    xs = tr.c + (np.arange(nx) + 0.5) * tr.a
    ys = tr.f + (np.arange(ny) + 0.5) * tr.e
    xx, yy = np.meshgrid(xs, ys)
    lon, _ = Transformer.from_crs(EPSG_UTM, 4326, always_xy=True).transform(xx, yy)
    luar = lon > BUJUR_TIMUR_LEMBAR
    kelas[luar] = 0
    # satuan gunungapi selatan hanya dipetakan di selatan; warna serupa di utara adalah peralihan QTd
    for k in ("Qhg", "Qpj"):
        kelas[(kelas == KODE.index(k) + 1) & (yy > UTARA_GUNUNGAPI)] = 0
    boleh = np.zeros(kelas.shape, bool)
    for x0, y0, x1, y1 in TEMPAT_TMK:
        boleh |= (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    kelas[(kelas == KODE.index("Tmk") + 1) & ~boleh] = 0
    print(f"  piksel tanpa satuan sebelum dibersihkan: {100 * (kelas == 0).mean():.1f}%")
    # garis berwarna mirip satuan (sungai, jalan, rel) dibuang: pita yang lebih sempit dari lebar minimum satuannya
    for i, k in enumerate(KODE, 1):
        n = LEBAR_MIN.get(k, 3)
        m = kelas == i
        kelas[m & ~ndimage.binary_opening(m, structure=np.ones((n, n)))] = 0
    # isi celah dengan satuan terdekat
    _, (ir, ic) = ndimage.distance_transform_edt(kelas == 0, return_indices=True)
    kelas = kelas[ir, ic]
    # modus 5 x 5
    skor = np.stack([ndimage.uniform_filter((kelas == i).astype(np.float32), 5) for i in range(1, len(KODE) + 1)], axis=-1)
    kelas = (np.argmax(skor, axis=-1) + 1).astype(np.uint8)
    # gabungkan poligon kecil ke tetangganya
    drv = gdal.GetDriverByName("MEM").Create("", nx, ny, 1, gdal.GDT_Byte)
    drv.GetRasterBand(1).WriteArray(kelas)
    gdal.SieveFilter(drv.GetRasterBand(1), None, drv.GetRasterBand(1), int(LUAS_MIN_HA * 10_000 / PIKSEL**2), 8)
    kelas = drv.GetRasterBand(1).ReadAsArray().astype(np.uint8)
    # Aluvium di peta menyambung ke dataran pantai; pulau Aluvium kecil di perbukitan adalah isian alur sungai
    qa = KODE.index("Qa") + 1
    label, n = ndimage.label(kelas == qa)
    if n > 1:
        luas = ndimage.sum(np.ones_like(label), label, index=np.arange(1, n + 1))
        kecil = np.isin(label, np.flatnonzero(luas * PIKSEL**2 < 1e6) + 1)
        kelas[kecil] = 0
        _, (ir, ic) = ndimage.distance_transform_edt(kelas == 0, return_indices=True)
        kelas = kelas[ir, ic]
    return kelas, luar


def cek_geser(kelas: np.ndarray, tr: rasterio.Affine, kota: gpd.GeoDataFrame) -> tuple[float, float]:
    """Cari pergeseran (meter) yang paling menyelaraskan batas Aluvium dengan dataran rendah DEM."""
    dem = json.loads(DEM_LOWLAND.read_text(encoding="utf-8"))
    if dem.get("metadata", {}).get("jenis") != "perkiraan":
        print("  lapis geologi sekarang bukan perkiraan DEM: cek pergeseran dilewati")
        return 0.0, 0.0
    rendah = gpd.GeoDataFrame.from_features([f for f in dem["features"] if f["properties"]["kode"] == "Qa"], crs=4326).to_crs(EPSG_UTM)
    dalam = features.rasterize(((g, 1) for g in kota.geometry), out_shape=kelas.shape, transform=tr).astype(bool)
    qa = kelas == KODE.index("Qa") + 1
    hasil = []
    for dx in range(-600, 601, 100):
        for dy in range(-600, 601, 100):
            t2 = rasterio.Affine(tr.a, tr.b, tr.c - dx, tr.d, tr.e, tr.f - dy)
            r = features.rasterize(((g, 1) for g in rendah.geometry), out_shape=kelas.shape, transform=t2).astype(bool)
            a, b = qa & dalam, r & dalam
            hasil.append(((a & b).sum() / max(1, (a | b).sum()), dx, dy))
    hasil.sort(reverse=True)
    nol = next(h for h in hasil if h[1] == 0 and h[2] == 0)
    print(f"  kecocokan Aluvium vs dataran rendah DEM: tanpa geser {nol[0]:.3f}; terbaik {hasil[0][0]:.3f} di dx={hasil[0][1]} m, dy={hasil[0][2]} m")
    # geser hanya bila jelas lebih baik (lebih dari 1 poin)
    return (float(-hasil[0][1]), float(-hasil[0][2])) if hasil[0][0] - nol[0] > 0.01 else (0.0, 0.0)


def main() -> None:
    if WILAYAH != "semarang":
        sys.exit("Sudut bingkai, warna acuan, dan aturan satuan di skrip ini khusus Lembar Magelang dan Semarang. Wilayah lain butuh lembar peta sendiri.")
    if not MENTAH.exists():
        sys.exit(f"Raster peta geologi tidak ada: {MENTAH}")
    kota = gpd.read_file(AOI_KOTA).to_crs(EPSG_UTM)
    print("Klasifikasi awal")
    rgb, tr = georeferensi()
    kelas, _ = klasifikasi(rgb, tr)
    geser = cek_geser(kelas, tr, kota)
    if geser != (0.0, 0.0):
        print(f"Klasifikasi ulang dengan geser {geser}")
        rgb, tr = georeferensi(geser)
        kelas, _ = klasifikasi(rgb, tr)
    # poligon
    poli = [{"KODE": KODE[int(v) - 1], "geometry": shape(g)} for g, v in features.shapes(kelas, transform=tr) if v > 0]
    g = gpd.GeoDataFrame(poli, crs=EPSG_UTM).dissolve(by="KODE", as_index=False)
    g = gpd.clip(g, kota)
    g["geometry"] = g.geometry.simplify(20, preserve_topology=True).buffer(0)
    for k in ("NAMA", "BATUAN", "SIFAT", "WARNA"):
        g[k] = g["KODE"].map(lambda kode, k=k: SATUAN[kode][k.lower()])
    KELUAR.parent.mkdir(parents=True, exist_ok=True)
    g.to_crs(4326).to_file(KELUAR, encoding="utf-8")
    luas = g.geometry.area / 1e6
    for (_, b), l in zip(g.iterrows(), luas):
        print(f"  {b['KODE']:5} {b['NAMA']:32} {l:6.1f} km2")
    # bagian kota di timur lembar: diisi dari tepi lembar
    lon_timur = gpd.GeoSeries.from_xy([BUJUR_TIMUR_LEMBAR] * 2, [-7.2, -6.8], crs=4326).to_crs(EPSG_UTM)
    x_tepi = float(lon_timur.x.mean())
    timur = kota.clip_by_rect(x_tepi, 0, 1e9, 1e9).area.sum() / 1e6
    print(f"  bagian kota di timur 110°30' BT (diisi dari tepi lembar): {timur:.1f} km2")
    print(f"Tersimpan: {KELUAR}")

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(1, 2, figsize=(20, 8))
    barat, selatan, timur, utara = rasterio.transform.array_bounds(rgb.shape[0], rgb.shape[1], tr)
    ax[0].imshow(rgb, extent=(barat, timur, selatan, utara))
    g.boundary.plot(ax=ax[0], color="k", linewidth=0.7)
    ax[0].set_title("Peta asli + batas hasil digitasi")
    g.plot(ax=ax[1], color=g["WARNA"], edgecolor="k", linewidth=0.4)
    for _, r in g.iterrows():
        p = r.geometry.representative_point()
        ax[1].annotate(r["KODE"], (p.x, p.y), fontsize=8)
    ax[1].set_title("Hasil digitasi")
    for a in ax:
        kota.boundary.plot(ax=a, color="red", linewidth=0.8)
        a.set_xlim(barat, timur)
        a.set_ylim(selatan, utara)
    plt.tight_layout()
    plt.savefig(KERJA / "digitasi_geologi.png", dpi=70)


if __name__ == "__main__":
    main()
