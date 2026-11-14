// Pemilih wilayah di bilah atas: tombol ringkas + daftar melayang (pola listbox WAI-ARIA).
// Keyboard: Enter/Spasi/panah bawah membuka, panah atas/bawah berpindah, Enter memilih, Escape menutup.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CaretDown, Check, MapPin } from '@phosphor-icons/react'
import { useApp } from '../lib/store'
import { DAFTAR_WILAYAH, wilayahById } from '../lib/wilayah'
import { cx } from '../ui/primitives'

export default function PilihWilayah() {
  const wilayah = useApp((s) => s.wilayah)
  const status = useApp((s) => s.status)
  const pilihWilayah = useApp((s) => s.pilihWilayah)
  const [buka, setBuka] = useState(false)
  const [sorot, setSorot] = useState(0)
  const akar = useRef<HTMLDivElement>(null)
  const tombol = useRef<HTMLButtonElement>(null)
  const daftar = useRef<HTMLUListElement>(null)
  const id = useId()
  const aktif = wilayahById(wilayah)

  // klik di luar menutup daftar
  useEffect(() => {
    if (!buka) return
    const tutup = (e: PointerEvent) => {
      if (!akar.current?.contains(e.target as Node)) setBuka(false)
    }
    document.addEventListener('pointerdown', tutup)
    return () => document.removeEventListener('pointerdown', tutup)
  }, [buka])

  useEffect(() => {
    if (buka) daftar.current?.focus()
  }, [buka])

  const bukaDaftar = () => {
    setSorot(Math.max(0, DAFTAR_WILAYAH.findIndex((w) => w.id === wilayah)))
    setBuka(true)
  }
  const pilih = (i: number) => {
    const w = DAFTAR_WILAYAH[i]
    setBuka(false)
    tombol.current?.focus()
    if (w) void pilihWilayah(w.id)
  }

  const tombolKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      bukaDaftar()
    }
  }
  const daftarKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const n = DAFTAR_WILAYAH.length
    if (e.key === 'ArrowDown') setSorot((i) => (i + 1) % n)
    else if (e.key === 'ArrowUp') setSorot((i) => (i - 1 + n) % n)
    else if (e.key === 'Home') setSorot(0)
    else if (e.key === 'End') setSorot(n - 1)
    else if (e.key === 'Enter' || e.key === ' ') pilih(sorot)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setBuka(false)
      if (e.key === 'Escape') tombol.current?.focus()
      return
    } else return
    e.preventDefault()
  }

  return (
    <div ref={akar} className="relative shrink-0">
      <button
        ref={tombol}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={`${id}-daftar`}
        aria-label={`Wilayah: ${aktif?.nama ?? ''}. Ganti wilayah`}
        onClick={() => (buka ? setBuka(false) : bukaDaftar())}
        onKeyDown={tombolKey}
        className={cx(
          'inline-flex h-10 items-center gap-1.5 rounded-[12px] border pl-2.5 pr-2 text-[13.5px] font-semibold transition-colors duration-200',
          buka ? 'border-ink bg-surface text-ink' : 'border-line-2 bg-surface/70 text-ink hover:border-ink-3 hover:bg-surface',
        )}
      >
        <MapPin size={16} weight="fill" className="text-accent" aria-hidden="true" />
        <span className="max-w-[92px] truncate sm:max-w-none">{aktif?.singkat}</span>
        {status === 'memuat' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3" aria-hidden="true" />}
        <CaretDown size={13} weight="bold" className={cx('text-ink-3 transition-transform duration-200', buka && 'rotate-180')} aria-hidden="true" />
      </button>

      {buka && (
        <ul
          ref={daftar}
          id={`${id}-daftar`}
          role="listbox"
          tabIndex={-1}
          aria-label="Pilih wilayah"
          aria-activedescendant={`${id}-${sorot}`}
          onKeyDown={daftarKey}
          className="pa-enter absolute right-0 top-[calc(100%+8px)] lg:left-0 lg:right-auto z-40 w-[288px] max-w-[calc(100vw-24px)] rounded-[18px] border border-line bg-surface p-1.5 shadow-[0_18px_48px_-12px_rgb(0_0_0/0.28)] outline-none"
        >
          <li role="presentation" className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
            Wilayah pesisir
          </li>
          {DAFTAR_WILAYAH.map((w, i) => {
            const dipilih = w.id === wilayah
            return (
              <li
                key={w.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={dipilih}
                onPointerEnter={() => setSorot(i)}
                onClick={() => pilih(i)}
                className={cx('flex cursor-pointer items-center gap-3 rounded-[12px] px-2.5 py-2 transition-colors', i === sorot ? 'bg-surface-2' : '')}
              >
                <span
                  className={cx(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[12px] font-bold',
                    dipilih ? 'bg-ink text-surface' : 'bg-bg text-ink-2',
                  )}
                  aria-hidden="true"
                >
                  {w.singkat.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{w.nama}</span>
                  <span className="block truncate text-[12px] text-ink-3">{w.keterangan}</span>
                </span>
                {dipilih && <Check size={16} weight="bold" className="shrink-0 text-ink" aria-hidden="true" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
