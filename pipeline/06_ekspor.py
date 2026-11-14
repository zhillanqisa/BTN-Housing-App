"""Langkah 6: ekspor hasil ke format yang dibaca aplikasi.

Masukan:
    <kerja>/hasil/vertikal.npz dan validasi.json   dari langkah 5
    public/data/<wilayah>-kawasan.geojson          geometri dan nama kelurahan (angkanya diganti)

Keluaran di public/data, format sama dengan scripts/build-demo-data.mjs:
    <wilayah>-grid.json         kepala grid piksel
    <wilayah>-grid-laju.bin     Int16 per piksel, x skalaLaju = cm/tahun, positif = turun
    <wilayah>-grid-sigma.bin    Int16 per piksel, galat
    <wilayah>-grid-deret.bin    Int16, deret triwulanan piksel terukur, x skalaDeret = cm
    <wilayah>-kawasan.geojson  ringkasan per kelurahan, metadata jenis "olahan"

Jalankan:
    python pipeline/06_ekspor.py

Grid aplikasi memakai lintang-bujur (sel 0,00072 derajat, sekitar 80 m). Tiap sel mengambil
piksel UTM 80 m yang memuat titik tengahnya, tanpa perataan.
"""
from __future__ import annotations

import json
from datetime import date

import numpy as np
from pyproj import Transformer
from rasterio import features
from rasterio.transform import from_origin
from shapely.geometry import shape

from umum import AREA_STABIL, GNSS, KERJA, LINTASAN, NAMA_WILAYAH, PEMBANDING, REF_LAJU_TURUN_CM, REF_NAMA, REPO, WILAYAH, dir_lintasan

KELUAR = REPO / "public" / "data"
SEL = 0.00072
NODATA = -32768  # di dalam kota tetapi tidak terukur
LUAR = -32767  # di luar batas kota
SKALA_LAJU = 0.01
SKALA_DERET = 0.1
# Ringkasan kelurahan dianggap memadai bila piksel terukur cukup banyak dan cukup merata.
MIN_PIKSEL = 15
MIN_CAKUPAN = 0.2

SUMBER = [
    {"nama": "Citra radar: Copernicus Sentinel-1 (ESA), diunduh lewat Alaska Satellite Facility", "url": "https://search.asf.alaska.edu/", "catatan": "Berisi data Copernicus Sentinel yang dimodifikasi."},
    {"nama": "Interferogram: ASF HyP3, produk InSAR burst (ISCE2)", "url": "https://hyp3-docs.asf.alaska.edu/"},
    {"nama": "Deret waktu: MintPy, Yunjun, Fattahi & Amelung (2019)", "url": "https://doi.org/10.1016/j.cageo.2019.104331"},
    {"nama": "Batas kelurahan: © OpenStreetMap contributors (ODbL)", "url": "https://www.openstreetmap.org/copyright"},
    {
        "nama": "Rentang pembanding: Chaussard, Amelung, Abidin & Hong (2013), InSAR 2007-2009",
        "url": "https://earth.esa.int/eogateway/documents/20142/37627/Sinking-cities-Indonesia-space-geodetic-evidence-rates-spatial-distribution-land-subsidence.pdf",
        "catatan": "Semarang hingga sekitar 14 cm/tahun, sebagaimana dirujuk di rangkuman tim.",
    },
    {
        "nama": "Rentang pembanding: Pujiastuti dkk. (2015), Semarang Timur dan Tanah Mas",
        "url": "https://ejournal.undip.ac.id/index.php/mkts/article/download/11225/8815",
        "catatan": "Tanah Mas 5,5-7,2 cm/tahun, sebagaimana dirujuk di rangkuman tim.",
    },
]

BATAS_BPS = {"nama": "Batas desa/kelurahan: BPS 2020 lewat HDX COD-AB (CC BY-IGO)", "url": "https://data.humdata.org/dataset/cod-ab-idn"}
# Kisaran publikasi untuk dibandingkan dengan hasil olah. Hanya yang angkanya dirujuk langsung.
LITERATUR = {
    "semarang": SUMBER[4:],
    "jakarta": [
        {
            "nama": "Rentang pembanding: Abidin dkk. (2011), Land subsidence of Jakarta (Indonesia) and its relation with urban development, Natural Hazards 59",
            "url": "https://doi.org/10.1007/s11069-011-9866-9",
            "catatan": "1 sampai 15 cm/tahun, di beberapa lokasi sampai 20-28 cm/tahun (pengukuran 1982-2010).",
        }
    ],
}


