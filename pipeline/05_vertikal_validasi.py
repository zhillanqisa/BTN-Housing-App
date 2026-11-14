"""Langkah 5: gabung dua lintasan menjadi gerak vertikal, lalu validasi.

Masukan: keluaran MintPy tiap lintasan (langkah 4), pada grid UTM 80 m yang sama.

Keluaran di <kerja>/hasil:
    vertikal.npz     laju vertikal, galat, deret triwulanan, koherensi
    validasi.json    angka validasi dan gerbang mutu
    tinjau_*.png     gambar untuk ditinjau

Jalankan:
    python pipeline/05_vertikal_validasi.py

Cara gabung:
- Piksel yang terukur di dua lintasan: gerak arah pandang (LOS) ascending dan descending
  diurai menjadi komponen vertikal dan timur-barat. Komponen utara-selatan diabaikan
  karena Sentinel-1 hampir tidak peka ke arah itu.
- Piksel yang terukur di satu lintasan saja: gerak dianggap vertikal seluruhnya.

Tanda: laju positif = tanah turun (cm/tahun). Deret negatif = turun (cm).
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import geopandas as gpd
import h5py
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from rasterio import features
from rasterio.transform import from_origin

from pyproj import Transformer

from umum import AOI_KOTA, AREA_STABIL, EPSG_UTM, KERJA, LINTASAN, PEMBANDING, PIKSEL_M, REF_LAJU_TURUN_CM, REF_LALO, REF_NAMA, TINGGI_BUKIT_M, TROPOSFER, dir_lintasan

# Gerbang mutu (cm/tahun).
MAKS_RMSE_ANTAR_LINTASAN = 1.0
MAKS_SELISIH_GNSS = 0.5  # di stasiun titik ikat
# Stasiun pembanding: periode GNSS (sampai 2021) tidak sama dengan periode InSAR (2020 dan seterusnya),
# jadi batasnya lebih longgar.
MAKS_SELISIH_PEMBANDING = 1.0


def tahun_desimal(tanggal: str) -> float:
    d = date(int(tanggal[:4]), int(tanggal[4:6]), int(tanggal[6:]))
    awal = date(d.year, 1, 1)
    return d.year + (d - awal).days / (date(d.year + 1, 1, 1) - awal).days


def jumlah_triplet(pasangan: set[tuple[str, str]]) -> int:
    tanggal = sorted({t for p in pasangan for t in p})
    return sum(1 for a, b in pasangan for c in tanggal if c > b and (b, c) in pasangan and (a, c) in pasangan)


def baca_lintasan(nama: str) -> dict:
    d = dir_lintasan(nama) / "mintpy"

    def satu(berkas: str, kunci: str) -> np.ndarray:
        with h5py.File(d / berkas, "r") as h:
            return h[kunci][:]

    with h5py.File(d / "velocity.h5", "r") as h:
        laju, galat = h["velocity"][:], h["velocityStd"][:]
        atr = {k: h.attrs[k] for k in ("X_FIRST", "Y_FIRST", "X_STEP", "Y_STEP", "EPSG", "REF_Y", "REF_X")}
    # deret terakhir: dengan koreksi troposfer bila ada, tanpa bila wilayahnya datar
    akhir = d / "timeseries_tropHgt_demErr.h5"
    if not akhir.exists():
        akhir = d / "timeseries_demErr.h5"
    with h5py.File(akhir, "r") as h:
        deret = h["timeseries"][:]
        tanggal = [t.decode() for t in h["date"][:]]
    with h5py.File(d / "inputs" / "ifgramStack.h5", "r") as h:
        pasangan = [(a.decode(), b.decode()) for a, b in h["date"][:]]
        pakai = h["dropIfgram"][:].astype(bool)
    dipakai = {p for p, ya in zip(pasangan, pakai) if ya}
    semua_tanggal = {t for p in pasangan for t in p}
    return {
        "nama": nama,
        "laju": laju,  # m/tahun arah pandang, positif = mendekati satelit
        "galat": galat,
        "andal": satu("maskTempCoh.h5", "mask").astype(bool),
        "koherensi": satu("avgSpatialCoh.h5", "coherence"),
        "datang": satu("inputs/geometryGeo.h5", "incidenceAngle"),
        "azimut": satu("inputs/geometryGeo.h5", "azimuthAngle"),
        "tinggi": satu("inputs/geometryGeo.h5", "height"),
        "triplet_buruk": satu("numTriNonzeroIntAmbiguity.h5", "mask"),
        "n_triplet": jumlah_triplet(dipakai),
        "deret": deret,  # m
        "tanggal": tanggal,
        "tahun": np.array([tahun_desimal(t) for t in tanggal]),
        "n_pasangan": len(dipakai),
        "dibuang": sorted(semua_tanggal - set(tanggal)),
        "atr": atr,
    }


def vektor_los(datang: np.ndarray, azimut: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Komponen (timur, atas) vektor satuan dari tanah ke satelit.

    Konvensi MintPy: azimut diukur dari utara, berlawanan arah jarum jam.
    """
    i, a = np.deg2rad(datang), np.deg2rad(azimut)
    return -np.sin(i) * np.sin(a), np.cos(i)


