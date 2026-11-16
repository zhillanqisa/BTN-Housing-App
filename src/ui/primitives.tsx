// Komponen UI dasar. Dipakai semua halaman supaya tampilan konsisten.
// Aturan bentuk: panel 22px, kontrol 12px, pil/chip bulat penuh.
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Info, Warning } from '@phosphor-icons/react'
import { LABEL_KATEGORI } from '../lib/config'
import type { Kategori } from '../lib/types'

export function cx(...a: (string | false | null | undefined)[]): string {
  return a.filter(Boolean).join(' ')
}

/** Geometri tanda merek SubTen (viewBox 64): rumah, penanda lokasi, dan dua lapisan tanah yang
 *  melengkung turun. Sama dengan public/favicon.svg dan gambarLogo di lib/pdf.ts. */
export const LOGO_PATH = {
  rumah: 'M6 42V24.6L32 4.2l13 9.4',
  jendela: [
    [21, 23],
    [28.6, 23],
    [21, 30.6],
    [28.6, 30.6],
  ] as const,
  penanda: 'M53 13.5a8.5 8.5 0 0 0-8.5 8.5c0 5.4 6.2 11.6 8.5 15.6 2.3-4 8.5-10.2 8.5-15.6a8.5 8.5 0 0 0-8.5-8.5Z',
  tanahAtas: 'M6 47.5c8-3.3 15.5-3 22.5 1 3.2 1.8 5.5 1.6 8.3-.4 5.2-3.8 11.4-6.6 21.2-6.6',
  tanahBawah: 'M6 55.5c8-3.3 15.5-3 22.5 1 3.2 1.8 5.5 1.6 8.3-.4 5.2-3.8 11.4-6.6 21.2-6.6',
}

/** Tanda merek SubTen. Warna dari token --logo-* (versi lebih terang di tema gelap). */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={LOGO_PATH.rumah} strokeWidth="4.6" style={{ stroke: 'var(--logo-ink)' }} />
      {LOGO_PATH.jendela.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="5.6" height="5.6" rx="1.1" style={{ fill: 'var(--logo-ink)' }} />
      ))}
      <path d={LOGO_PATH.tanahAtas} strokeWidth="4.4" style={{ stroke: 'var(--logo-teal)' }} />
      <path d={LOGO_PATH.tanahBawah} strokeWidth="4.4" style={{ stroke: 'var(--logo-green)' }} />
      <path d={LOGO_PATH.penanda} style={{ fill: 'var(--logo-pin)' }} />
      <circle cx="53" cy="22" r="3" style={{ fill: 'var(--logo-pin-hole)' }} />
    </svg>
  )
}