def r(v: float, angka: int = 1) -> float:
    """Bulatkan seperti Math.round di JavaScript (setengah ke atas)."""
    k = 10**angka
    return float(np.floor(v * k + 0.5) / k)


def koma(v: float, angka: int = 1) -> str:
    return f"{v:.{angka}f}".replace(".", ",")


def ribuan(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def main() -> None:
    hasil = KERJA / "hasil"
    z = np.load(hasil / "vertikal.npz")
    validasi = json.loads((hasil / "validasi.json").read_text(encoding="utf-8"))
    berkas_kawasan = KELUAR / f"{WILAYAH}-kawasan.geojson"
    kawasan = json.loads(berkas_kawasan.read_text(encoding="utf-8"))
    fitur = kawasan["features"]
    bentuk = [shape(f["geometry"]) for f in fitur]

    # ---------- grid aplikasi ----------
    w = min(b.bounds[0] for b in bentuk)
    s = min(b.bounds[1] for b in bentuk)
    e = max(b.bounds[2] for b in bentuk)
    n = max(b.bounds[3] for b in bentuk)
    barat = np.floor(w / SEL) * SEL
    utara = np.ceil(n / SEL) * SEL
    nx = int(np.ceil((e - barat) / SEL))
    ny = int(np.ceil((utara - s) / SEL))

    milik = features.rasterize(((b, i + 1) for i, b in enumerate(bentuk)), out_shape=(ny, nx), transform=from_origin(barat, utara, SEL, SEL), fill=0, dtype="int16") - 1
    bujur, lintang = np.meshgrid(barat + (np.arange(nx) + 0.5) * SEL, utara - (np.arange(ny) + 0.5) * SEL)
    x, y = Transformer.from_crs(4326, int(z["epsg"]), always_xy=True).transform(bujur, lintang)
    kol = np.floor((x - float(z["x0"])) / float(z["piksel"])).astype(int)
    brs = np.floor((float(z["y0"]) - y) / float(z["piksel"])).astype(int)
    sy, sx = z["laju"].shape
    di_sumber = (kol >= 0) & (kol < sx) & (brs >= 0) & (brs < sy)
    kol, brs = np.clip(kol, 0, sx - 1), np.clip(brs, 0, sy - 1)

    def ambil(nama: str) -> np.ndarray:
        return np.where(di_sumber, z[nama][brs, kol], np.nan)

    laju_cm, sigma_cm, koherensi = ambil("laju"), ambil("sigma"), ambil("koherensi")
    sumber = np.where(di_sumber, z["sumber"][brs, kol], 0)
    dalam = milik >= 0
    terukur = dalam & np.isfinite(laju_cm)

    laju = np.full((ny, nx), LUAR, np.int16)
    sigma = np.full((ny, nx), LUAR, np.int16)
    laju[dalam], sigma[dalam] = NODATA, NODATA
    laju[terukur] = np.clip(np.round(laju_cm[terukur] / SKALA_LAJU), -30000, 30000)
    sigma[terukur] = np.clip(np.round(sigma_cm[terukur] / SKALA_LAJU), 1, 30000)

    epoch = [float(t) for t in z["epoch"]]
    n_epoch = len(epoch)
    # piksel terukur dalam urutan baris demi baris, sama dengan urutan yang dibaca aplikasi
    deret = np.clip(np.round(z["deret"][:, brs[terukur], kol[terukur]].T / SKALA_DERET), -32000, 32000).astype(np.int16)
    deret[:, 0] = 0
    n_valid = int(terukur.sum())
    posisi = np.full((ny, nx), -1, np.int32)
    posisi[terukur] = np.arange(n_valid)

    # ---------- ringkasan per kelurahan (aturan sama dengan build-demo-data.mjs) ----------
    for m, f in enumerate(fitur):
        p = f["properties"]
        di_sini = milik == m
        ukur = di_sini & terukur
        total, n_piksel = int(di_sini.sum()), int(ukur.sum())
        memadai = n_piksel >= MIN_PIKSEL and (n_piksel / total if total else 0) >= MIN_CAKUPAN
        koh = koherensi[di_sini]
        baru = {"laju": None, "sigma": None, "sebaran": None, "nPiksel": n_piksel, "koherensi": r(float(np.nanmean(koh)), 2) if np.isfinite(koh).any() else None, "memadai": memadai, "deret": []}
        if memadai:
            nilai = laju[ukur] * SKALA_LAJU
            med = float(np.median(nilai))
            mad = float(np.median(np.abs(nilai - med)))
            galat = float(np.median(sigma[ukur] * SKALA_LAJU))
            baru["laju"] = r(med)
            baru["sigma"] = r(float(np.hypot(1.4826 * mad, galat)))
            baru["sebaran"] = [r(float(v)) for v in np.percentile(nilai, [10, 90])]
            tengah = np.median(deret[posisi[ukur]], axis=0) * SKALA_DERET
            baru["deret"] = [[t, r(float(v))] for t, v in zip(epoch, tengah)]
            baru["deret"][0][1] = 0
        f["properties"] = {"id": p["id"], "nama": p["nama"], "kecamatan": p["kecamatan"], **baru, "jarakPantaiKm": p.get("jarakPantaiKm")}

    # ---------- metadata ----------
    lin = validasi["lintasan"]
    al, bk = validasi["antarLintasan"], validasi.get("bukit")
    awal, akhir = min(d["awal"] for d in lin), max(d["akhir"] for d in lin)
    lulus = bool(validasi["gerbang"]["lulus"])
    # dihitung pada grid aplikasi, supaya cocok dengan jumlah piksel yang ditampilkan aplikasi
    satu = int((terukur & (sumber > 1)).sum())
    hari_ini = date.today().isoformat()

    # titik ikat, koreksi atmosfer, dan catatan validasi mengikuti konfigurasi wilayah
    if REF_LAJU_TURUN_CM is not None:
        acuan = f"stasiun GNSS {REF_NAMA}"
        referensi = f"Stasiun GNSS {REF_NAMA} ({GNSS[REF_NAMA]['lokasi']}), stabil menurut Susilo dkk. (2023)"
    else:
        acuan = f"area stabil ({AREA_STABIL['keterangan']})"
        referensi = f"Area stabil: {AREA_STABIL['keterangan']}. Tidak ada stasiun GNSS stabil di dekat wilayah ini."
    pakai_tropo = all((dir_lintasan(l) / "mintpy" / "timeseries_tropHgt_demErr.h5").exists() for l in LINTASAN)
    koreksi = "Korelasi fase dengan ketinggian, ditaksir dari piksel perbukitan saja" if pakai_tropo else "Tidak ada (wilayah datar, korelasi fase dengan ketinggian tidak bermakna)"
    stasiun = [s["stasiun"] for s in validasi["gnss"]]
    sumber = [*SUMBER[:3]]
    if stasiun:
        sumber.append({"nama": f"GNSS: Susilo dkk. (2023), stasiun {', '.join(stasiun)} (CC BY 4.0)", "url": "https://doi.org/10.5281/zenodo.7775016"})
    sumber.append(BATAS_BPS if WILAYAH in ("pekalongan", "demak") else SUMBER[3])
    sumber.extend(LITERATUR.get(WILAYAH, []))
    catatan = []
    if REF_LAJU_TURUN_CM is not None:
        catatan.append(f"{REF_NAMA} adalah titik ikat, jadi bukan pembanding yang independen.")
    else:
        catatan.append(f"Laju diikat ke {acuan}, karena tidak ada stasiun GNSS stabil di dekat wilayah ini.")
    for s in validasi["gnss"]:
        if s["peran"] == "pembanding" and s.get("insar") is not None:
            catatan.append(
                f"Stasiun {s['stasiun']} ({PEMBANDING[s['stasiun']]['lokasi']}) adalah pembanding independen: GNSS {koma(s['gnss'], 2)} cm/tahun (2018-2021), "
                f"InSAR {koma(s['insar'], 2)} cm/tahun (2020-{akhir[:4]})."
            )
    if bk:
        catatan.append(f"Perbukitan, yang semestinya stabil, terukur median {koma(bk['median'], 2)} cm/tahun (80% pikselnya antara {koma(bk['p10'], 2)} dan {koma(bk['p90'], 2)}).")
    catatan.append(f"{ribuan(satu)} dari {ribuan(n_valid)} piksel terukur hanya terlihat dari satu lintasan; di sana gerak dianggap vertikal seluruhnya.")
    if not any(s["peran"] == "pembanding" for s in validasi["gnss"]):
        catatan.append("Belum ada pembanding lapangan di kawasan yang ambles.")
    metadata = {
        "jenis": "olahan",
        "judul": "Laju penurunan tanah dari InSAR Sentinel-1",
        "wilayah": NAMA_WILAYAH,
        "periode": [f"{awal[:4]}-{awal[4:6]}", f"{akhir[:4]}-{akhir[4:6]}"],
        "metode": (
            "InSAR deret waktu SBAS dari citra Sentinel-1, piksel 80 m. Interferogram dibuat di ASF HyP3, "
            "deret waktu disusun dengan MintPy, lalu dua arah lintasan satelit digabung menjadi gerak vertikal. "
            f"Laju adalah tren linear seluruh periode, relatif terhadap {acuan}."
        ),
        "sumber": sumber,
        "dibuat": hari_ini,
        "catatan": (
            "Hasil olah tim dari data satelit, belum diverifikasi dengan pengukuran lapangan. "
            "Angka menggambarkan blok sekitar 240 m di sekitar titik, bukan satu bangunan. Pakai sebagai bahan pertimbangan, bukan satu-satunya dasar keputusan."
        ),
        "proses": {
            "lintasan": [{"arah": d["arah"], "path": d["path"], "nCitra": d["nCitra"], "nPasangan": d["nPasangan"]} for d in lin],
            "resolusiM": int(z["piksel"]),
            "referensi": referensi,
            "koreksiAtmosfer": koreksi,
            "vertikal": "dua-lintasan",
            "validasi": {
                "antarLintasan": al,
                "gnss": [{k: v for k, v in s.items() if v is not None} for s in validasi["gnss"]],
                "lulus": lulus,
                "catatan": " ".join(catatan),
            },
            "konteks": [],
        },
    }
    kepala = {
        "versi": 1,
        "jenis": "olahan",
        "dibuat": hari_ini,
        "bbox": [round(float(barat), 6), round(float(utara - ny * SEL), 6), round(float(barat + nx * SEL), 6), round(float(utara), 6)],
        "nx": nx,
        "ny": ny,
        "selDerajat": SEL,
        "ukuranSelM": int(z["piksel"]),
        "nodata": NODATA,
        "luar": LUAR,
        "skalaLaju": SKALA_LAJU,
        "skalaDeret": SKALA_DERET,
        "epoch": epoch,
        "nValid": n_valid,
        "berkas": {"laju": f"{WILAYAH}-grid-laju.bin", "sigma": f"{WILAYAH}-grid-sigma.bin", "deret": f"{WILAYAH}-grid-deret.bin"},
    }

    # ---------- tulis ----------
    berkas_kawasan.write_text(json.dumps({"type": "FeatureCollection", "metadata": metadata, "features": fitur}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (KELUAR / f"{WILAYAH}-grid.json").write_text(json.dumps(kepala, separators=(",", ":")), encoding="utf-8")
    (KELUAR / kepala["berkas"]["laju"]).write_bytes(laju.astype("<i2").tobytes())
    (KELUAR / kepala["berkas"]["sigma"]).write_bytes(sigma.astype("<i2").tobytes())
    (KELUAR / kepala["berkas"]["deret"]).write_bytes(deret.astype("<i2").tobytes())

    # ---------- ringkasan ----------
    n_dalam = int(dalam.sum())
    ok = [f["properties"] for f in fitur if f["properties"]["memadai"]]
    kat = {"rendah": 0, "sedang": 0, "tinggi": 0}
    for p in ok:
        kat["tinggi" if p["laju"] >= 4 else "sedang" if p["laju"] >= 2 else "rendah"] += 1
    print(f"Grid {nx} x {ny} | di dalam kota {n_dalam} | terukur {n_valid} ({100 * n_valid / n_dalam:.0f}%) | satu lintasan {satu} | epoch {n_epoch}")
    print(f"Kelurahan: {len(fitur)} | memadai {len(ok)} | laju min {min(p['laju'] for p in ok)} maks {max(p['laju'] for p in ok)} | kategori (ambang 2/4): {kat}")
    for nama in ("Panggung Lor", "Kaligawe", "Terboyo Wetan", "Tanjung Mas", "Tlogosari Kulon", "Pekunden", "Tembalang", "Ngaliyan", "Mangunharjo"):
        p = next((f["properties"] for f in fitur if f["properties"]["nama"] == nama), None)
        if p:
            print(f"  {nama}: laju {p['laju']} ± {p['sigma']}, sebaran {p['sebaran']}, koherensi {p['koherensi']}, piksel {p['nPiksel']}, memadai {p['memadai']}")
    print(f"Validasi: RMSE antarlintasan {al['rmse']} cm/tahun (n={al['n']}, bias {al['bias']}, r {al['r']}) | gerbang mutu {'LULUS' if lulus else 'GAGAL'}")


if __name__ == "__main__":
    main()
