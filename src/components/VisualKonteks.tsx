// Visual kecil untuk kartu konteks di laporan: skala tiga tingkat, penampang tanah, dan langkah cek persil.
// Bentuk dan warnanya sama dengan versi PDF (lib/pdf.ts), dari data lib/penampang.ts.
import { useId } from 'react'
import { CATATAN_PENAMPANG, type Penampang } from '../lib/penampang'
import { cx } from '../ui/primitives'

/** Skala tiga tingkat: tingkat aktif diisi; bila tingkat itu perlu diwaspadai, warnanya kuning peringatan. */
export function StripSkala<T extends string>({ judul, opsi, aktif, waspada }: { judul: string; opsi: { nilai: T; label: string }[]; aktif: T; waspada: boolean }) {
  const label = opsi.find((o) => o.nilai === aktif)?.label ?? ''
  return (
    <div className="mt-2.5" role="img" aria-label={`${judul}: ${label}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">{judul}</div>
      <div className="mt-1 grid grid-cols-3 gap-1" aria-hidden="true">
        {opsi.map((o) => {
          const ini = o.nilai === aktif
          return (
            <div
              key={o.nilai}
              className={cx(
                'flex h-8 items-center justify-center rounded-[9px] px-1 text-center text-[11.5px] font-semibold leading-tight',
                ini ? (waspada ? 'border border-notice-line bg-notice-bg text-notice-ink' : 'bg-ink text-surface') : 'bg-surface text-ink-3',
              )}
            >
              {o.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Penampang tanah sederhana: rumah di atas susunan lapisan, dengan pondasi tiang bila tanahnya lunak. */
export function PenampangTanah({ data }: { data: Penampang }) {
  const id = useId().replace(/:/g, '')
  const kiri = 8
  const kanan = 150
  const tanah = 44
  const dasar = 146
  let y = tanah
  const lapis = data.lapisan.map((l) => {
    const t = l.porsi * (dasar - tanah)
    const r = { ...l, y, t }
    y += t
    return r
  })
  const utama = lapis.find((l) => l.utama)
  const akhir = lapis[lapis.length - 1]!
  return (
    <figure className="mt-3">
      <svg viewBox="0 0 300 150" className="block w-full" role="img" aria-label={`Penampang tanah: ${data.lapisan.map((l) => l.nama).join(', ')}`}>
        <defs>
          <pattern id={`${id}t`} width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="rgb(0 0 0 / 0.25)" />
            <circle cx="5.5" cy="5.5" r="0.9" fill="rgb(0 0 0 / 0.25)" />
          </pattern>
          <pattern id={`${id}g`} width="16" height="7" patternUnits="userSpaceOnUse">
            <path d="M0 4 Q4 1 8 4 T16 4" fill="none" stroke="rgb(0 0 0 / 0.22)" strokeWidth="1" />
          </pattern>
          <pattern id={`${id}a`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(0 0 0 / 0.22)" strokeWidth="1.2" />
          </pattern>
        </defs>

        {lapis.map((l) => (
          <g key={l.nama}>
            <rect x={kiri} y={l.y} width={kanan - kiri} height={l.t} fill={l.warna} />
            <rect x={kiri} y={l.y} width={kanan - kiri} height={l.t} fill={`url(#${id}${l.pola[0]})`} />
            <line x1={kanan} x2={kanan + 9} y1={l.y + l.t / 2} y2={l.y + l.t / 2} stroke="var(--line-2)" />
            <text x={kanan + 13} y={l.y + l.t / 2 + (l.nama.includes(': ') ? -2 : 3.5)} fontSize="10" fontWeight={l.utama ? 700 : 500} fill="var(--ink)">
              {l.nama.split(': ')[0]}
            </text>
            {l.nama.includes(': ') && (
              <text x={kanan + 13} y={l.y + l.t / 2 + 10} fontSize="9.5" fill="var(--ink-2)">
                {l.nama.split(': ')[1]}
              </text>
            )}
          </g>
        ))}
        {lapis.slice(1).map((l) => (
          <line key={`b${l.nama}`} x1={kiri} x2={kanan} y1={l.y} y2={l.y} stroke="rgb(255 255 255 / 0.7)" strokeWidth="0.8" />
        ))}
        <rect x={kiri} y={tanah} width={kanan - kiri} height={dasar - tanah} fill="none" stroke="var(--line-2)" />

        {/* pondasi tiang sampai lapisan keras */}
        {data.tiang &&
          [66, 92].map((x) => <line key={x} x1={x} x2={x} y1={tanah} y2={akhir.y + 4} stroke="var(--ink)" strokeWidth="2.2" strokeDasharray="4 3" />)}
        {/* lapisan utama memadat */}
        {data.memadat && utama && (
          <g>
            <line x1="128" x2="128" y1={utama.y + 10} y2={utama.y + utama.t - 14} stroke="var(--ink)" strokeWidth="1.8" />
            <path d={`M122 ${utama.y + utama.t - 16} L128 ${utama.y + utama.t - 8} L134 ${utama.y + utama.t - 16} Z`} fill="var(--ink)" />
          </g>
        )}

        {/* muka tanah dan rumah */}
        <line x1={kiri - 4} x2={kanan + 4} y1={tanah} y2={tanah} stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M55 28 L79 12 L103 28 Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="60" y="28" width="38" height={tanah - 28} fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.6" />
        <rect x="75" y="34" width="8" height={tanah - 34} fill="var(--ink)" />
      </svg>
      <figcaption className="mt-1 text-[11px] leading-snug text-ink-3">
        {data.tiang ? 'Garis putus: pondasi tiang sampai lapisan keras. Panah: lapisan lunak memadat. ' : ''}
        {CATATAN_PENAMPANG}
      </figcaption>
    </figure>
  )
}

/** Langkah bernomor, berjajar. */
export function LangkahBernomor({ langkah }: { langkah: string[] }) {
  return (
    <ol className="mt-2.5 grid grid-cols-3 gap-2">
      {langkah.map((l, i) => (
        <li key={l} className="flex flex-col items-start gap-1.5 rounded-[12px] bg-surface p-2.5">
          <span className="grid size-6 place-items-center rounded-full bg-ink text-[11.5px] font-bold text-surface">{i + 1}</span>
          <span className="text-[11.5px] font-semibold leading-snug text-ink">{l}</span>
        </li>
      ))}
    </ol>
  )
}
