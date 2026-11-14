// Laporan Ambles versi ponsel: lembar bawah yang bisa diseret.
// Posisi kecil: judul dan angka utama. Sedang: kalimat status dan tombol aksi.
// Penuh: seluruh laporan, dengan chip untuk lompat antarbagian. Isinya sama lengkap dengan panel desktop.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleNotch, DownloadSimple, MapPin, Scales, ShareNetwork, X } from '@phosphor-icons/react'
import { LABEL_KATEGORI, MAKS_BANDING, TENORS } from '../lib/config'
import { fmt, fmtKoordinat } from '../lib/format'
import { hitungProyeksi, kalimatStatus, teksProyeksi } from '../lib/risk'
import { navigasi } from '../lib/router'
import type { Position } from '../lib/types'
import { Button, cx, IconButton, Notice, Segmented, Skeleton, Swatch, warnaKategori } from '../ui/primitives'
import HistoryChart from './HistoryChart'
import LembarBawah, { type PosisiLembar } from './LembarBawah'
import { DaftarKonteks, IsiSumber, Langkah, useBarisKonteks, useLaporan, type Laporan } from './ReportPanel'
import TenorVisual from './TenorVisual'

const TANPA_TITIK: Position = [0, 0]

function Bagian({ id, judul, kanan, children }: { id: string; judul: string; kanan?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} className="border-t border-line px-5 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id={`${id}-judul`} className="text-[16px] font-bold tracking-tight text-ink">
          {judul}
        </h3>
        {kanan}
      </div>
      {children}
    </section>
  )
}

/** Kartu angka utama: terlihat bahkan pada posisi lembar terkecil. */
function Ringkas({ L }: { L: Laporan }) {
  const { k, kategori, adaData, tenor, selection } = L
  if (!k || !kategori) {
    return (
      <div className="rounded-[18px] bg-surface-2 p-4">
        <p className="text-[17px] font-bold tracking-tight text-ink">Di luar wilayah data</p>
        <p className="mt-0.5 font-mono text-[11.5px] text-ink-3">{fmtKoordinat(selection.lngLat)}</p>
      </div>
    )
  }
  if (!adaData) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] bg-surface-2 p-4">
        <Swatch kategori="tidak-memadai" className="size-9 rounded-[10px]" />
        <div className="min-w-0">
          <p className="text-[17px] font-bold tracking-tight text-ink">Data tidak memadai</p>
          <p className="text-[12.5px] text-ink-2">Satelit belum cukup mengukur di sini.</p>
        </div>
      </div>
    )
  }
  const laju = Math.max(0, k.laju!)
  const p = hitungProyeksi(laju, k.sigma ?? 0, tenor)
  return (
    <div className="relative overflow-hidden rounded-[18px] p-4" style={{ background: `color-mix(in srgb, ${warnaKategori(kategori)} 20%, var(--surface))` }}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: warnaKategori(kategori) }} />
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="tnum text-[40px] font-bold leading-none tracking-tight text-ink">{fmt(laju, 1)}</span>
          <span className="text-[13.5px] font-semibold text-ink-2">cm/tahun</span>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-[12.5px] font-bold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
          <Swatch kategori={kategori} />
          {LABEL_KATEGORI[kategori]}
        </span>
      </div>
      <p className="mt-2.5 text-[12.5px] leading-snug text-ink-2">
        ± {fmt(k.sigma ?? 0, 1)} cm/tahun · turun <span className="font-semibold text-ink">{teksProyeksi(p)}</span> dalam {tenor} tahun
      </p>
    </div>
  )
}

