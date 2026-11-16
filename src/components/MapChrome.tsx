// Kontrol peta (zoom, 2D/3D, tampilkan seluruh wilayah), legenda, dan pilihan lapis konteks.
// Desktop: kolom tombol dan panel legenda selalu terbuka.
// Ponsel: tombol ringkas (tanpa zoom, cukup cubit), legenda mini, legenda lengkap dalam lembar bawah,
// dan tombol "Lokasi saya" untuk memeriksa tempat pengguna berdiri.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, CircleNotch, CornersOut, Crosshair, Minus, Plus, Stack, X } from '@phosphor-icons/react'
import { LAJU_BINS, LABEL_KATEGORI } from '../lib/config'
import { fmt } from '../lib/format'
import { JENIS_LAPIS, LABEL_LAPIS, LABEL_SINGKAT, type JenisLapis, type LapisKonteks } from '../lib/konteks'
import { useLayarKecil } from '../lib/layar'
import { navigasi } from '../lib/router'
import { jembatanPeta, useApp } from '../lib/store'
import type { ModePeta, Position } from '../lib/types'
import { wilayahDiTitik } from '../lib/wilayah'
import { cx, IconButton, Panel, Segmented, Swatch } from '../ui/primitives'

/** Golongan tiap lapis, ditulis di bawah namanya pada kartu pilihan lapis. */
const GOLONGAN: Record<JenisLapis, string> = { rdtr: 'Tata ruang', rtrw: 'Tata ruang', geologi: 'Batuan', banjir: 'Bahaya BNPB', abrasi: 'Bahaya BNPB' }

/** Warna kelas lapis untuk pratinjau di kartu: empat kelas terluas (urutan statistik). */
function warnaPratinjau(l: LapisKonteks): string[] {
  const sumber = l.meta.statistik.length ? l.meta.statistik : l.fitur
  return [...new Set(sumber.map((s) => s.warna))].slice(0, 4)
}

