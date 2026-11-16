// Navigasi bawah untuk ponsel: empat halaman dalam jangkauan ibu jari.
// Di desktop navigasi ada di bilah atas (TopBar).
import { MENU } from './TopBar'
import { navigasi } from '../lib/router'
import { useApp } from '../lib/store'
import type { Halaman } from '../lib/types'
import { cx } from '../ui/primitives'

export default function NavBawah({ halaman }: { halaman: Halaman }) {
  const nBanding = useApp((s) => s.banding.length)
  return (
    <nav aria-label="Halaman" className="pointer-events-none absolute inset-x-0 bottom-0 z-[25] px-3 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden">
      <div data-tur="nav" className="glass pointer-events-auto mx-auto flex h-[62px] max-w-[520px] items-stretch gap-1 rounded-[22px] p-1.5">
        {MENU.map(({ halaman: h, label, singkat, Ikon }) => {
          const aktif = h === halaman
          return (
            <button
              key={h}
              type="button"
              onClick={() => navigasi(h)}
              aria-current={aktif ? 'page' : undefined}
              aria-label={label}
              className={cx(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] text-[11px] font-semibold transition-colors duration-200',
                aktif ? 'bg-ink text-surface' : 'text-ink-2 active:bg-surface-2',
              )}
            >
              <span className="relative">
                <Ikon size={21} weight={aktif ? 'fill' : 'regular'} aria-hidden="true" />
                {h === 'bandingkan' && nBanding > 0 && (
                  <span className="tnum absolute -right-2.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink ring-2 ring-[var(--surface)]">
                    {nBanding}
                  </span>
                )}
              </span>
              <span aria-hidden="true" className="max-w-full truncate px-1">
                {singkat}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