/** Nama produk: "Sub" dan "Ten" dalam dua warna merek supaya kepanjangannya terbaca. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('font-extrabold tracking-tight', className)} style={{ color: 'var(--logo-ink)' }}>
      Sub<span style={{ color: 'var(--logo-teal)' }}>Ten</span>
    </span>
  )
}

type Varian = 'primary' | 'accent' | 'secondary' | 'ghost'
const VARIAN: Record<Varian, string> = {
  primary: 'bg-ink text-surface hover:opacity-90',
  accent: 'bg-accent text-accent-ink hover:brightness-95',
  secondary: 'border border-line-2 bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
}
const DASAR_TOMBOL =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-semibold transition-[transform,background-color,opacity,filter] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  varian?: Varian
  ukuran?: 'sm' | 'md'
  ikon?: ReactNode
}

export function Button({ varian = 'secondary', ukuran = 'md', ikon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(DASAR_TOMBOL, VARIAN[varian], ukuran === 'sm' ? 'h-9 px-3 text-[13px]' : 'h-11 px-4 text-sm', className)}
      {...rest}
    >
      {ikon}
      {children}
    </button>
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  label: string
  varian?: Varian
  aktif?: boolean
}

export function IconButton({ label, varian = 'ghost', aktif, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={aktif}
      className={cx(DASAR_TOMBOL, 'size-10', aktif ? 'bg-ink text-surface' : VARIAN[varian], className)}
      {...rest}
    >
      {children}
    </button>
  )
}

interface SegmentedProps<T extends string | number> {
  label: string
  nilai: T
  opsi: { nilai: T; label: string }[]
  onUbah: (v: T) => void
  ukuran?: 'sm' | 'md'
  penuh?: boolean
}

/** Pilihan tunggal bersegmen (radiogroup). */
export function Segmented<T extends string | number>({ label, nilai, opsi, onUbah, ukuran = 'md', penuh }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex gap-1 rounded-[12px] bg-surface-2 p-1', penuh && 'flex w-full')}>
      {opsi.map((o) => {
        const aktif = o.nilai === nilai
        return (
          <button
            key={String(o.nilai)}
            type="button"
            role="radio"
            aria-checked={aktif}
            onClick={() => onUbah(o.nilai)}
            className={cx(
              'rounded-[9px] font-semibold transition-colors duration-200',
              ukuran === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]',
              penuh && 'flex-1',
              aktif ? 'bg-ink text-surface' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({ className, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line-2 bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors duration-200 hover:border-ink-3 hover:text-ink active:scale-[0.98]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function warnaKategori(k: Kategori): string {
  return k === 'tidak-memadai' ? 'var(--nodata)' : `var(--kat-${k})`
}

/** Kotak warna kategori. "Data tidak memadai" memakai arsir, bukan warna saja. */
export function Swatch({ kategori, className }: { kategori: Kategori; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block size-3 shrink-0 rounded-[4px]', kategori === 'tidak-memadai' && 'hatch', className)}
      style={kategori === 'tidak-memadai' ? undefined : { background: warnaKategori(kategori) }}
    />
  )
}

/** Label kategori: selalu warna + teks, tidak pernah warna saja. */
export function KategoriBadge({ kategori, className }: { kategori: Kategori; className?: string }) {
  return (
    <span className={cx('inline-flex h-7 items-center gap-2 rounded-full bg-surface-2 pl-2.5 pr-3 text-[12.5px] font-semibold text-ink', className)}>
      <Swatch kategori={kategori} />
      {LABEL_KATEGORI[kategori]}
    </span>
  )
}

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx('glass rounded-[22px]', className)} {...rest}>
      {children}
    </section>
  )
}

/** Kartu polos untuk halaman non-peta. */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-[22px] border border-line bg-surface', className)} {...rest}>
      {children}
    </div>
  )
}

export function Stat({ label, nilai, satuan, catatan }: { label: string; nilai: ReactNode; satuan?: string; catatan?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[12.5px] font-medium text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[28px] font-bold leading-none tracking-tight text-ink">{nilai}</span>
        {satuan && <span className="text-[13px] font-medium text-ink-3">{satuan}</span>}
      </div>
      {catatan && <div className="mt-1.5 text-[12.5px] text-ink-2">{catatan}</div>}
    </div>
  )
}

export function JudulBagian({ children, kanan }: { children: ReactNode; kanan?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-ink-2">{children}</h3>
      {kanan}
    </div>
  )
}

/** Catatan penting. nada "demo" dipakai untuk penanda data ilustratif. */
export function Notice({ nada = 'info', children, className }: { nada?: 'demo' | 'info'; children: ReactNode; className?: string }) {
  if (nada === 'demo') {
    return (
      <div role="note" className={cx('flex gap-2.5 rounded-[12px] border border-notice-line bg-notice-bg px-3 py-2.5 text-[12.5px] leading-snug text-notice-ink', className)}>
        <Warning size={16} weight="fill" className="mt-px shrink-0" aria-hidden="true" />
        <div>{children}</div>
      </div>
    )
  }
  return (
    <div role="note" className={cx('flex gap-2.5 rounded-[12px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-snug text-ink-2', className)}>
      <Info size={16} className="mt-px shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-[10px] bg-surface-2', className)} />
}
