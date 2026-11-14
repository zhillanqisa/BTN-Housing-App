// Perbandingan antarwilayah di Dashboard: satu kartu per wilayah dari public/data/ringkasan-wilayah.json
// (ditulis scripts/ringkasan-wilayah.mjs). Kartu wilayah aktif ditandai; klik kartu lain memuat wilayah itu.
import { useEffect, useState } from 'react'
import { fmt } from '../lib/format'
import { useApp } from '../lib/store'
import { adalahIdWilayah, urlRingkasan, wilayahById, type IdWilayah } from '../lib/wilayah'
import { Card, cx, JudulBagian, Skeleton } from '../ui/primitives'

interface BarisRingkasan {
  id: IdWilayah
  status: 'olahan' | 'belum'
  nama?: string
  periode?: [string, string] | null
  lulusGerbang?: boolean | null
  nKelurahan?: number
  nKelurahanMemadai?: number
  nKelurahanTinggi?: number
  tercepat?: { nama: string; kecamatan: string; laju: number }[]
  piksel?: { persenTerukur: number; p95: number | null; maks: number | null; luasKm2: { min2: number | null; min4: number | null } }
}

let simpanan: Promise<BarisRingkasan[] | null> | null = null

function ambilRingkasan(): Promise<BarisRingkasan[] | null> {
  simpanan ??= fetch(urlRingkasan())
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { wilayah?: BarisRingkasan[] } | null) => (Array.isArray(j?.wilayah) ? j.wilayah.filter((w) => adalahIdWilayah(w.id)) : null))
    .catch(() => null)
  // gagal tidak disimpan: kunjungan berikutnya mencoba lagi
  void simpanan.then((h) => {
    if (!h) simpanan = null
  })
  return simpanan
}

export default function RingkasanWilayah() {
  const wilayah = useApp((s) => s.wilayah)
  const pilihWilayah = useApp((s) => s.pilihWilayah)
  const [data, setData] = useState<BarisRingkasan[] | null | undefined>(undefined)

  useEffect(() => {
    let hidup = true
    void ambilRingkasan().then((d) => hidup && setData(d))
    return () => {
      hidup = false
    }
  }, [])

  if (data === null) return null
  return (
    <section aria-label="Perbandingan wilayah" className="mt-6">
      <JudulBagian>Perbandingan wilayah pesisir</JudulBagian>
      {data === undefined ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : (
        <div className="hp-tanpa-gulir -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {data.map((w) => {
            const aktif = w.id === wilayah
            const nama = w.nama ?? wilayahById(w.id)?.nama ?? w.id
            const puncak = w.tercepat?.[0]
            return (
              <Card key={w.id} className={cx('w-[78%] shrink-0 snap-start p-0 sm:w-auto', aktif && 'border-ink')}>
                <button
                  type="button"
                  onClick={() => void pilihWilayah(w.id)}
                  aria-pressed={aktif}
                  className="flex h-full w-full flex-col rounded-[22px] p-4 text-left transition-colors hover:bg-bg"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-bold text-ink">{nama}</span>
                    {aktif && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-surface">Dibuka</span>}
                  </div>
                  {w.status !== 'olahan' || !w.piksel ? (
                    <p className="mt-3 text-[13px] text-ink-3">Sedang diolah.</p>
                  ) : (
                    <>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="tnum text-[26px] font-bold leading-none tracking-tight text-ink">{fmt(w.piksel.luasKm2.min4 ?? 0, 1)}</span>
                        <span className="text-[12.5px] font-medium text-ink-3">km² turun ≥ 4 cm/tahun</span>
                      </div>
                      <dl className="tnum mt-3 grid gap-x-3 gap-y-1 text-[12.5px]" style={{ gridTemplateColumns: 'max-content minmax(0, 1fr)' }}>
                        <dt className="text-ink-3">Kelurahan tinggi</dt>
                        <dd className="text-ink">
                          {fmt(w.nKelurahanTinggi ?? 0)} dari {fmt(w.nKelurahan ?? 0)}
                        </dd>
                        {puncak && (
                          <>
                            <dt className="text-ink-3">Tercepat</dt>
                            <dd className="truncate text-ink" title={`${puncak.nama}, ${puncak.kecamatan}`}>
                              {puncak.nama}, {fmt(puncak.laju, 1)} cm/th
                            </dd>
                          </>
                        )}
                        <dt className="text-ink-3">Piksel terukur</dt>
                        <dd className="text-ink">{fmt(w.piksel.persenTerukur)}%</dd>
                        <dt className="text-ink-3">Gerbang mutu</dt>
                        <dd className={w.lulusGerbang ? 'text-ink' : 'font-semibold text-ink'}>{w.lulusGerbang ? 'Lulus' : w.lulusGerbang === false ? 'Belum lulus' : '-'}</dd>
                      </dl>
                    </>
                  )}
                </button>
              </Card>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-[12.5px] text-ink-3">Luas dihitung dari piksel 80 m yang terukur. Kawasan tak terukur (tambak, air, vegetasi lebat) tidak ikut dihitung.</p>
    </section>
  )
}