def triwulan(deret: np.ndarray, tahun: np.ndarray, laju: np.ndarray, epoch: np.ndarray) -> np.ndarray:
    """Deret arah pandang pada titik tengah tiap triwulan, relatif ke epoch pertama.

    Nilai triwulan = rata-rata akuisisi di triwulan itu, digeser ke titik tengah memakai
    laju piksel (akuisisi tidak selalu tersebar rata dalam triwulan). Triwulan tanpa
    akuisisi diisi interpolasi linear dari triwulan berisi terdekat.
    """
    hasil = np.zeros((len(epoch), *deret.shape[1:]), np.float32)
    berisi = np.zeros(len(epoch), bool)
    for e, t in enumerate(epoch):
        s = np.abs(tahun - t) <= 0.125
        if s.any():
            hasil[e] = deret[s].mean(axis=0) - laju * (tahun[s].mean() - t)
            berisi[e] = True
    isi = np.flatnonzero(berisi)
    for e in np.flatnonzero(~berisi):
        kiri, kanan = isi[isi < e], isi[isi > e]
        if len(kiri) and len(kanan):
            a, b = kiri[-1], kanan[0]
            w = (epoch[e] - epoch[a]) / (epoch[b] - epoch[a])
            hasil[e] = hasil[a] * (1 - w) + hasil[b] * w
        else:
            k = kiri[-1] if len(kiri) else kanan[0]
            hasil[e] = hasil[k] + laju * (epoch[e] - epoch[k])
    return hasil - hasil[0]


def persentil(nilai: np.ndarray, daftar: list[int]) -> dict[str, float]:
    return {f"p{p}": round(float(v), 2) for p, v in zip(daftar, np.percentile(nilai, daftar))}


