// Kartu sorotan: lokasi contoh yang bisa dipilih sekali klik (untuk demo cepat).
import { useMemo } from 'react'
import { LABEL_KATEGORI } from '../lib/config'
import { bacaLokasi } from '../lib/lokasi'
import { fmt } from '../lib/format'
import { sorotanWilayah } from '../lib/gazetteer'
import { klasifikasi } from '../lib/risk'
import { useApp } from '../lib/store'
import { Swatch } from '../ui/primitives'

function Spark({ deret }: { deret: [number, number][] }) {
  if (deret.length < 2) return null
  const t0 = deret[0]![0]
  const t1 = deret[deret.length - 1]![0]
  const min = Math.min(...deret.map((d) => d[1]), -1)
  const d = deret.map((p, i) => `${i ? 'L' : 'M'}${(((p[0] - t0) / (t1 - t0)) * 56).toFixed(1)},${(2 + (p[1] / min) * 18).toFixed(1)}`).join('')
  return (
    <svg width={56} height={22} viewBox="0 0 56 22" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--data)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Sorotan() {
  const kawasan = useApp((s) => s.kawasan)
  const grid = useApp((s) => s.grid)
  const versiGrid = useApp((s) => s.versiGrid)
  const thresholds = useApp((s) => s.thresholds)
  const pilihTitik = useApp((s) => s.pilihTitik)
  const wilayah = useApp((s) => s.wilayah)
  // angka kartu = bacaan di titik contoh (blok piksel bila ada grid), sama dengan laporan yang dibuka
  const kartu = useMemo(
    () =>
      sorotanWilayah(wilayah).flatMap((t) => {
        const b = bacaLokasi(t.lngLat, kawasan, grid)
        return b ? [{ t, k: b.data, kelurahan: b.kelurahan.nama }] : []
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kawasan, grid, versiGrid, wilayah],
  )
  if (!kartu.length) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-10 pb-2 lg:bottom-0 lg:left-[424px] lg:right-[268px] lg:pb-4">
      <p className="pointer-events-auto mx-3 mb-2 inline-block rounded-full bg-[var(--glass)] px-3 py-1 text-[12px] font-semibold text-ink-2 backdrop-blur lg:mx-0">
        <span className="lg:hidden">Ketuk peta, atau coba lokasi contoh</span>
        <span className="hidden lg:inline">Coba lokasi contoh</span>
      </p>
      <ul className="scroll-thin hp-tanpa-gulir pointer-events-auto flex snap-x gap-2.5 overflow-x-auto px-3 pb-1 lg:px-0" aria-label="Lokasi contoh">
        {kartu.map(({ t, k, kelurahan }) => {
          const kat = klasifikasi(k.laju, k.memadai, thresholds)
          return (
            <li key={t.label} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => pilihTitik(t.lngLat, 'sorotan', t.label)}
                className="glass block w-[164px] rounded-[20px] p-3.5 text-left lg:w-[172px] lg:rounded-[22px] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <span className="block truncate text-[14px] font-bold text-ink">{t.label}</span>
                <span className="block truncate text-[12px] text-ink-3">Kel. {kelurahan}</span>
                <span className="mt-2.5 flex items-end justify-between gap-2">
                  <span>
                    <span className="text-[22px] font-bold leading-none tracking-tight text-ink">{k.laju == null ? '-' : fmt(Math.max(0, k.laju), 1)}</span>
                    <span className="ml-1 text-[11px] text-ink-3">cm/th</span>
                  </span>
                  <Spark deret={k.deret} />
                </span>
                <span className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
                  <Swatch kategori={kat} />
                  {LABEL_KATEGORI[kat]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
