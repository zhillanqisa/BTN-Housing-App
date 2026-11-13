// Kontrol peta (zoom, 2D/3D, tampilkan seluruh kota) dan legenda.
import { useState } from 'react'
import { CornersOut, Minus, Plus, Stack } from '@phosphor-icons/react'
import { LAJU_BINS, LABEL_KATEGORI } from '../lib/config'
import { fmt } from '../lib/format'
import { jembatanPeta, useApp } from '../lib/store'
import type { ModePeta } from '../lib/types'
import { cx, IconButton, Panel, Segmented, Swatch } from '../ui/primitives'

export default function MapChrome() {
  const [legendaBuka, setLegendaBuka] = useState(false)
  const tigaD = useApp((s) => s.tigaD)
  const setTigaD = useApp((s) => s.setTigaD)
  const modePeta = useApp((s) => s.modePeta)
  const setModePeta = useApp((s) => s.setModePeta)
  const t = useApp((s) => s.thresholds)
  const ukuranSel = useApp((s) => s.grid?.kepala.ukuranSelM ?? null)

  return (
    <>
      <div className="glass absolute right-3 top-[136px] z-10 flex flex-col rounded-[14px] p-1 lg:right-4 lg:top-[88px]">
        <IconButton label="Perbesar peta" onClick={() => jembatanPeta.zoom?.(1)}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Perkecil peta" onClick={() => jembatanPeta.zoom?.(-1)}>
          <Minus size={18} />
        </IconButton>
        <button
          type="button"
          onClick={() => setTigaD(!tigaD)}
          aria-label={tigaD ? 'Ganti ke tampilan 2D' : 'Ganti ke tampilan 3D'}
          title={tigaD ? 'Tampilan 2D' : 'Tampilan 3D'}
          className="grid size-10 place-items-center rounded-[12px] text-[12.5px] font-bold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          {tigaD ? '2D' : '3D'}
        </button>
        <IconButton label="Tampilkan seluruh kota" onClick={() => jembatanPeta.aturUlang?.()}>
          <CornersOut size={18} />
        </IconButton>
        <IconButton label="Legenda" className="lg:hidden" aktif={legendaBuka} onClick={() => setLegendaBuka((v) => !v)}>
          <Stack size={18} />
        </IconButton>
      </div>

      <Panel
        aria-label="Legenda peta"
        className={cx('absolute right-[64px] top-[136px] z-10 w-[236px] p-3.5 lg:bottom-11 lg:right-4 lg:top-auto', legendaBuka ? 'block' : 'hidden lg:block')}
      >
        <Segmented<ModePeta>
          label="Warna peta"
          ukuran="sm"
          penuh
          nilai={modePeta}
          onUbah={setModePeta}
          opsi={[
            { nilai: 'laju', label: 'Laju' },
            { nilai: 'kategori', label: 'Kategori' },
          ]}
        />
        {modePeta === 'laju' ? (
          <div className="mt-3">
            <div className="text-[12px] font-semibold text-ink-2">Laju penurunan (cm/tahun)</div>
            <div className="mt-2 flex gap-[2px]">
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="h-2.5 flex-1 first:rounded-l-full last:rounded-r-full" style={{ background: `var(--ramp-${i})` }} />
              ))}
            </div>
            <div className="tnum mt-1 flex justify-between px-[calc(10%-4px)] text-[11px] text-ink-3" aria-hidden="true">
              {LAJU_BINS.map((b) => (
                <span key={b}>{b}</span>
              ))}
            </div>
            <span className="sr-only">Lima kelas: di bawah 2, 2 sampai 4, 4 sampai 6, 6 sampai 8, dan di atas 8 cm per tahun. Makin pekat makin cepat turun.</span>
          </div>
        ) : (
          <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink">
            <li className="flex items-center gap-2">
              <Swatch kategori="rendah" />
              <span className="font-semibold">{LABEL_KATEGORI.rendah}</span>
              <span className="tnum ml-auto text-ink-3">&lt; {fmt(t.sedang, 1)}</span>
            </li>
            <li className="flex items-center gap-2">
              <Swatch kategori="sedang" />
              <span className="font-semibold">{LABEL_KATEGORI.sedang}</span>
              <span className="tnum ml-auto text-ink-3">
                {fmt(t.sedang, 1)} sampai &lt; {fmt(t.tinggi, 1)}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Swatch kategori="tinggi" />
              <span className="font-semibold">{LABEL_KATEGORI.tinggi}</span>
              <span className="tnum ml-auto text-ink-3">mulai {fmt(t.tinggi, 1)}</span>
            </li>
          </ul>
        )}
        <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2.5 text-[12px] text-ink-2">
          <Swatch kategori="tidak-memadai" />
          {LABEL_KATEGORI['tidak-memadai']}
        </div>
        {modePeta === 'kategori' && <p className="mt-2 text-[11.5px] leading-snug text-ink-3">Ambang dalam cm/tahun, masih asumsi awal.</p>}
        {ukuranSel != null && <p className="mt-2 text-[11.5px] leading-snug text-ink-3">Satu kotak di peta = satu piksel, sekitar {fmt(ukuranSel)} m.</p>}
      </Panel>
    </>
  )
}