def main() -> None:
    asc, desc = baca_lintasan("asc"), baca_lintasan("desc")
    for k in ("X_FIRST", "Y_FIRST", "X_STEP", "Y_STEP"):
        if str(asc["atr"][k]) != str(desc["atr"][k]):
            raise SystemExit(f"Grid dua lintasan berbeda pada {k}: {asc['atr'][k]} vs {desc['atr'][k]}")
    ny, nx = asc["laju"].shape
    x0, y0 = float(asc["atr"]["X_FIRST"]), float(asc["atr"]["Y_FIRST"])
    ref_y, ref_x = int(asc["atr"]["REF_Y"]), int(asc["atr"]["REF_X"])
    if (ref_y, ref_x) != (int(desc["atr"]["REF_Y"]), int(desc["atr"]["REF_X"])) and not AREA_STABIL:
        # 04_mintpy.py bisa memindah acuan tiap lintasan ke piksel andal terdekat dari stasiun, dan pilihannya
        # bisa berbeda. Kedua lintasan diikat ulang ke satu piksel yang andal di keduanya, terdekat ke stasiun.
        sx, sy = Transformer.from_crs(4326, EPSG_UTM, always_xy=True).transform(REF_LALO[1], REF_LALO[0])
        sc, sr = int((sx - x0) // PIKSEL_M), int((y0 - sy) // PIKSEL_M)
        rr, cc = np.nonzero(asc["andal"] & desc["andal"])
        if not len(rr):
            raise SystemExit("Tidak ada piksel yang andal di dua lintasan untuk acuan bersama.")
        skor = np.hypot(rr - sr, cc - sc) - 2 * (asc["koherensi"][rr, cc] + desc["koherensi"][rr, cc])
        k = int(np.argmin(skor))
        ref_y, ref_x = int(rr[k]), int(cc[k])
        for dd in (asc, desc):
            geser = float(dd["laju"][ref_y, ref_x])
            dd["laju"] = dd["laju"] - geser
            dd["deret"] = dd["deret"] - dd["deret"][:, ref_y, ref_x][:, None, None]
            print(f"  {dd['nama']}: acuan bersama ({ref_y}, {ref_x}), laju digeser {100 * geser:+.2f} cm/tahun arah pandang")
        print(f"Acuan bersama {PIKSEL_M * np.hypot(ref_y - sr, ref_x - sc):.0f} m dari stasiun {REF_NAMA}.")

    kota = gpd.read_file(AOI_KOTA).to_crs(EPSG_UTM)
    dalam = features.rasterize(((g, 1) for g in kota.geometry), out_shape=(ny, nx), transform=from_origin(x0, y0, PIKSEL_M, PIKSEL_M), fill=0, dtype="uint8").astype(bool)

    te_a, ta_a = vektor_los(asc["datang"], asc["azimut"])
    te_d, ta_d = vektor_los(desc["datang"], desc["azimut"])
    # Satelit di barat titik saat ascending dan di timur saat descending (Sentinel-1 memandang ke kanan).
    if not (np.nanmedian(te_a) < 0 < np.nanmedian(te_d)):
        raise SystemExit(f"Arah pandang tidak sesuai harapan: timur asc {np.nanmedian(te_a):.2f}, desc {np.nanmedian(te_d):.2f}")
    det = te_a * ta_d - te_d * ta_a

    def urai(la: np.ndarray, ld: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """(atas, timur) dari gerak arah pandang ascending dan descending."""
        return (te_a * ld - te_d * la) / det, (la * ta_d - ld * ta_a) / det

    ma, md = asc["andal"], desc["andal"]
    dua, hanya_a, hanya_d = ma & md, ma & ~md, md & ~ma
    terukur = ma | md
    sumber = np.zeros((ny, nx), np.uint8)  # 0 tidak terukur, 1 dua lintasan, 2 hanya ascending, 3 hanya descending
    sumber[dua], sumber[hanya_a], sumber[hanya_d] = 1, 2, 3

    # ---------- ikat ulang ke area stabil (wilayah tanpa stasiun GNSS stabil) ----------
    stabil = None
    if AREA_STABIL:
        stabil = terukur & (asc["tinggi"] > AREA_STABIL["tinggi_min"])
        if (stabil & ma).sum() < 200 or (stabil & md).sum() < 200:
            raise SystemExit(f"Area stabil terlalu kecil: {int((stabil & ma).sum())} piksel asc, {int((stabil & md).sum())} piksel desc")
        for dd, m in ((asc, stabil & ma), (desc, stabil & md)):
            dd["laju"] = dd["laju"] - np.median(dd["laju"][m])
            dd["deret"] = dd["deret"] - np.median(dd["deret"][:, m], axis=1)[:, None, None]
        print(f"Diikat ulang ke {int(stabil.sum())} piksel area stabil ({AREA_STABIL['keterangan']}).")

    # Laju turun bila gerak dianggap vertikal seluruhnya, per lintasan (cm/tahun).
    turun_a = -100 * asc["laju"] / ta_a
    turun_d = -100 * desc["laju"] / ta_d
    atas, timur = urai(asc["laju"], desc["laju"])
    laju = np.full((ny, nx), np.nan, np.float32)
    laju[dua] = -100 * atas[dua]
    laju[hanya_a] = turun_a[hanya_a]
    laju[hanya_d] = turun_d[hanya_d]

    # ---------- validasi ----------
    s = dua & dalam
    selisih = turun_a - turun_d
    rmse = float(np.sqrt(np.mean(selisih[s] ** 2)))
    antar = {"n": int(s.sum()), "rmse": round(rmse, 2), "bias": round(float(selisih[s].mean()), 2), "r": round(float(np.corrcoef(turun_a[s], turun_d[s])[0, 1]), 3)}

    ke_utm = Transformer.from_crs(4326, EPSG_UTM, always_xy=True)

    def laju_di(lat: float, lon: float, tanpa_tengah: bool = False) -> float | None:
        """Median laju di blok 3 x 3 piksel sekitar satu titik."""
        x, y = ke_utm.transform(lon, lat)
        c, r = int((x - x0) // PIKSEL_M), int((y0 - y) // PIKSEL_M)
        if not (1 <= r < ny - 1 and 1 <= c < nx - 1):
            return None
        blok = np.zeros((ny, nx), bool)
        blok[r - 1 : r + 2, c - 1 : c + 2] = True
        if tanpa_tengah:
            blok[r, c] = False  # piksel referensi nol karena definisi
        m = blok & terukur
        return round(float(np.median(laju[m])), 2) if m.any() else None

    gnss = []
    if REF_LAJU_TURUN_CM is not None:
        gnss.append({"stasiun": REF_NAMA, "peran": "titik ikat", "gnss": REF_LAJU_TURUN_CM, "insar": laju_di(*REF_LALO, tanpa_tengah=True)})
    for nama_st, g in PEMBANDING.items():
        gnss.append({"stasiun": nama_st, "peran": "pembanding", "gnss": g["laju_turun"], "insar": laju_di(*g["lalo"])})
    # Pembanding yang tidak terukur (di luar cakupan citra atau tidak koheren) dicatat tetapi tidak ikut
    # menentukan lulus; titik ikat yang tidak terukur tetap membuat gerbang gagal.
    for s_ in gnss:
        if s_["insar"] is None:
            s_["catatan"] = "tidak terukur: di luar cakupan citra atau koherensi rendah"
    cocok = [
        (s_["insar"] is None and s_["peran"] == "pembanding")
        or (s_["insar"] is not None and abs(s_["insar"] - s_["gnss"]) <= (MAKS_SELISIH_GNSS if s_["peran"] == "titik ikat" else MAKS_SELISIH_PEMBANDING))
        for s_ in gnss
    ]
    lulus = rmse <= MAKS_RMSE_ANTAR_LINTASAN and all(cocok)

    # statistik perbukitan hanya bermakna di wilayah yang memang punya perbukitan stabil (koreksi troposfer "bukit");
    # di Jakarta piksel di atas ambang ini hanyalah dataran selatan, bukan perbukitan
    bukit = terukur & (asc["tinggi"] > TINGGI_BUKIT_M) & (TROPOSFER == "bukit")

    # ---------- galat per piksel ----------
    formal = np.full((ny, nx), np.nan, np.float32)
    formal[dua] = (100 * np.sqrt((te_a * desc["galat"]) ** 2 + (te_d * asc["galat"]) ** 2) / np.abs(det))[dua]
    formal[hanya_a] = (100 * asc["galat"] / ta_a)[hanya_a]
    formal[hanya_d] = (100 * desc["galat"] / ta_d)[hanya_d]
    # Galat formal MintPy terlalu kecil (hanya dari sebaran deret). Lantainya RMSE antarlintasan,
    # dan untuk piksel dua lintasan juga setengah selisih kedua lintasan di piksel itu.
    sigma = np.maximum(formal, rmse)
    sigma[dua] = np.maximum(sigma[dua], np.abs(selisih[dua]) / 2)

    # ---------- deret triwulanan ----------
    awal = max(asc["tahun"][0], desc["tahun"][0])
    akhir = min(asc["tahun"][-1], desc["tahun"][-1])
    epoch = np.arange(np.floor(awal * 4), np.floor(akhir * 4) + 1) / 4 + 0.125
    qa = triwulan(asc["deret"], asc["tahun"], asc["laju"], epoch)
    qd = triwulan(desc["deret"], desc["tahun"], desc["laju"], epoch)
    deret = np.full((len(epoch), ny, nx), np.nan, np.float32)
    deret[:, dua] = (100 * urai(qa, qd)[0])[:, dua]
    deret[:, hanya_a] = (100 * qa / ta_a)[:, hanya_a]
    deret[:, hanya_d] = (100 * qd / ta_d)[:, hanya_d]

    koherensi = (asc["koherensi"] + desc["koherensi"]) / 2

    hasil = KERJA / "hasil"
    hasil.mkdir(exist_ok=True)
    np.savez_compressed(
        hasil / "vertikal.npz",
        laju=laju, sigma=sigma.astype(np.float32), sumber=sumber, deret=deret, epoch=epoch,
        koherensi=koherensi.astype(np.float32), timur=np.where(dua, 100 * timur, np.nan).astype(np.float32),
        tinggi=asc["tinggi"], x0=x0, y0=y0, piksel=PIKSEL_M, epsg=EPSG_UTM,
    )  # fmt: skip

    k = terukur & dalam
    validasi = {
        "dibuat": date.today().isoformat(),
        "lintasan": [
            {
                "nama": d["nama"],
                "arah": LINTASAN[d["nama"]]["arah"].lower(),
                "path": LINTASAN[d["nama"]]["path"],
                "nCitra": len(d["tanggal"]),
                "nPasangan": d["n_pasangan"],
                "awal": d["tanggal"][0],
                "akhir": d["tanggal"][-1],
                "citraDibuang": d["dibuang"],
                "nTriplet": d["n_triplet"],
                "tripletBuruk": persentil(d["triplet_buruk"][d["andal"] & np.isfinite(d["triplet_buruk"])], [50, 90, 99]),
            }
            for d in (asc, desc)
        ],
        "epoch": [round(float(t), 3) for t in epoch],
        "piksel": {
            "kota": int(dalam.sum()),
            "terukur": int(k.sum()),
            "duaLintasan": int((dua & dalam).sum()),
            "hanyaAscending": int((hanya_a & dalam).sum()),
            "hanyaDescending": int((hanya_d & dalam).sum()),
        },
        "antarLintasan": antar,
        "gnss": gnss,
        "areaStabil": ({"n": int(stabil.sum()), "keterangan": AREA_STABIL["keterangan"]} if stabil is not None else None),
        "bukit": ({"n": int(bukit.sum()), "median": round(float(np.median(laju[bukit])), 2), **persentil(laju[bukit], [10, 90])} if bukit.sum() >= 50 else None),
        "timurBarat": persentil(100 * timur[s], [5, 50, 95]),
        "lajuKota": {**persentil(laju[k], [1, 5, 25, 50, 75, 95, 99]), "maks": round(float(laju[k].max()), 2)},
        "sigmaKota": persentil(sigma[k], [50, 90, 99]),
        "gerbang": {"maksRmseAntarLintasan": MAKS_RMSE_ANTAR_LINTASAN, "maksSelisihGnss": MAKS_SELISIH_GNSS, "maksSelisihPembanding": MAKS_SELISIH_PEMBANDING, "lulus": bool(lulus)},
    }
    (hasil / "validasi.json").write_text(json.dumps(validasi, indent=2), encoding="utf-8")
    print(json.dumps(validasi, indent=2))

    gambar(hasil, laju, sumber, dalam, turun_a, turun_d, s, selisih, epoch, deret, qa / ta_a * 100, qd / ta_d * 100, dua)


def gambar(hasil: Path, laju, sumber, dalam, turun_a, turun_d, s, selisih, epoch, deret, deret_a, deret_d, dua) -> None:
    fig, ax = plt.subplots(1, 2, figsize=(15, 6))
    im = ax[0].imshow(np.where(dalam, laju, np.nan), cmap="RdYlBu_r", vmin=-2, vmax=10)
    ax[0].set_title("Laju turun vertikal, cm/tahun (di dalam batas kota)")
    plt.colorbar(im, ax=ax[0], shrink=0.8)
    im = ax[1].imshow(np.where(dalam, sumber, np.nan), cmap="viridis", vmin=0, vmax=3)
    ax[1].set_title("Sumber: 0 tidak terukur, 1 dua lintasan, 2 hanya asc, 3 hanya desc")
    plt.colorbar(im, ax=ax[1], shrink=0.8)
    plt.tight_layout()
    plt.savefig(hasil / "tinjau_vertikal.png", dpi=90)
    plt.close(fig)

    fig, ax = plt.subplots(1, 2, figsize=(13, 5.5))
    hb = ax[0].hexbin(turun_d[s], turun_a[s], gridsize=70, bins="log", cmap="magma_r")
    batas = [-2, 14]
    ax[0].plot(batas, batas, "k--", lw=1)
    ax[0].set(xlim=batas, ylim=batas, xlabel="descending, cm/tahun", ylabel="ascending, cm/tahun", title="Laju turun per piksel: ascending vs descending")
    plt.colorbar(hb, ax=ax[0], label="jumlah piksel")
    ax[1].hist(selisih[s], bins=np.linspace(-3, 3, 121), color="#3b6fb6")
    ax[1].set(xlabel="ascending - descending, cm/tahun", ylabel="jumlah piksel", title="Selisih dua lintasan")
    plt.tight_layout()
    plt.savefig(hasil / "tinjau_antar_lintasan.png", dpi=90)
    plt.close(fig)

    # Deret pada empat piksel dua-lintasan: cepat, sedang, lambat, stabil.
    kandidat = np.argwhere(dua & dalam)
    nilai = laju[dua & dalam]
    fig, ax = plt.subplots(2, 2, figsize=(13, 8), sharex=True)
    for sumbu, p in zip(ax.ravel(), (99, 85, 60, 20)):
        y, x = kandidat[np.argmin(np.abs(nilai - np.percentile(nilai, p)))]
        sumbu.plot(epoch, deret_a[:, y, x], "o-", ms=3, lw=0.8, label="ascending saja")
        sumbu.plot(epoch, deret_d[:, y, x], "s-", ms=3, lw=0.8, label="descending saja")
        sumbu.plot(epoch, deret[:, y, x], "k-", lw=1.8, label="vertikal gabungan")
        sumbu.set_title(f"piksel ({y}, {x}): {laju[y, x]:.1f} cm/tahun")
        sumbu.set_ylabel("cm")
        sumbu.grid(alpha=0.3)
    ax[0, 0].legend()
    plt.tight_layout()
    plt.savefig(hasil / "tinjau_deret.png", dpi=90)
    plt.close(fig)


if __name__ == "__main__":
    main()
