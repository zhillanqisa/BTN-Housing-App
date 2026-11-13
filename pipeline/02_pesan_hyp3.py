"""Langkah 2: pesan interferogram ke ASF HyP3 (INSAR_ISCE_MULTI_BURST).

Butuh akun NASA Earthdata dengan akses HyP3. Kredensial dibaca pustaka hyp3_sdk
dari file .netrc di folder pengguna, yang dibuat pengguna sendiri:

    machine urs.earthdata.nasa.gov login NAMA_PENGGUNA password KATA_SANDI

Skrip ini tidak membaca atau mencetak isi file itu.

Jalankan:
    python pipeline/02_pesan_hyp3.py --lintasan desc                   periksa saja: akses, kredit, biaya
    python pipeline/02_pesan_hyp3.py --lintasan desc --uji 5 --kirim   uji kecil 5 pasangan
    python pipeline/02_pesan_hyp3.py --lintasan desc --kirim           pesan semua yang belum dipesan

Aman diulang: pasangan yang sudah dipesan (dan tidak gagal) tidak dipesan lagi.
"""
from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path

from umum import KERJA, LINTASAN, LOOKS, PROYEK_HYP3

JENIS_JOB = "INSAR_ISCE_MULTI_BURST"
BATAS_PENDEK = 48  # hari; uji kecil hanya memakai pasangan pendek
UKURAN_KIRIM = 100


def kredit_per_job(n_burst: int) -> int:
    """Tabel kredit HyP3 untuk Burst InSAR 20x4 looks (dokumentasi HyP3, dicek 13 Nov 2026)."""
    if n_burst <= 4:
        return 1
    if n_burst <= 12:
        return 5
    return 10


def baca_pasangan(lintasan: str) -> list[dict]:
    berkas = KERJA / f"pasangan_{lintasan}.csv"
    if not berkas.exists():
        raise SystemExit(f"{berkas} belum ada. Jalankan 01_cari_pasangan.py --lintasan {lintasan} dulu.")
    with berkas.open(encoding="utf-8") as f:
        return [
            {"ref": tuple(r["ref_burst"].split("|")), "sec": tuple(r["sec_burst"].split("|")), "hari": int(r["hari"]), "tanggal": (r["ref_tanggal"], r["sec_tanggal"])}
            for r in csv.DictReader(f)
        ]


def pilih_uji(pasangan: list[dict], n: int) -> list[dict]:
    """N pasangan pendek yang tersebar merata sepanjang periode (ikut menguji wahana berbeda)."""
    pendek = [p for p in pasangan if p["hari"] <= BATAS_PENDEK]
    if len(pendek) <= n:
        return pendek
    return [pendek[round(i * (len(pendek) - 1) / (n - 1))] for i in range(n)] if n > 1 else pendek[:1]


def ada_netrc() -> bool:
    return any((Path.home() / nama).exists() for nama in (".netrc", "_netrc"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), required=True)
    ap.add_argument("--uji", type=int, default=0, help="hanya pesan N pasangan pendek untuk uji kecil")
    ap.add_argument("--kirim", action="store_true", help="benar-benar memesan. Tanpa ini hanya memeriksa.")
    a = ap.parse_args()

    pasangan = baca_pasangan(a.lintasan)
    sasaran = pilih_uji(pasangan, a.uji) if a.uji else pasangan
    nama = f"{PROYEK_HYP3}-{a.lintasan}"
    biaya_satu = kredit_per_job(len(sasaran[0]["ref"]))
    print(f"Lintasan {a.lintasan}: {len(pasangan)} pasangan di daftar, sasaran kali ini {len(sasaran)}; {len(sasaran[0]['ref'])} burst per pasangan = {biaya_satu} kredit per job.")

    if not ada_netrc():
        raise SystemExit(
            "File .netrc belum ada di folder pengguna. Buat sendiri dengan satu baris:\n"
            "  machine urs.earthdata.nasa.gov login NAMA_PENGGUNA password KATA_SANDI\n"
            f"Lokasi: {Path.home() / '.netrc'}"
        )

    import hyp3_sdk as sdk

    try:
        hyp3 = sdk.HyP3()
    except sdk.exceptions.AuthenticationError as e:
        # Dua sebab umum: sandi di .netrc salah, atau aplikasi HyP3 belum diizinkan di akun
        # Earthdata. Untuk yang kedua, pesan galat memuat alamat approve_app di urs.earthdata.nasa.gov
        # yang harus dibuka dan disetujui sendiri oleh pemilik akun.
        raise SystemExit(f"Login ke HyP3 ditolak Earthdata: {e}") from None
    info = hyp3.my_info()
    status = info.get("application_status", "tidak diketahui")
    sisa = info.get("remaining_credits")
    print(f"Akses HyP3: {status}. Sisa kredit bulan ini: {sisa}.")
    if status not in ("APPROVED", "tidak diketahui"):
        raise SystemExit("Akses HyP3 belum disetujui. Isi formulir Requesting Access di dokumentasi HyP3, lalu tunggu email persetujuan.")

    lama = hyp3.find_jobs(name=nama, job_type=JENIS_JOB)
    sudah = {
        (tuple(j.job_parameters.get("reference", [])), tuple(j.job_parameters.get("secondary", [])))
        for j in lama
        if j.status_code != "FAILED"
    }
    gagal = sum(1 for j in lama if j.status_code == "FAILED")
    perlu = [p for p in sasaran if (p["ref"], p["sec"]) not in sudah]
    biaya = len(perlu) * biaya_satu
    print(f"Sudah dipesan: {len(sasaran) - len(perlu)}. Job gagal sebelumnya: {gagal}. Perlu dipesan: {len(perlu)} = {biaya} kredit.")

    if not a.kirim:
        print("Mode periksa: tidak ada yang dipesan. Tambahkan --kirim untuk memesan.")
        return
    if not perlu:
        print("Tidak ada yang perlu dipesan.")
        return
    if sisa is not None and biaya > sisa:
        raise SystemExit(f"Kredit tidak cukup ({biaya} dibutuhkan, {sisa} tersisa). Kurangi sasaran atau tunggu bulan berikutnya.")

    id_job: list[str] = []
    for i in range(0, len(perlu), UKURAN_KIRIM):
        siap = [
            sdk.HyP3.prepare_insar_isce_multi_burst_job(list(p["ref"]), list(p["sec"]), name=nama, apply_water_mask=True, looks=LOOKS)
            for p in perlu[i : i + UKURAN_KIRIM]
        ]
        batch = hyp3.submit_prepared_jobs(siap)
        id_job += [j.job_id for j in batch]
        print(f"  terkirim {len(id_job)}/{len(perlu)}")

    catatan = KERJA / f"job_{a.lintasan}.json"
    riwayat = json.loads(catatan.read_text(encoding="utf-8")) if catatan.exists() else []
    riwayat.append({"tanggal": date.today().isoformat(), "nama": nama, "uji": bool(a.uji), "n": len(id_job), "id": id_job})
    catatan.write_text(json.dumps(riwayat, indent=2), encoding="utf-8")
    print(f"Selesai. {len(id_job)} job dipesan dengan nama '{nama}'. Catatan: {catatan}")


if __name__ == "__main__":
    main()
