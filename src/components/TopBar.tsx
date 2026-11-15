// Bilah atas melayang: merek, pilihan wilayah, navigasi halaman, penanda data demo, dan tombol tema.
// Di ponsel navigasi pindah ke bawah (NavBawah), jadi bilah atas hanya merek, wilayah, dan tema.
import { BookOpenText, ChartBar, MapTrifold, Moon, Scales, Sun, Warning } from '@phosphor-icons/react'
import { APP } from '../lib/config'
import { navigasi } from '../lib/router'
import { useApp } from '../lib/store'
import type { Halaman } from '../lib/types'
import { cx, IconButton, Logo, Wordmark } from '../ui/primitives'
import PilihWilayah from './PilihWilayah'

/** Halaman aplikasi. singkat = label di navigasi bawah ponsel (NavBawah). */
export const MENU: { halaman: Halaman; label: string; singkat: string; Ikon: typeof MapTrifold }[] = [
  { halaman: 'peta', label: 'Cek lokasi', singkat: 'Peta', Ikon: MapTrifold },
  { halaman: 'bandingkan', label: 'Bandingkan', singkat: 'Banding', Ikon: Scales },
  { halaman: 'dashboard', label: 'Dashboard', singkat: 'Dashboard', Ikon: ChartBar },
  { halaman: 'metode', label: 'Data & metode', singkat: 'Metode', Ikon: BookOpenText },
]

export default function TopBar({ halaman }: { halaman: Halaman }) {
  const tema = useApp((s) => s.tema)
  const setTema = useApp((s) => s.setTema)
  const jenis = useApp((s) => s.meta?.jenis)
  const nBanding = useApp((s) => s.banding.length)

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-3 lg:px-4 lg:pt-4">
      <div className="glass pointer-events-auto flex h-14 items-center gap-1.5 rounded-[22px] pl-3 pr-2">
        <button type="button" onClick={() => navigasi('peta')} className="flex shrink-0 items-center gap-2.5 rounded-[12px] pr-2" aria-label={`${APP.nama}, ke halaman peta`}>
          <Logo size={30} />
          <Wordmark className="text-[16px] lg:text-[16.5px]" />
        </button>

        <div className="flex-1 lg:hidden" />

        <PilihWilayah />

        <nav aria-label="Halaman" className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {MENU.map(({ halaman: h, label, Ikon }) => {
            const aktif = h === halaman
            return (
              <button
                key={h}
                type="button"
                onClick={() => navigasi(h)}
                aria-current={aktif ? 'page' : undefined}
                title={label}
                className={cx(
                  'relative inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] px-3 text-[13.5px] font-semibold transition-colors duration-200',
                  aktif ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Ikon size={18} weight={aktif ? 'fill' : 'regular'} aria-hidden="true" />
                <span className="hidden md:inline">{label}</span>
                <span className="sr-only md:hidden">{label}</span>
                {h === 'bandingkan' && nBanding > 0 && (
                  <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-ink" aria-label={`${nBanding} lokasi dipilih`}>
                    {nBanding}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {jenis === 'demo' && (
          <button
            type="button"
            onClick={() => navigasi('metode')}
            className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full border border-notice-line bg-notice-bg px-3 text-[12px] font-semibold text-notice-ink lg:inline-flex"
            title="Angka di aplikasi ini masih ilustrasi. Klik untuk penjelasan."
          >
            <Warning size={14} weight="fill" aria-hidden="true" />
            Data demo
          </button>
        )}
        <IconButton label={tema === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'} onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')}>
          {tema === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </div>
    </header>
  )
}