export default function LaporanMobile() {
  const L = useLaporan()
  const [posisi, setPosisi] = useState<PosisiLembar>('sedang')
  const [aktif, setAktif] = useState('lap-ringkasan')
  const gulirRef = useRef<HTMLDivElement>(null)
  const intipRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLElement>(null)
  const urutan = useRef<string[]>([])
  const baris = useBarisKonteks(L?.selection.lngLat ?? TANPA_TITIK)
  const ada = !!L
  const kunci = L?.kunci

  // Penanda bagian yang sedang dibaca (chip aktif) mengikuti guliran.
  useEffect(() => {
    const g = gulirRef.current
    if (!g) return
    const cek = () => {
      const ids = urutan.current
      if (!ids.length) return
      const batas = g.scrollTop + (chipRef.current?.offsetHeight ?? 48) + 24
      let kini = ids[0]!
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.offsetTop <= batas) kini = id
      }
      if (g.scrollTop > 0 && g.scrollTop + g.clientHeight >= g.scrollHeight - 4) kini = ids[ids.length - 1]!
      setAktif(kini)
    }
    g.addEventListener('scroll', cek, { passive: true })
    return () => g.removeEventListener('scroll', cek)
  }, [ada])

  // Chip aktif selalu terlihat di deretnya.
  useEffect(() => {
    const w = chipRef.current
    const c = w?.querySelector<HTMLElement>(`[data-bagian="${aktif}"]`)
    if (!w || !c) return
    if (c.offsetLeft < w.scrollLeft + 16 || c.offsetLeft + c.offsetWidth > w.scrollLeft + w.clientWidth - 16) {
      w.scrollTo({ left: c.offsetLeft - 20, behavior: 'smooth' })
    }
  }, [aktif])

  // Lokasi baru: mulai dari atas laporan.
  useEffect(() => {
    gulirRef.current?.scrollTo({ top: 0 })
    setAktif('lap-ringkasan')
  }, [kunci])

  if (!L) return null
  const { selection, k, kel, titik, kategori, adaData, diBanding, lebarBlok, memuatDeret, periode, judul, subjudul, rataKelurahan, meta, tenor, setTenor, banding, sibuk, pesan, unduh, salin, kabari, tambahBanding, tutup } = L
  const lengkap = !!(k && kel && kategori)

  const bagian = lengkap
    ? [
        { id: 'lap-ringkasan', label: 'Ringkasan' },
        ...(adaData
          ? [
              { id: 'lap-riwayat', label: 'Riwayat' },
              { id: 'lap-proyeksi', label: 'Proyeksi' },
            ]
          : []),
        ...(baris.length ? [{ id: 'lap-konteks', label: 'Konteks' }] : []),
        { id: 'lap-langkah', label: 'Langkah' },
        { id: 'lap-sumber', label: 'Sumber' },
      ]
    : []
  urutan.current = bagian.map((b) => b.id)

  const lompat = (id: string) => {
    setPosisi('penuh')
    setAktif(id)
    const g = gulirRef.current
    const el = document.getElementById(id)
    if (!g || !el) return
    const atas = id === 'lap-ringkasan' ? 0 : el.offsetTop - (chipRef.current?.offsetHeight ?? 48) + 1
    requestAnimationFrame(() => g.scrollTo({ top: atas, behavior: 'smooth' }))
  }

  const tambah = () => {
    tambahBanding()
    kabari(`Masuk daftar banding (${Math.min(banding.length + 1, MAKS_BANDING)} dari ${MAKS_BANDING}).`)
  }

  const bagikan = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Laporan Ambles: ${judul}`, text: lengkap ? kalimatStatus(k!.laju, k!.sigma, kategori!, titik) : undefined, url: window.location.href })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') void salin()
      }
      return
    }
    void salin()
  }

  return (
    <LembarBawah
      label="Laporan Ambles"
      posisi={posisi}
      onPosisi={setPosisi}
      onTutup={tutup}
      gulirRef={gulirRef}
      intipRef={intipRef}
      melayang={
        pesan ? (
          <p role="status" className="pa-fade pointer-events-auto rounded-full bg-ink px-4 py-2 text-center text-[12.5px] font-semibold text-surface shadow-pop">
            {pesan}
          </p>
        ) : null
      }
      kepala={({ posisi: p, ke, tutup: tutupLembar, pegangan }) => (
        <div className="px-5 pb-1">
          <div className="pt-1.5">{pegangan}</div>
          <div className="flex items-start gap-3 pt-0.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                <MapPin size={12} weight="fill" aria-hidden="true" />
                Laporan ambles
              </p>
              <h2 className="mt-1 truncate text-[21px] font-bold leading-tight tracking-tight text-ink">{judul}</h2>
              <p className="mt-0.5 truncate text-[13px] text-ink-2">{subjudul}</p>
            </div>
            <button
              type="button"
              onClick={tutupLembar}
              aria-label="Tutup laporan"
              className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors active:bg-line-2"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
          {/* ketuk kartu saat lembar kecil untuk membukanya */}
          <div ref={intipRef} className="mt-3" onClick={() => p === 'kecil' && ke('sedang')}>
            <Ringkas L={L} />
          </div>
        </div>
      )}
    >
      <div id="lap-ringkasan" className="px-5 pb-5 pt-3">
        {meta?.jenis === 'demo' && (
          <Notice nada="demo" className="mb-3">
            <strong>Data demo ilustratif.</strong> Angka belum berasal dari pengukuran dan tidak untuk dasar keputusan.
          </Notice>
        )}
        {lengkap ? (
          <>
            <p className="text-[14.5px] leading-snug text-ink">{kalimatStatus(k!.laju, k!.sigma, kategori!, titik)}</p>
            {titik && adaData && (
              <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
                Dari {k!.nPiksel} piksel terukur di blok sekitar {lebarBlok} m
                {k!.sebaran ? `, antarpiksel ${fmt(Math.max(0, k!.sebaran[0]), 1)} sampai ${fmt(Math.max(0, k!.sebaran[1]), 1)} cm/tahun` : ''}. Rata-rata Kelurahan {kel!.nama}: {rataKelurahan}.
              </p>
            )}
            {!titik && selection.label !== `Kelurahan ${k!.nama}` && <p className="mt-1.5 truncate text-[12.5px] text-ink-3">Lokasi dipilih: {selection.label}</p>}
            {!adaData && (
              <Notice className="mt-3">
                Riwayat dan proyeksi tidak ditampilkan karena data satelit {titik ? 'di sekitar titik ini' : 'di kawasan ini'} belum memadai.
                {titik && ` Sebagai konteks, rata-rata Kelurahan ${kel!.nama}: ${rataKelurahan}. Itu rata-rata kawasan, bukan angka di titik ini.`}
              </Notice>
            )}
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2">
              <Button
                varian="accent"
                className="w-full"
                onClick={unduh}
                disabled={sibuk}
                ikon={sibuk ? <CircleNotch size={17} className="animate-spin" /> : <DownloadSimple size={17} weight="bold" />}
              >
                {sibuk ? 'Menyiapkan' : 'Unduh PDF'}
              </Button>
              {diBanding ? (
                <Button className="w-full" onClick={() => navigasi('bandingkan')} ikon={<Scales size={17} />}>
                  Lihat banding
                </Button>
              ) : (
                <Button className="w-full" onClick={tambah} disabled={banding.length >= MAKS_BANDING} ikon={<Scales size={17} />}>
                  Bandingkan
                </Button>
              )}
              <IconButton label="Bagikan laporan" varian="secondary" className="h-11 w-11" onClick={() => void bagikan()}>
                <ShareNetwork size={18} />
              </IconButton>
            </div>
            {!diBanding && banding.length >= MAKS_BANDING && <p className="mt-2 text-center text-[12px] text-ink-3">Daftar banding sudah penuh ({MAKS_BANDING} lokasi).</p>}
          </>
        ) : (
          <p className="text-[14px] leading-relaxed text-ink">
            Titik ini berada di luar {meta?.wilayah ?? 'wilayah ini'}. Ketuk titik di dalam batas wilayah, cari nama kelurahan, atau ganti wilayah di bilah atas.
          </p>
        )}
      </div>

      {lengkap && (
        <>
          <nav ref={chipRef} aria-label="Bagian laporan" className="no-scrollbar sticky top-0 z-[2] flex gap-1.5 overflow-x-auto border-y border-line bg-surface px-5 py-2.5">
            {bagian.map((b) => (
              <button
                key={b.id}
                type="button"
                data-bagian={b.id}
                aria-current={aktif === b.id ? 'true' : undefined}
                onClick={() => lompat(b.id)}
                className={cx(
                  'h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors duration-200',
                  aktif === b.id ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-2 active:bg-line-2',
                )}
              >
                {b.label}
              </button>
            ))}
          </nav>

          {adaData && (
            <>
              <Bagian id="lap-riwayat" judul="Riwayat" kanan={periode ? <span className="text-right text-[11.5px] leading-tight text-ink-3">{periode}</span> : undefined}>
                {memuatDeret ? <Skeleton className="h-[132px] w-full" /> : <HistoryChart deret={k!.deret} />}
              </Bagian>
              <Bagian id="lap-proyeksi" judul="Proyeksi tenor">
                <Segmented label="Tenor KPR" penuh nilai={tenor} onUbah={setTenor} opsi={TENORS.map((t) => ({ nilai: t, label: `${t} tahun` }))} />
                <div className="mt-4">
                  <TenorVisual laju={Math.max(0, k!.laju!)} sigma={k!.sigma ?? 0} tenor={tenor} />
                </div>
              </Bagian>
            </>
          )}

          {baris.length > 0 && (
            <Bagian id="lap-konteks" judul="Konteks lokasi">
              <DaftarKonteks baris={baris} laju={adaData ? k!.laju : null} />
            </Bagian>
          )}

          <Bagian id="lap-langkah" judul="Langkah berikutnya">
            <Langkah key={`${L.kunci}-${kategori}`} kategori={kategori!} judul={false} />
          </Bagian>

          <Bagian id="lap-sumber" judul="Sumber dan batasan">
            <div className="text-[13px] text-ink-2">
              <IsiSumber L={L} />
            </div>
          </Bagian>
        </>
      )}
    </LembarBawah>
  )
}
