"""Langkah 7: lapis konteks untuk peta dan laporan: pola ruang RTRW dan geologi permukaan.

Keluaran:
    data-raw/konteks/<wilayah>-rtrw-pola-ruang.shp     pola ruang di dalam wilayah (bisa dibuka dan disunting di QGIS)
    data-raw/konteks/<wilayah>-geologi-permukaan.shp   satuan geologi permukaan di dalam wilayah
    public/data/konteks-rtrw.geojson         dibaca aplikasi, ditambah statistik laju per kelas
    public/data/konteks-geologi.geojson      sama

Jalankan:
    python pipeline/07_konteks.py
    python pipeline/07_konteks.py --rtrw rtrw_kota.shp          pakai SHP RTRW Kota resmi
    python pipeline/07_konteks.py --geologi geologi_psg.shp     pakai SHP hasil digitasi peta geologi PSG

Sumber bawaan (dicek 14 November 2026):

- Pola ruang: RTRW Provinsi Jawa Tengah 2024-2044 (Perda Provinsi Jawa Tengah Nomor 8 Tahun 2024),
  dari layanan ArcGIS publik "Peta Rencana Perda Jawa Tengah No 8 Tahun 2024". Skala provinsi, jadi
  kasar untuk tingkat persil. RTRW Kota Semarang yang lebih rinci (Perda Kota Semarang 5/2021) tidak bisa
  diambil hari itu: geoportal Pemkot dan Satu Peta BIG tidak merespons, GISTARU meminta token.
- Geologi: layanan peta geologi ESDM sedang pemeliharaan, dan raster peta PSG di GeoMap hanya bisa
  diunduh dengan akun. Sebagai pengganti sementara, satuan geologi permukaan diperkirakan dari bentuk
  lahan pada DEM Copernicus GLO-30: dataran rendah yang datar dan tersambung ke pantai dianggap endapan
  aluvial, sisanya perbukitan. Batas ini perkiraan, bukan hasil pemetaan geologi.

Kedua SHP memakai kolom yang sama dengan file resmi (NAMOBJ, KODKWS untuk RTRW), jadi file resmi bisa
langsung menggantikannya lewat --rtrw dan --geologi.
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import requests
from osgeo import gdal
from rasterio import features
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject
from scipy import ndimage
from shapely.geometry import shape

from umum import AOI_KOTA, EPSG_UTM, KERJA, NAMA_WILAYAH, REPO, WILAYAH

UA = {"User-Agent": "pantau-ambles-demo-build/0.1"}
KONTEKS = KERJA / "konteks"
SHP = REPO / "data-raw" / "konteks"
KELUAR = REPO / "public" / "data"


def _kotak() -> tuple[float, float, float, float]:
    """Kotak wilayah (barat, selatan, timur, utara) dengan bantalan 0,03 derajat."""
    b = gpd.read_file(AOI_KOTA).total_bounds
    return (round(b[0] - 0.03, 3), round(b[1] - 0.03, 3), round(b[2] + 0.03, 3), round(b[3] + 0.03, 3))


KOTAK = _kotak()
# Hasil digitasi peta geologi PSG (langkah 7a). Bila ada, dipakai menggantikan perkiraan dari DEM.
GEOLOGI_PSG = SHP / f"{WILAYAH}-geologi-psg-100k.shp"
# Perkiraan geologi dari bentuk lahan hanya bermakna bila ada perbukitan. Jakarta seluruhnya dataran dan
# kipas aluvial, jadi tanpa peta PSG lapis geologinya tidak dibuat.
GEOLOGI_PERKIRAAN = WILAYAH != "jakarta"

# RDTR DKI Jakarta 2022 (Pergub DKI 31/2022), layanan resmi DPMPTSP DKI. Kode zona -> nama zona.
URL_RDTR_DKI = "https://gis-dpmptsp.jakarta.go.id/arcgis/rest/services/Hosted/Rencana_Pola_Ruang_RDTR_2022/FeatureServer/0/query"
ZONA_DKI = {
    31010000: "Badan Air", 31021000: "Hutan Lindung", 31030000: "Perlindungan Setempat", 31031000: "Ruang Terbuka Hijau",
    31040000: "Konservasi", 31090000: "Ekosistem Mangrove", 32020000: "Hutan Produksi", 32040000: "Pertanian",
    32050000: "Perikanan", 32075000: "Pembangkitan Tenaga Listrik", 32080000: "Kawasan Peruntukan Industri",
    32090000: "Pariwisata", 32103000: "Perumahan", 32104000: "Sarana Pelayanan Umum", 32112000: "Perdagangan dan Jasa",
    32113000: "Perkantoran", 32120000: "Transportasi", 32130000: "Pertahanan dan Keamanan",
}

URL_RTRW = (
    "https://services.arcgis.com/zmBQLV64TsFvEpV0/arcgis/rest/services/"
    "Peta_Rencana_Perda_Jawa_Tengah_No_8_Tahun_2024/FeatureServer/25/query"
)
UBIN_DEM = [
    f"/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S{la:02d}_00_E{lo:03d}_00_DEM/Copernicus_DSM_COG_10_S{la:02d}_00_E{lo:03d}_00_DEM.tif"
    # nama ubin = lintang selatan bulat ke atas (S07 = 6 sampai 7 LS) dan bujur bulat ke bawah
    for la in range(int(np.ceil(-KOTAK[3])), int(np.ceil(-KOTAK[1])) + 1)
    for lo in range(int(np.floor(KOTAK[0])), int(np.floor(KOTAK[2])) + 1)
]

# Satuan dataran aluvial: lereng rata-rata (sekitar 150 m) paling besar 2 derajat, tinggi paling besar
# 50 m di atas muka laut, dan tersambung ke pantai. Dipilih setelah membandingkan beberapa ambang
# (14 November 2026): batasnya stabil di kaki bukit, luasnya 34 sampai 39% kota.
LERENG_MAKS = 2.0
TINGGI_MAKS = 50.0
TINGGI_PANTAI = 3.0
LUAS_MIN_HA = 20

# Warna mengikuti kebiasaan peta pola ruang, dilembutkan supaya tetap terbaca di atas peta dasar.
WARNA_RTRW = {
    "Kawasan Permukiman": "#f2c14e",
    "Kawasan Peruntukan Industri": "#c0567f",
    "Kawasan Transportasi": "#8d8f9c",
    "Kawasan Pertahanan dan Keamanan": "#6f7d3c",
    "Kawasan Hutan Produksi": "#3f8f5c",
    "Kawasan Konservasi": "#1f6a48",
    "Kawasan Ekosistem Mangrove": "#2aa198",
    "Kawasan Pertanian": "#a8cf5a",
    "Kawasan Perkebunan Rakyat": "#7fb26b",
    "Kawasan Perikanan": "#62b3e0",
    "Badan Air": "#3a78d4",
    "Kawasan Pariwisata": "#ef8a7d",
    "Kawasan Pertambangan dan Energi": "#8b6a4f",
    # zona RDTR DKI Jakarta
    "Perumahan": "#f2c14e",
    "Perdagangan dan Jasa": "#e4572e",
    "Perkantoran": "#b5838d",
    "Sarana Pelayanan Umum": "#9b7fd1",
    "Ruang Terbuka Hijau": "#57a773",
    "Perlindungan Setempat": "#7cc6a0",
    "Hutan Lindung": "#2d6a4f",
    "Konservasi": "#1f6a48",
    "Ekosistem Mangrove": "#2aa198",
    "Hutan Produksi": "#3f8f5c",
    "Pertanian": "#a8cf5a",
    "Perikanan": "#62b3e0",
    "Pembangkitan Tenaga Listrik": "#8b6a4f",
    "Pariwisata": "#ef8a7d",
    "Transportasi": "#8d8f9c",
    "Pertahanan dan Keamanan": "#6f7d3c",
}
WARNA_LAIN = "#c4a27c"

GEOLOGI = {
    "Qa": {
        "nama": "Dataran aluvial",
        "batuan": "Endapan sungai, pantai, dan rawa: lempung, lanau, dan pasir yang masih muda dan lunak",
        "sifat": "Mudah memampat saat dibebani bangunan dan saat air tanah disedot.",
        "warna": "#e9d98b",
    },
    "Tb": {
        "nama": "Perbukitan",
        "batuan": "Batuan sedimen dan gunungapi yang lebih tua, antara lain Formasi Damar, Kaligetas, Kerek, dan Kalibeng (Thanden dkk. 1996)",
        "sifat": "Jauh lebih padat sehingga hampir tidak ambles. Yang perlu diperhatikan di sini adalah gerakan tanah pada lereng terjal.",
        "warna": "#c98f5f",
    },
}


# ---------------------------------------------------------------- unduh
def unduh_rtrw() -> Path:
    tujuan = KONTEKS / "rtrw_prov_jateng_2024.geojson"
    if tujuan.exists():
        return tujuan
    p = {
        "where": "1=1",
        "geometry": ",".join(map(str, KOTAK)),
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "NAMOBJ,KODKWS,JNSRPR,WADMKK",
        "returnGeometry": "true",
        "outSR": 4326,
        "f": "geojson",
    }
    r = requests.get(URL_RTRW, params=p, headers=UA, timeout=300)
    r.raise_for_status()
    d = r.json()
    if not d.get("features"):
        raise SystemExit(f"Layanan RTRW tidak mengembalikan fitur: {str(d)[:300]}")
    tujuan.write_text(json.dumps(d), encoding="utf-8")
    return tujuan


def unduh_dem() -> Path:
    tujuan = KONTEKS / "dem_glo30.tif"
    if tujuan.exists():
        return tujuan
    gdal.UseExceptions()
    gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    gdal.SetConfigOption("GDAL_HTTP_USERAGENT", UA["User-Agent"])
    gdal.Warp(str(tujuan), UBIN_DEM, outputBounds=KOTAK, creationOptions=["COMPRESS=DEFLATE"])
    return tujuan


# ---------------------------------------------------------------- olah
def kota_utm() -> gpd.GeoDataFrame:
    return gpd.read_file(AOI_KOTA).to_crs(EPSG_UTM)


def rapikan(gdf: gpd.GeoDataFrame, kota: gpd.GeoDataFrame, kolom: list[str], toleransi: float, luas_min_ha: float = LUAS_MIN_HA, tutup_celah_m: float = 0) -> gpd.GeoDataFrame:
    """Potong ke batas kota, satukan per kelas, buang serpihan kecil, sederhanakan.

    tutup_celah_m > 0: celah antarblok kelas yang sama selebar paling besar 2 x nilai ini (mis. jalan yang
    tidak dipetakan sebagai kelas) ditutup, supaya poligon tidak pecah per blok.
    """
    g = gdf.to_crs(EPSG_UTM)
    g["geometry"] = g.geometry.buffer(0)
    g = gpd.clip(g, kota)
    g = g.dissolve(by=kolom, as_index=False)
    if tutup_celah_m:
        luas_asli = g.geometry.area
        g["geometry"] = g.geometry.buffer(tutup_celah_m, join_style="mitre").buffer(-tutup_celah_m, join_style="mitre")
        g = gpd.clip(g, kota)
        # celah yang ditutup bisa diklaim dua kelas di kiri-kanan jalan: kelas yang aslinya lebih luas didahulukan
        g = g.loc[luas_asli.reindex(g.index).sort_values(ascending=False).index]
        terpakai = None
        geom = []
        for gm in g.geometry:
            baru = gm if terpakai is None else gm.difference(terpakai)
            geom.append(baru)
            terpakai = gm if terpakai is None else terpakai.union(gm)
        g["geometry"] = geom
    g = g.explode(index_parts=False)
    g = g[g.geometry.area >= luas_min_ha * 10_000]
    g = g.dissolve(by=kolom, as_index=False)
    g["geometry"] = g.geometry.simplify(toleransi, preserve_topology=True).buffer(0)
    return g[~g.geometry.is_empty]


def olah_rtrw(sumber: Path | None, kota: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, dict]:
    if sumber:
        g = gpd.read_file(sumber)
        if "NAMOBJ" not in g.columns:
            raise SystemExit(f"{sumber}: kolom NAMOBJ tidak ada. Kolom yang ada: {list(g.columns)}")
        if "KODKWS" not in g.columns:
            g["KODKWS"] = ""
        meta = {
            "judul": "Pola ruang RTRW (file yang diberikan)",
            "jenis": "resmi",
            "skala": "",
            "sumber": [{"nama": f"File {sumber.name}", "catatan": "Diberikan lewat --rtrw. Lengkapi nama dan tahun Perda di README."}],
        }
    elif WILAYAH == "jakarta":
        return olah_rdtr_dki(kota)
    else:
        g = gpd.read_file(unduh_rtrw())
        meta = {
            "judul": "Pola ruang RTRW Provinsi Jawa Tengah 2024-2044",
            "jenis": "resmi",
            "skala": "1:250.000 (skala provinsi)",
            "sumber": [
                {
                    "nama": "Perda Provinsi Jawa Tengah Nomor 8 Tahun 2024 tentang RTRW Provinsi Jawa Tengah 2024-2044",
                    "url": "https://pusdataru.jatengprov.go.id/ppid/dokumen/2025/Perda%208%20tahun%202024.pdf",
                },
                {
                    "nama": "Data vektor: layanan ArcGIS publik Peta Rencana Perda Jawa Tengah No 8 Tahun 2024",
                    "url": URL_RTRW.removesuffix("/query"),
                    "catatan": "Salinan publik, bukan dari geoportal resmi Pemprov.",
                },
            ],
        }
    g = g[["NAMOBJ", "KODKWS", "geometry"]].copy()
    g["NAMOBJ"] = g["NAMOBJ"].fillna("Tanpa nama").astype(str).str.strip()
    g["KODKWS"] = g["KODKWS"].fillna("").astype(str)
    g = rapikan(g, kota, ["NAMOBJ", "KODKWS"], 15)
    g["FUNGSI"] = np.where(g["KODKWS"].str.startswith("31"), "Lindung", np.where(g["KODKWS"].str.startswith("32"), "Budi daya", ""))
    g["WARNA"] = g["NAMOBJ"].map(WARNA_RTRW).fillna(WARNA_LAIN)
    return g, meta


def unduh_rdtr_dki() -> Path:
    """Unduh RDTR DKI per halaman (2.000 fitur), disederhanakan di server sekitar 10 m. Badan Jalan tidak diambil."""
    tujuan = KONTEKS / "rdtr_dki_2022.geojson"
    if tujuan.exists():
        return tujuan
    fitur, mulai = [], 0
    while True:
        p = {
            "where": "kodzon <> 32010000",
            "outFields": "kodzon",
            "returnGeometry": "true",
            "outSR": 4326,
            "maxAllowableOffset": 0.0001,
            "geometryPrecision": 6,
            "resultOffset": mulai,
            "resultRecordCount": 2000,
            "orderByFields": "objectid",
            "f": "geojson",
        }
        d = requests.get(URL_RDTR_DKI, params=p, headers=UA, timeout=300).json()
        fs = d.get("features", [])
        fitur.extend(f for f in fs if f.get("geometry"))
        print(f"  RDTR DKI: {len(fitur)} fitur", flush=True)
        if len(fs) < 2000:
            break
        mulai += 2000
    tujuan.write_text(json.dumps({"type": "FeatureCollection", "features": fitur}), encoding="utf-8")
    return tujuan


def olah_rdtr_dki(kota: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, dict]:
    g = gpd.read_file(unduh_rdtr_dki())
    g["KODKWS"] = g["kodzon"].astype("Int64").astype(str)
    g["NAMOBJ"] = g["kodzon"].map(ZONA_DKI).fillna("Zona lain")
    g = rapikan(g[["NAMOBJ", "KODKWS", "geometry"]], kota, ["NAMOBJ", "KODKWS"], 20, luas_min_ha=1, tutup_celah_m=10)
    g["FUNGSI"] = np.where(g["KODKWS"].str.startswith("31"), "Lindung", "Budi daya")
    g["WARNA"] = g["NAMOBJ"].map(WARNA_RTRW).fillna(WARNA_LAIN)
    meta = {
        "judul": "Rencana pola ruang RDTR DKI Jakarta 2022",
        "jenis": "resmi",
        "skala": "1:5.000 (RDTR), disederhanakan sekitar 10 m",
        "sumber": [
            {"nama": "Peraturan Gubernur DKI Jakarta Nomor 31 Tahun 2022 tentang Rencana Detail Tata Ruang Wilayah Perencanaan Provinsi DKI Jakarta"},
            {"nama": "Data vektor: layanan ArcGIS DPMPTSP DKI Jakarta, Rencana Pola Ruang RDTR 2022", "url": URL_RDTR_DKI.removesuffix("/query")},
        ],
    }
    return g, meta


def olah_geologi(sumber: Path | None, kota: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, dict] | None:
    psg = sumber is None and GEOLOGI_PSG.exists()
    if psg:
        sumber = GEOLOGI_PSG
    if sumber:
        g = gpd.read_file(sumber)
        for k in ("KODE", "NAMA"):
            if k not in g.columns:
                raise SystemExit(f"{sumber}: kolom {k} tidak ada. Kolom yang ada: {list(g.columns)}")
        for k in ("BATUAN", "SIFAT", "WARNA"):
            if k not in g.columns:
                g[k] = ""
        g = rapikan(g[["KODE", "NAMA", "BATUAN", "SIFAT", "WARNA", "geometry"]], kota, ["KODE", "NAMA", "BATUAN", "SIFAT", "WARNA"], 10)
        pendamping = GEOLOGI_PSG.with_suffix(".json")
        if psg and pendamping.exists():
            # ditulis 07b_geologi_lembar.py: judul, sumber, dan aturan digitasi lembar wilayah ini
            p = json.loads(pendamping.read_text(encoding="utf-8"))
            meta = {"judul": p["judul"], "jenis": "resmi", "skala": "1:100.000, didigitasi tim", "sumber": p["sumber"], "aturan": p["aturan"]}
        elif psg:
            meta = {
                "judul": "Peta Geologi Lembar Magelang dan Semarang",
                "jenis": "resmi",
                "skala": "1:100.000, didigitasi tim",
                "sumber": [
                    {
                        "nama": "Thanden, Sumadirdja, Richards, Sutisna dan Amin (1996), Peta Geologi Lembar Magelang dan Semarang, Jawa, skala 1:100.000, Pusat Survei Geologi",
                        "url": "https://geologi.esdm.go.id/geomap/",
                        "catatan": "Raster dari GeoMap Badan Geologi. Milik Pusat Survei Geologi, tidak diperjualbelikan.",
                    }
                ],
                "aturan": (
                    "Digitasi semi-otomatis: georeferensi dari empat sudut bingkai, klasifikasi warna, lalu garis kontur, sungai, jalan, "
                    "dan huruf dibuang. Batas Aluvium hasil digitasi cocok 87% dengan kaki bukit pada DEM tanpa perlu digeser. "
                    "Ketelitian batas sekitar 100 sampai 200 m. Jalur kota sekitar 2 km² di timur 110°30' BT berada di luar lembar dan diisi satuan dari tepi lembar."
                ),
            }
        else:
            meta = {
                "judul": "Geologi permukaan (file yang diberikan)",
                "jenis": "resmi",
                "skala": "",
                "sumber": [{"nama": f"File {sumber.name}", "catatan": "Diberikan lewat --geologi. Lengkapi sumber peta di README."}],
            }
        return g, meta

    if not GEOLOGI_PERKIRAAN:
        return None
    with rasterio.open(unduh_dem()) as s:
        tr, w, h = calculate_default_transform(s.crs, f"EPSG:{EPSG_UTM}", s.width, s.height, *s.bounds, resolution=30)
        dem = np.zeros((h, w), np.float32)
        reproject(rasterio.band(s, 1), dem, dst_transform=tr, dst_crs=f"EPSG:{EPSG_UTM}", resampling=Resampling.bilinear)
    # DEM Copernicus adalah model permukaan (ikut atap bangunan): median 150 m meredamnya
    halus = ndimage.median_filter(dem, size=5)
    gy, gx = np.gradient(ndimage.uniform_filter(halus, 3), 30)
    lereng = ndimage.uniform_filter(np.degrees(np.arctan(np.hypot(gx, gy))), 5)
    datar = (lereng <= LERENG_MAKS) & (halus <= TINGGI_MAKS)
    label, _ = ndimage.label(datar)
    pantai = np.unique(label[datar & (halus <= TINGGI_PANTAI)])
    aluvial = np.isin(label, pantai[pantai > 0])
    aluvial = ndimage.binary_fill_holes(ndimage.binary_opening(ndimage.binary_closing(aluvial, iterations=3), iterations=2))
    kelas = np.where(aluvial, 1, 2).astype(np.uint8)
    poligon = [
        {"KODE": "Qa" if v == 1 else "Tb", "geometry": shape(geom)}
        for geom, v in features.shapes(kelas, transform=tr)
    ]
    g = gpd.GeoDataFrame(poligon, crs=EPSG_UTM)
    for k in ("NAMA", "BATUAN", "SIFAT", "WARNA"):
        g[k] = g["KODE"].map(lambda kode, k=k: GEOLOGI[kode][k.lower()])
    g = rapikan(g, kota, ["KODE", "NAMA", "BATUAN", "SIFAT", "WARNA"], 20)
    meta = {
        "judul": "Geologi permukaan (perkiraan dari bentuk lahan)",
        "jenis": "perkiraan",
        "skala": "Turunan DEM 30 m",
        "sumber": [
            {
                "nama": "DEM Copernicus GLO-30 (ESA), lewat AWS Open Data",
                "url": "https://registry.opendata.aws/copernicus-dem/",
                "catatan": "© DLR e.V. 2010-2014 dan © Airbus Defence and Space GmbH 2014-2018, disediakan di bawah program Copernicus.",
            },
            {
                "nama": "Nama satuan batuan: Thanden dkk. (1996), Peta Geologi Lembar Magelang dan Semarang 1:100.000, Pusat Survei Geologi",
                "url": "https://geologi.esdm.go.id/geomap/",
            },
        ],
        "aturan": f"Dataran aluvial = lereng rata-rata paling besar {LERENG_MAKS:g} derajat, tinggi paling besar {TINGGI_MAKS:g} m di atas muka laut, dan tersambung ke pantai.",
    }
    return g, meta


# ---------------------------------------------------------------- statistik
def baca_grid() -> tuple[dict, np.ndarray]:
    kepala = json.loads((KELUAR / f"{WILAYAH}-grid.json").read_text(encoding="utf-8"))
    laju = np.frombuffer((KELUAR / kepala["berkas"]["laju"]).read_bytes(), dtype="<i2").reshape(kepala["ny"], kepala["nx"])
    return kepala, laju


def statistik(g: gpd.GeoDataFrame, kolom: str, kolom_kode: str) -> list[dict]:
    """Laju penurunan per kelas, dari grid aplikasi (piksel yang sama dengan yang dilihat pengguna)."""
    kepala, laju = baca_grid()
    barat, _, _, utara = kepala["bbox"]
    sel = kepala["selDerajat"]
    tr = from_origin(barat, utara, sel, sel)
    g4326 = g.to_crs(4326).reset_index(drop=True)
    kelas = features.rasterize(((geom, i + 1) for i, geom in enumerate(g4326.geometry)), out_shape=laju.shape, transform=tr, fill=0, dtype="int32")
    dalam = laju != kepala["luar"]
    terukur = dalam & (laju != kepala["nodata"])
    luas = g.geometry.area / 1e6
    hasil = []
    for i, baris in g4326.iterrows():
        m = kelas == i + 1
        nilai = laju[m & terukur] * kepala["skalaLaju"]
        n_dalam = int((m & dalam).sum())
        item = {
            "kode": str(baris[kolom_kode]),
            "nama": baris[kolom],
            "warna": baris["WARNA"],
            "luasKm2": round(float(luas.iloc[i]), 1),
            "nPiksel": int(nilai.size),
            "cakupan": round(nilai.size / n_dalam, 2) if n_dalam else 0,
        }
        if nilai.size >= 15:
            item.update(
                median=round(float(np.median(nilai)), 1),
                p75=round(float(np.percentile(nilai, 75)), 1),
                porsiTinggi=round(float((nilai >= 4).mean()), 2),
            )
        hasil.append(item)
    return sorted(hasil, key=lambda x: -x["luasKm2"])


# ---------------------------------------------------------------- tulis
def tulis(g: gpd.GeoDataFrame, nama: str, lapis: str, meta: dict, properti: dict[str, str], stat: list[dict]) -> None:
    SHP.mkdir(parents=True, exist_ok=True)
    g4326 = g.to_crs(4326)
    g4326.to_file(SHP / f"{WILAYAH}-{nama}.shp", encoding="utf-8")
    fitur = []
    for _, b in g4326.iterrows():
        geom = json.loads(gpd.GeoSeries([b.geometry], crs=4326).to_json())["features"][0]["geometry"]
        fitur.append({"type": "Feature", "properties": {k: b[v] for k, v in properti.items()}, "geometry": geom})
    keluaran = {
        "type": "FeatureCollection",
        "metadata": {"lapis": lapis, **meta, "dibuat": date.today().isoformat(), "statistik": stat},
        "features": fitur,
    }
    teks = json.dumps(keluaran, ensure_ascii=False, separators=(",", ":"))
    # 5 angka desimal (sekitar 1 m) sudah jauh lebih rinci dari skala sumbernya
    import re

    teks = re.sub(r"(-?\d+\.\d{5})\d+", r"\1", teks)
    (KELUAR / f"{WILAYAH}-konteks-{lapis}.geojson").write_text(teks, encoding="utf-8")
    print(f"{lapis}: {len(fitur)} fitur, {len(teks) // 1024} KB, SHP di {SHP / f'{WILAYAH}-{nama}.shp'}")
    for s in stat:
        print(f"  {s['nama'][:34]:34} {s['luasKm2']:7.1f} km2  piksel {s['nPiksel']:6d}  median {s.get('median', '-')}  porsi >=4 cm {s.get('porsiTinggi', '-')}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--rtrw", type=Path, help="SHP pola ruang RTRW Kota resmi (kolom NAMOBJ, KODKWS)")
    ap.add_argument("--geologi", type=Path, help="SHP geologi hasil digitasi (kolom KODE, NAMA, BATUAN, SIFAT, WARNA)")
    a = ap.parse_args()
    KONTEKS.mkdir(parents=True, exist_ok=True)
    kota = kota_utm()

    rtrw, meta_rtrw = olah_rtrw(a.rtrw, kota)
    if a.rtrw:
        meta_rtrw["catatan"] = ""
    elif WILAYAH == "jakarta":
        meta_rtrw["catatan"] = (
            "Pola ruang adalah rencana peruntukan lahan, bukan guna lahan saat ini. RDTR sudah rinci sampai blok, tetapi di sini disederhanakan "
            "dan Badan Jalan tidak ditampilkan. Untuk kepastian satu persil, cek KKPR di JAKI atau DPMPTSP DKI."
        )
    else:
        meta_rtrw["catatan"] = (
            "Pola ruang adalah rencana peruntukan lahan, bukan guna lahan saat ini. Skala provinsi cocok untuk gambaran kawasan, "
            f"tidak untuk memastikan peruntukan satu persil. Untuk itu cek RDTR dan KKPR di dinas tata ruang {NAMA_WILAYAH} atau GISTARU."
        )
    tulis(rtrw, "rtrw-pola-ruang", "rtrw", meta_rtrw, {"kode": "KODKWS", "nama": "NAMOBJ", "fungsi": "FUNGSI", "warna": "WARNA"}, statistik(rtrw, "NAMOBJ", "KODKWS"))

    hasil_geo = olah_geologi(a.geologi, kota)
    if hasil_geo is None:
        print("geologi: tidak dibuat (tidak ada peta PSG, dan perkiraan dari bentuk lahan tidak bermakna di wilayah ini)")
        return
    geo, meta_geo = hasil_geo
    if a.geologi:
        meta_geo["catatan"] = ""
    elif meta_geo["jenis"] == "perkiraan":
        meta_geo["catatan"] = (
            "Batas satuan diperkirakan dari bentuk lahan, bukan dari peta geologi. Jalankan 07a_digitasi_geologi.py dengan raster peta PSG "
            "untuk menggantinya."
        )
    else:
        meta_geo["catatan"] = (
            "Peta skala 1:100.000 menggambarkan satuan batuan di permukaan, bukan kondisi tanah di bawah satu persil. "
            "Ketebalan endapan lunak di bawah rumah tetap perlu diketahui dari penyelidikan tanah (sondir atau boring)."
        )
    tulis(geo, "geologi-permukaan", "geologi", meta_geo, {"kode": "KODE", "nama": "NAMA", "batuan": "BATUAN", "sifat": "SIFAT", "warna": "WARNA"}, statistik(geo, "NAMA", "KODE"))


if __name__ == "__main__":
    pd.options.mode.copy_on_write = True
    main()
