// Kotak pencarian: saran instan dari data lokal saat mengetik,
// alamat lewat Nominatim hanya saat menekan Enter / tombol Cari.
import { useId, useMemo, useRef, useState } from 'react'
import { CircleNotch, MagnifyingGlass, MapPin, X } from '@phosphor-icons/react'
import { cariLokal, cariNominatim, normal, type HasilCari } from '../lib/geocode'
import { useApp } from '../lib/store'
import { Button, cx } from '../ui/primitives'

type Status = 'diam' | 'memuat' | 'kosong' | 'galat'

export default function SearchBox() {
  const kawasan = useApp((s) => s.kawasan)
  const pilihTitik = useApp((s) => s.pilihTitik)
  const pilihKawasan = useApp((s) => s.pilihKawasan)
  const [q, setQ] = useState('')
  const [buka, setBuka] = useState(false)
  const [daring, setDaring] = useState<HasilCari[]>([])
  const [status, setStatus] = useState<Status>('diam')
  const [aktif, setAktif] = useState(-1)
  const batal = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const idDaftar = useId()

  const lokal = useMemo(() => cariLokal(q, kawasan), [q, kawasan])
  const semua = [...lokal, ...daring]
  const tampil = buka && (semua.length > 0 || status !== 'diam')

  const pilih = (h: HasilCari) => {
    if (h.kawasanId) pilihKawasan(h.kawasanId, 'cari')
    else pilihTitik(h.lngLat, 'cari', h.label)
    setQ(h.label)
    setBuka(false)
    setAktif(-1)
    input.current?.blur()
  }

  const cariDaring = async () => {
    const teks = q.trim()
    if (teks.length < 3) return
    batal.current?.abort()
    const c = new AbortController()
    batal.current = c
    setStatus('memuat')
    setBuka(true)
    try {
      const r = await cariNominatim(teks, c.signal)
      if (c.signal.aborted) return
      setDaring(r)
      setStatus(r.length ? 'diam' : 'kosong')
    } catch {
      if (c.signal.aborted) return
      setDaring([])
      setStatus('galat')
    }
  }

  const kirim = (e: React.FormEvent) => {
    e.preventDefault()
    const terpilih = aktif >= 0 ? semua[aktif] : undefined
    if (terpilih) return pilih(terpilih)
    const persis = lokal.find((h) => normal(h.label) === normal(q))
    if (persis) return pilih(persis)
    void cariDaring()
  }

  const baris = (h: HasilCari, i: number) => (
    <li
      key={h.kunci}
      id={`${idDaftar}-${i}`}
      role="option"
      aria-selected={i === aktif}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pilih(h)}
      onMouseEnter={() => setAktif(i)}
      className={cx('flex cursor-pointer items-start gap-2.5 rounded-[12px] px-3 py-2', i === aktif && 'bg-surface-2')}
    >
      <MapPin size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-ink">{h.label}</span>
        <span className="block truncate text-[12px] text-ink-3">{h.sub}</span>
      </span>
    </li>
  )

  return (
    <div
      className="glass rounded-[22px] p-2"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setBuka(false)
      }}
    >
      <form onSubmit={kirim} role="search" className="flex items-center gap-1.5">
        <MagnifyingGlass size={18} className="ml-2.5 shrink-0 text-ink-3" aria-hidden="true" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setDaring([])
            setStatus('diam')
            setAktif(-1)
            setBuka(true)
          }}
          onFocus={() => setBuka(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setBuka(true)
              setAktif((i) => Math.min(semua.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAktif((i) => Math.max(-1, i - 1))
            } else if (e.key === 'Escape') {
              setBuka(false)
              setAktif(-1)
            }
          }}
          role="combobox"
          aria-expanded={tampil}
          aria-controls={idDaftar}
          aria-activedescendant={aktif >= 0 ? `${idDaftar}-${aktif}` : undefined}
          aria-autocomplete="list"
          aria-label="Cari alamat, perumahan, atau kelurahan di Kota Semarang"
          placeholder="Cari alamat, perumahan, atau kelurahan"
          autoComplete="off"
          enterKeyHint="search"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
        />
        {q && (
          <button
            type="button"
            aria-label="Hapus pencarian"
            onClick={() => {
              setQ('')
              setDaring([])
              setStatus('diam')
              input.current?.focus()
            }}
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X size={15} />
          </button>
        )}
        <Button type="submit" varian="primary" ukuran="sm" disabled={status === 'memuat' || q.trim().length < 2} className="h-10">
          {status === 'memuat' ? <CircleNotch size={16} className="animate-spin" aria-label="Mencari" /> : 'Cari'}
        </Button>
      </form>

      {tampil && (
        <div className="mt-2 border-t border-line pt-2">
          <ul id={idDaftar} role="listbox" aria-label="Hasil pencarian" className="scroll-thin max-h-[300px] overflow-y-auto">
            {semua.map(baris)}
          </ul>
          {status === 'memuat' && <p className="px-3 py-2 text-[12.5px] text-ink-3">Mencari alamat...</p>}
          {status === 'kosong' && <p className="px-3 py-2 text-[12.5px] text-ink-2">Alamat tidak ditemukan di sekitar Kota Semarang. Coba nama kelurahan, atau klik langsung di peta.</p>}
          {status === 'galat' && <p className="px-3 py-2 text-[12.5px] text-ink-2">Pencarian alamat sedang tidak bisa dihubungi. Nama kelurahan tetap bisa dicari, atau klik langsung di peta.</p>}
          <p className="px-3 pb-1 pt-1.5 text-[11.5px] text-ink-3">
            {daring.length > 0 ? 'Alamat dari Nominatim, data © OpenStreetMap.' : 'Tekan Cari untuk mencari alamat lewat Nominatim (OpenStreetMap).'}
          </p>
        </div>
      )}
    </div>
  )
}
