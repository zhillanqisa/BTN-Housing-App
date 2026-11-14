// Kontrol peta (zoom, 2D/3D, tampilkan seluruh kota), legenda, dan pilihan lapis konteks.
import { useState } from 'react'
import { ArrowRight, CornersOut, Minus, Plus, Stack } from '@phosphor-icons/react'
import { LAJU_BINS, LABEL_KATEGORI } from '../lib/config'
import { fmt } from '../lib/format'
import type { JenisLapis, LapisKonteks } from '../lib/konteks'
import { navigasi } from '../lib/router'
import { jembatanPeta, useApp } from '../lib/store'
import type { ModePeta } from '../lib/types'
import { cx, IconButton, Panel, Segmented, Swatch } from '../ui/primitives'

type PilihanLapis = 'tidak' | JenisLapis

/** Kelas lapis konteks dengan laju median per kelas: bahan analisis langsung di legenda. */
function LegendaKonteks({ lapis }: { lapis: LapisKonteks }) {
  const kelas = lapis.meta.statistik.length ? lapis.meta.statistik : lapis.fitur.map((f) => ({ nama: f.nama, warna: f.warna, median: undefined }))
  return (
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between text-[11px] text-ink-3">
        <span>Kelas</span>
        <span>Median laju</span>
      </div>
      <ul className="scroll-thin mt-1 max-h-[168px] space-y-1 overflow-y-auto pr-1 text-[12px] text-ink">
        {kelas.map((s) => (
          <li key={s.nama} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-[4px] ring-1 ring-black/10" style={{ background: s.warna }} />
            <span className="min-w-0 flex-1 truncate" title={s.nama}>
              {s.nama.replace(/^Kawasan (Peruntukan )?/, '')}
            </span>
            <span className="tnum shrink-0 text-ink-2">{s.median != null ? `${fmt(Math.max(0, s.median), 1)} cm` : '-'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">
        {lapis.meta.jenis === 'perkiraan' ? 'Perkiraan dari bentuk lahan, bukan peta geologi resmi.' : `${lapis.meta.judul}${lapis.meta.skala ? `, ${lapis.meta.skala}` : ''}.`}
      </p>
      <button
        type="button"
        onClick={() => navigasi('metode', { bagian: 'konteks' })}
        className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink underline underline-offset-2"
      >
        Penjelasan dan sumber <ArrowRight size={12} aria-hidden="true" />
      </button>
    </div>
  )
}

export default function MapChrome() {
  const [legendaBuka, setLegendaBuka] = useState(false)
  const tigaD = useApp((s) => s.tigaD)
  const setTigaD = useApp((s) => s.setTigaD)
  const modePeta = useApp((s) => s.modePeta)
  const setModePeta = useApp((s) => s.setModePeta)
  const t = useApp((s) => s.thresholds)
  const ukuranSel = useApp((s) => s.grid?.kepala.ukuranSelM ?? null)
  const konteks = useApp((s) => s.konteks)
  const lapisKonteks = useApp((s) => s.lapisKonteks)
  const setLapisKonteks = useApp((s) => s.setLapisKonteks)
  const lapisAktif = lapisKonteks ? konteks[lapisKonteks] : undefined
  const adaKonteks = !!(konteks.rtrw || konteks.geologi)

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
        // di ponsel legenda yang dibuka berada di atas lembar laporan, dan bisa digulir bila tinggi
        className={cx(
          'scroll-thin absolute right-[64px] top-[136px] z-[13] max-h-[calc(100dvh-152px)] w-[236px] overflow-y-auto p-3.5 lg:bottom-11 lg:right-4 lg:top-auto lg:z-10 lg:max-h-[calc(100dvh-140px)]',
          legendaBuka ? 'block' : 'hidden lg:block',
        )}
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
        {ukuranSel != null && !lapisAktif && <p className="mt-2 text-[11.5px] leading-snug text-ink-3">Satu kotak di peta = satu piksel, sekitar {fmt(ukuranSel)} m.</p>}
        {adaKonteks && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-2 text-[12px] font-semibold text-ink-2">Lapis konteks</div>
            <Segmented<PilihanLapis>
              label="Lapis konteks"
              ukuran="sm"
              penuh
              nilai={lapisKonteks ?? 'tidak'}
              onUbah={(v) => setLapisKonteks(v === 'tidak' ? null : v)}
              opsi={[
                { nilai: 'tidak', label: 'Tidak' },
                ...(konteks.rtrw ? [{ nilai: 'rtrw' as const, label: 'RTRW' }] : []),
                ...(konteks.geologi ? [{ nilai: 'geologi' as const, label: 'Geologi' }] : []),
              ]}
            />
            {lapisAktif && <LegendaKonteks lapis={lapisAktif} />}
          </div>
        )}
      </Panel>
    </>
  )
}