/** Kartu pilihan lapis konteks: satu kartu per lapis yang tersedia, ketuk lagi untuk mematikan. */
function PilihLapis() {
  const konteks = useApp((s) => s.konteks)
  const aktif = useApp((s) => s.lapisKonteks)
  const setLapisKonteks = useApp((s) => s.setLapisKonteks)
  const ada = JENIS_LAPIS.filter((j) => konteks[j])
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink-2">Lapis konteks</span>
        {aktif && (
          <button type="button" onClick={() => setLapisKonteks(null)} className="text-[11.5px] font-semibold text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            Matikan
          </button>
        )}
      </div>
      <div role="group" aria-label="Lapis konteks" className="mt-2 grid grid-cols-3 gap-1.5">
        {ada.map((j) => {
          const pilih = aktif === j
          return (
            <button
              key={j}
              type="button"
              aria-pressed={pilih}
              onClick={() => setLapisKonteks(pilih ? null : j)}
              className={cx(
                'flex min-w-0 flex-col items-start gap-1.5 rounded-[12px] border px-2.5 pb-2 pt-2.5 text-left transition-[background-color,border-color,box-shadow] duration-200',
                pilih ? 'border-ink bg-surface shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-line bg-surface-2/60 hover:border-line-2 hover:bg-surface-2',
              )}
            >
              <span aria-hidden="true" className="flex h-[5px] w-full gap-px overflow-hidden rounded-full">
                {warnaPratinjau(konteks[j]!).map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="max-w-full truncate text-[12.5px] font-bold leading-tight text-ink">{LABEL_SINGKAT[j]}</span>
              <span className="max-w-full truncate text-[10.5px] leading-none text-ink-3">{GOLONGAN[j]}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Kelas lapis konteks dengan laju median per kelas: bahan analisis langsung di legenda. */
function LegendaKonteks({ lapis }: { lapis: LapisKonteks }) {
  const kelas = lapis.meta.statistik.length ? lapis.meta.statistik : lapis.fitur.map((f) => ({ nama: f.nama, warna: f.warna, median: undefined }))
  const skala = Math.max(1, ...kelas.map((s) => s.median ?? 0))
  return (
    <div className="mt-2.5 rounded-[14px] bg-surface-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-ink">{LABEL_LAPIS[lapis.meta.lapis]}</span>
        <span className="shrink-0 text-[10.5px] text-ink-3">median laju turun</span>
      </div>
      <ul className="scroll-thin mt-2 max-h-[232px] space-y-2 overflow-y-auto pr-1">
        {kelas.map((s) => {
          const m = s.median != null ? Math.max(0, s.median) : null
          return (
            <li key={s.nama} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
              <span aria-hidden="true" className="size-3 rounded-[4px] ring-1 ring-black/10" style={{ background: s.warna }} />
              <span className="truncate text-[12px] text-ink" title={s.nama}>
                {s.nama.replace(/^Kawasan (Peruntukan )?/, '')}
              </span>
              <span className="tnum text-[11.5px] font-semibold text-ink-2">{m != null ? `${fmt(m, 1)} cm` : '-'}</span>
              <span aria-hidden="true" className="col-span-2 col-start-2 h-1 overflow-hidden rounded-full bg-line">
                {m != null && <span className="block h-full rounded-full bg-data" style={{ width: `${Math.max(3, (m / skala) * 100)}%` }} />}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2.5 text-[11px] leading-snug text-ink-3">
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

/** Isi legenda: warna peta, kelas laju atau kategori, dan lapis konteks. Sama di desktop dan ponsel. */
function IsiLegenda() {
  const modePeta = useApp((s) => s.modePeta)
  const setModePeta = useApp((s) => s.setModePeta)
  const t = useApp((s) => s.thresholds)
  const ukuranSel = useApp((s) => s.grid?.kepala.ukuranSelM ?? null)
  const konteks = useApp((s) => s.konteks)
  const lapisKonteks = useApp((s) => s.lapisKonteks)
  const lapisAktif = lapisKonteks ? konteks[lapisKonteks] : undefined
  const adaKonteks = JENIS_LAPIS.some((j) => konteks[j])

  return (
    <>
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
        <>
          <PilihLapis />
          {lapisAktif && <LegendaKonteks lapis={lapisAktif} />}
        </>
      )}
    </>
  )
}

function TombolTigaD() {
  const tigaD = useApp((s) => s.tigaD)
  const setTigaD = useApp((s) => s.setTigaD)
  return (
    <button
      type="button"
      onClick={() => setTigaD(!tigaD)}
      aria-label={tigaD ? 'Ganti ke tampilan 2D' : 'Ganti ke tampilan 3D'}
      title={tigaD ? 'Tampilan 2D' : 'Tampilan 3D'}
      className="grid size-10 place-items-center rounded-[12px] text-[12.5px] font-bold text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      {tigaD ? '2D' : '3D'}
    </button>
  )
}

/** Legenda ringkas di pojok kiri atas peta (ponsel). Ketuk untuk membuka legenda lengkap. */
function LegendaMini({ onBuka }: { onBuka: () => void }) {
  const modePeta = useApp((s) => s.modePeta)
  const lapisKonteks = useApp((s) => s.lapisKonteks)
  let isi: ReactNode
  if (lapisKonteks) {
    isi = (
      <>
        <Stack size={14} weight="fill" className="text-ink" aria-hidden="true" />
        <span className="text-ink">{LABEL_LAPIS[lapisKonteks]}</span>
      </>
    )
  } else if (modePeta === 'laju') {
    isi = (
      <>
        <span className="text-ink">Laju</span>
        <span className="flex h-2 w-[72px] shrink-0 gap-px overflow-hidden rounded-full" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="flex-1" style={{ background: `var(--ramp-${i})` }} />
          ))}
        </span>
        <span className="tnum truncate">&lt;2 sampai &gt;8 cm/th</span>
      </>
    )
  } else {
    isi = (
      <>
        <span className="text-ink">Kategori</span>
        {(['rendah', 'sedang', 'tinggi'] as const).map((k) => (
          <span key={k} className="flex shrink-0 items-center gap-1">
            <Swatch kategori={k} className="size-2.5" />
            {LABEL_KATEGORI[k]}
          </span>
        ))}
      </>
    )
  }
  return (
    <button
      type="button"
      onClick={onBuka}
      aria-label="Buka legenda dan lapis peta"
      className="glass absolute left-3 top-[calc(136px+var(--geser-atas))] z-10 flex h-9 max-w-[calc(100%-88px)] items-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-3.5 text-[11.5px] font-semibold text-ink-2"
    >
      {isi}
    </button>
  )
}

/** Lembar legenda lengkap untuk ponsel. Tutup dengan latar, tombol, Escape, atau usap ke bawah. */
function LembarLegenda({ onTutup }: { onTutup: () => void }) {
  const tutupRef = useRef<HTMLButtonElement>(null)
  const awalY = useRef<number | null>(null)
  const [geser, setGeser] = useState(0)
  useEffect(() => {
    tutupRef.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onTutup])
  return (
    <div className="absolute inset-0 z-[40] lg:hidden">
      <div className="pa-fade absolute inset-0 bg-[rgb(10_10_16/0.32)]" onClick={onTutup} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Legenda dan lapis peta"
        className="pa-enter absolute inset-x-0 bottom-0 mx-auto max-h-[82dvh] max-w-[640px] overflow-y-auto overscroll-contain rounded-t-[26px] border-t border-line bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-18px_44px_-18px_rgb(22_22_29/0.34)]"
        style={geser ? { transform: `translateY(${geser}px)`, animation: 'none' } : undefined}
        onTouchStart={(e) => {
          awalY.current = e.currentTarget.scrollTop <= 0 ? (e.touches[0]?.clientY ?? null) : null
        }}
        onTouchMove={(e) => {
          if (awalY.current == null) return
          setGeser(Math.max(0, (e.touches[0]?.clientY ?? 0) - awalY.current))
        }}
        onTouchEnd={() => {
          if (geser > 80) onTutup()
          else setGeser(0)
          awalY.current = null
        }}
      >
        <div className="sticky top-0 z-[1] -mx-5 bg-surface px-5 pb-3 pt-2">
          <span aria-hidden="true" className="mx-auto mb-2 block h-[5px] w-10 rounded-full bg-line-2" />
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold tracking-tight text-ink">Legenda dan lapis peta</h2>
            <button
              ref={tutupRef}
              type="button"
              onClick={onTutup}
              aria-label="Tutup legenda"
              className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-2 active:bg-line-2"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>
        <IsiLegenda />
      </section>
    </div>
  )
}

/** Pilih titik di tempat pengguna berada (GPS ponsel). Pindah wilayah bila perlu. */
function TombolLokasiSaya({ kabari }: { kabari: (t: string) => void }) {
  const [sibuk, setSibuk] = useState(false)
  const cari = () => {
    if (!('geolocation' in navigator)) {
      kabari('Peramban ini tidak bisa membaca lokasi.')
      return
    }
    setSibuk(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const titik: Position = [pos.coords.longitude, pos.coords.latitude]
        const w = wilayahDiTitik(titik)
        if (!w) {
          setSibuk(false)
          kabari('Lokasi Anda di luar wilayah yang tersedia.')
          return
        }
        if (w.id !== useApp.getState().wilayah) await useApp.getState().pilihWilayah(w.id)
        setSibuk(false)
        const s = useApp.getState()
        if (s.status !== 'siap') {
          kabari(`Data ${w.nama} belum selesai diolah.`)
          return
        }
        s.pilihTitik(titik, 'peta', 'Lokasi saya')
      },
      (e) => {
        setSibuk(false)
        kabari(e.code === e.PERMISSION_DENIED ? 'Izin lokasi ditolak. Aktifkan di pengaturan peramban.' : 'Lokasi belum terbaca. Coba lagi di tempat terbuka.')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }
  return (
    <IconButton label="Cek lokasi saya sekarang" onClick={cari} disabled={sibuk}>
      {sibuk ? <CircleNotch size={18} className="animate-spin" /> : <Crosshair size={18} />}
    </IconButton>
  )
}

export default function MapChrome() {
  const kecil = useLayarKecil()
  const [legendaBuka, setLegendaBuka] = useState(false)
  const [pesan, setPesan] = useState<string | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const kabari = (t: string) => {
    setPesan(t)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPesan(null), 3200)
  }

  if (kecil) {
    return (
      <>
        <div className="glass absolute right-3 top-[calc(136px+var(--geser-atas))] z-10 flex flex-col rounded-[16px] p-1">
          <IconButton label="Legenda dan lapis peta" data-tur="legenda" aktif={legendaBuka} onClick={() => setLegendaBuka(true)}>
            <Stack size={18} />
          </IconButton>
          <TombolTigaD />
          <IconButton label="Tampilkan seluruh wilayah" onClick={() => jembatanPeta.aturUlang?.()}>
            <CornersOut size={18} />
          </IconButton>
          <TombolLokasiSaya kabari={kabari} />
        </div>
        <LegendaMini onBuka={() => setLegendaBuka(true)} />
        {legendaBuka && <LembarLegenda onTutup={() => setLegendaBuka(false)} />}
        {pesan && (
          <div className="pointer-events-none absolute inset-x-0 top-[calc(184px+var(--geser-atas))] z-[30] flex justify-center px-16">
            <p role="status" className="pa-fade rounded-full bg-ink px-4 py-2 text-center text-[12.5px] font-semibold text-surface shadow-pop">
              {pesan}
            </p>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="glass absolute right-4 top-[88px] z-10 flex flex-col rounded-[14px] p-1">
        <IconButton label="Perbesar peta" onClick={() => jembatanPeta.zoom?.(1)}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Perkecil peta" onClick={() => jembatanPeta.zoom?.(-1)}>
          <Minus size={18} />
        </IconButton>
        <TombolTigaD />
        <IconButton label="Tampilkan seluruh wilayah" onClick={() => jembatanPeta.aturUlang?.()}>
          <CornersOut size={18} />
        </IconButton>
      </div>

      <Panel aria-label="Legenda peta" data-tur="legenda" className="scroll-thin absolute bottom-11 right-4 z-10 max-h-[calc(100dvh-140px)] w-[336px] overflow-y-auto p-4">
        <IsiLegenda />
      </Panel>
    </>
  )
}
