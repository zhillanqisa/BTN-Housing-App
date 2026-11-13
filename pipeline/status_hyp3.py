"""Status job HyP3 untuk satu atau dua lintasan.

Jalankan:
    python pipeline/status_hyp3.py                    ringkasan status kedua lintasan
    python pipeline/status_hyp3.py --tunggu 540       tunggu sampai semua selesai, paling lama 540 detik
    python pipeline/status_hyp3.py --rinci            tampilkan file tiap job yang selesai
"""
from __future__ import annotations

import argparse
import time
from collections import Counter

import hyp3_sdk as sdk

from umum import LINTASAN, PROYEK_HYP3

JENIS_JOB = "INSAR_ISCE_MULTI_BURST"
SELESAI = {"SUCCEEDED", "FAILED"}


def ambil(hyp3, lintasan: str):
    return list(hyp3.find_jobs(name=f"{PROYEK_HYP3}-{lintasan}", job_type=JENIS_JOB))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lintasan", choices=sorted(LINTASAN), action="append", help="bawaan: semua")
    ap.add_argument("--tunggu", type=int, default=0, help="detik menunggu sampai semua job selesai")
    ap.add_argument("--jeda", type=int, default=45, help="detik antar pengecekan saat menunggu")
    ap.add_argument("--rinci", action="store_true")
    a = ap.parse_args()

    hyp3 = sdk.HyP3()
    daftar = a.lintasan or sorted(LINTASAN)
    batas = time.monotonic() + a.tunggu
    while True:
        job = {l: ambil(hyp3, l) for l in daftar}
        belum = sum(1 for js in job.values() for j in js if j.status_code not in SELESAI)
        if not belum or time.monotonic() >= batas:
            break
        time.sleep(a.jeda)

    for l, js in job.items():
        hitung = Counter(j.status_code for j in js)
        print(f"{l}: {len(js)} job | " + ", ".join(f"{k} {v}" for k, v in sorted(hitung.items())))
        for j in js:
            if j.status_code == "FAILED":
                pesan = (j.logs or [""])[0] if hasattr(j, "logs") else ""
                print(f"  GAGAL {j.job_id}: ref {j.job_parameters.get('reference')} | {pesan}")
            elif a.rinci and j.status_code == "SUCCEEDED":
                for f in j.files or []:
                    print(f"  {f.get('filename')}  {f.get('size', 0) / 1e6:.1f} MB")
    print(f"Sisa kredit: {hyp3.my_info().get('remaining_credits')}")


if __name__ == "__main__":
    main()
