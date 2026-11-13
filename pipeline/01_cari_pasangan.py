"""Langkah 1: cari burst Sentinel-1 di atas Kota Semarang dan susun jaringan pasangan SBAS.

Tidak butuh login. Hanya membaca katalog publik ASF.

Jalankan:
    python pipeline/01_cari_pasangan.py --lintasan desc
    python pipeline/01_cari_pasangan.py --lintasan asc

Keluaran di folder kerja:
    pasangan_<lintasan>.csv   satu baris per interferogram
    ringkasan_<lintasan>.json burst terpilih, jumlah citra, jumlah pasangan
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import date, datetime

import asf_search as asf
from shapely.geometry import shape
from shapely.ops import unary_union

from umum import AOI_KOTA, HARI_TAHUNAN, LINTASAN, MULAI, TAHUNAN_TIAP, TETANGGA, TOLERANSI_TAHUNAN, pastikan_kerja


def muat_kota():
    gj = json.loads(AOI_KOTA.read_text(encoding="utf-8"))
    return unary_union([shape(f["geometry"]) for f in gj["features"]])


def cari_burst(kota, arah: str, path: int, mulai: str, akhir: str):
    """Semua burst VV pada lintasan ini yang memotong batas kota."""
    wkt = kota.convex_hull.simplify(0.002).wkt
    return asf.search(
        dataset=asf.DATASET.SLC_BURST,
        intersectsWith=wkt,
        relativeOrbit=path,
        flightDirection=arah,
        polarization=asf.POLARIZATION.VV,
        start=mulai,
        end=akhir,
    )


def pilih_burst(produk, kota, min_tambahan: float):
    """Pilih burst (fullBurstID) secara serakah: mulai dari yang paling menutup kota, lalu
    tambah burst lain hanya bila menambah cakupan. Burst yang cuma tumpang tindih dilewati,
    supaya jumlah burst per job (dan biaya kredit serta ukuran unduhan) sekecil mungkin."""
    tapak = {}
    for p in produk:
        tapak.setdefault(p.properties["burst"]["fullBurstID"], shape(p.geometry).intersection(kota))
    cakupan = {b: g.area / kota.area for b, g in tapak.items()}
    terpilih: list[str] = []
    tertutup = None
    for b in sorted(cakupan, key=lambda x: -cakupan[x]):
        baru = tapak[b] if tertutup is None else tapak[b].difference(tertutup)
        if baru.area / kota.area >= min_tambahan:
            terpilih.append(b)
            tertutup = tapak[b] if tertutup is None else tertutup.union(tapak[b])
    gabungan = tertutup.area / kota.area if tertutup is not None else 0.0
    return sorted(terpilih), cakupan, gabungan


def susun_tanggal(produk, terpilih: list[str]):
    """Tanggal akuisisi yang punya SEMUA burst terpilih. Nilai: daftar sceneName urut burst."""
    per_tanggal: dict[date, dict[str, str]] = defaultdict(dict)
    wahana: dict[date, str] = {}
    for p in produk:
        b = p.properties["burst"]["fullBurstID"]
        if b not in terpilih:
            continue
        t = datetime.fromisoformat(p.properties["startTime"].replace("Z", "+00:00")).date()
        per_tanggal[t].setdefault(b, p.properties["sceneName"])
        wahana[t] = p.properties.get("platform", "")
    lengkap = {t: [d[b] for b in terpilih] for t, d in per_tanggal.items() if len(d) == len(terpilih)}
    return dict(sorted(lengkap.items())), len(per_tanggal) - len(lengkap), wahana


def susun_pasangan(tanggal: list[date]):
    """Jaringan SBAS: N tetangga berikutnya + pasangan sekitar satu tahun."""
    pasangan: set[tuple[date, date]] = set()
    for i, ref in enumerate(tanggal):
        for sec in tanggal[i + 1 : i + 1 + TETANGGA]:
            pasangan.add((ref, sec))
        if i % TAHUNAN_TIAP == 0:
            calon = [s for s in tanggal[i + 1 :] if abs((s - ref).days - HARI_TAHUNAN) <= TOLERANSI_TAHUNAN]
            if calon:
                pasangan.add((ref, min(calon, key=lambda s: abs((s - ref).days - HARI_TAHUNAN))))
    return sorted(pasangan)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), required=True)
    ap.add_argument("--mulai", default=MULAI)
    ap.add_argument("--akhir", default=date.today().isoformat())
    ap.add_argument("--min-tambahan", type=float, default=0.005, help="burst dipakai bila menambah cakupan minimal sebagian ini dari luas kota")
    a = ap.parse_args()

    ln = LINTASAN[a.lintasan]
    kota = muat_kota()
    produk = cari_burst(kota, ln["arah"], ln["path"], a.mulai, a.akhir)
    print(f"Lintasan {a.lintasan} (path {ln['path']}, {ln['arah']}): {len(produk)} burst VV ditemukan, {a.mulai} s.d. {a.akhir}")
    if not produk:
        raise SystemExit("Tidak ada burst. Periksa koneksi atau parameter.")

    terpilih, cakupan, gabungan = pilih_burst(produk, kota, a.min_tambahan)
    for b, c in sorted(cakupan.items(), key=lambda x: -x[1]):
        print(f"  burst {b}: menutup {c * 100:5.1f}% kota {'(dipakai)' if b in terpilih else '(dilewati)'}")
    print(f"Burst dipakai: {len(terpilih)}. Cakupan gabungan: {gabungan * 100:.1f}% luas kota.")
    if len(terpilih) > 15:
        raise SystemExit("Lebih dari 15 burst: melebihi batas HyP3. Naikkan --min-tambahan.")

    per_tanggal, tak_lengkap, wahana = susun_tanggal(produk, terpilih)
    tanggal = list(per_tanggal)
    pasangan = susun_pasangan(tanggal)
    per_tahun: dict[int, int] = defaultdict(int)
    for t in tanggal:
        per_tahun[t.year] += 1
    per_wahana: dict[str, int] = defaultdict(int)
    for t in tanggal:
        per_wahana[wahana.get(t, "")] += 1
    jarak = [(s - r).days for r, s in pasangan]
    print(f"Tanggal lengkap: {len(tanggal)} ({tanggal[0]} s.d. {tanggal[-1]}); tanggal tidak lengkap dibuang: {tak_lengkap}")
    print(f"  per tahun: {dict(per_tahun)}")
    print(f"  per wahana: {dict(per_wahana)}")
    print(f"Pasangan: {len(pasangan)} (jarak {min(jarak)} s.d. {max(jarak)} hari; {sum(1 for j in jarak if j > 200)} pasangan tahunan)")

    kerja = pastikan_kerja()
    with (kerja / f"pasangan_{a.lintasan}.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ref_tanggal", "sec_tanggal", "hari", "ref_burst", "sec_burst"])
        for r, s in pasangan:
            w.writerow([r.isoformat(), s.isoformat(), (s - r).days, "|".join(per_tanggal[r]), "|".join(per_tanggal[s])])
    ringkasan = {
        "lintasan": a.lintasan,
        "arah": ln["arah"].lower(),
        "path": ln["path"],
        "mulai": tanggal[0].isoformat(),
        "akhir": tanggal[-1].isoformat(),
        "burst": terpilih,
        "cakupan_kota": round(gabungan, 4),
        "n_citra": len(tanggal),
        "n_pasangan": len(pasangan),
        "per_wahana": dict(per_wahana),
        "dibuat": date.today().isoformat(),
    }
    (kerja / f"ringkasan_{a.lintasan}.json").write_text(json.dumps(ringkasan, indent=2), encoding="utf-8")
    print(f"Ditulis: {kerja / f'pasangan_{a.lintasan}.csv'}")


if __name__ == "__main__":
    main()
