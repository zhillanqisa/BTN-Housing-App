// Laporan Ambles: satu halaman per lokasi.
// Status -> Riwayat -> Proyeksi Tenor -> Langkah berikutnya -> Sumber dan batasan.
// Bila dataset punya grid, angkanya dari blok piksel di sekitar titik; bila tidak, rata-rata kelurahan.
// Logika dan bagian isi di sini dipakai bersama panel desktop dan lembar ponsel (LaporanMobile).
import { useState } from 'react'
import { CircleNotch, DownloadSimple, LinkSimple, MapPin, Scales, X } from '@phosphor-icons/react'
import { batasan, MAKS_BANDING, PRINSIP, TENORS } from '../lib/config'
import { fmt, fmtKoordinat, fmtPeriode } from '../lib/format'
import { lebarBlokM } from '../lib/grid'
import { KODE_ALUVIUM, konteksDi, LABEL_LAPIS, statKelas, type FiturKonteks, type JenisLapis, type LapisKonteks } from '../lib/konteks'
import { kunciTitik, LABEL_TITIK } from '../lib/lokasi'
import { kalimatStatus, klasifikasi, langkahBerikutnya, teksLaju } from '../lib/risk'
import { navigasi } from '../lib/router'
import { jembatanPeta, useApp, useBacaan } from '../lib/store'
import type { Kategori, Position } from '../lib/types'
import { Button, IconButton, JudulBagian, KategoriBadge, Notice, Segmented, Skeleton } from '../ui/primitives'
import HistoryChart from './HistoryChart'
import TenorVisual from './TenorVisual'

/** Semua yang dibutuhkan tampilan laporan untuk lokasi terpilih. null bila belum ada pilihan. */
export function useLaporan() {
  const selection = useApp((s) => s.selection)
  const bacaan = useBacaan(selection?.lngLat)
  const grid = useApp((s) => s.grid)
  const thresholds = useApp((s) => s.thresholds)
  const tenor = useApp((s) => s.tenor)
  const setTenor = useApp((s) => s.setTenor)
  const meta = useApp((s) => s.meta)
  const banding = useApp((s) => s.banding)
  const toggleBanding = useApp((s) => s.toggleBanding)
  const tutup = useApp((s) => s.tutupLaporan)
  const [sibuk, setSibuk] = useState(false)
  const [pesan, setPesan] = useState<string | null>(null)

  if (!selection) return null
  const k = bacaan?.data ?? null
  const kel = bacaan?.kelurahan ?? null
  const titik = bacaan?.mode === 'titik'
  const kategori = k ? klasifikasi(k.laju, k.memadai, thresholds) : null
  const adaData = !!k && k.memadai && k.laju != null
  const kunci = kunciTitik(selection.lngLat)
  const diBanding = banding.some((t) => kunciTitik(t.lngLat) === kunci)
  const lebarBlok = lebarBlokM(grid)
  // deret waktu grid dimuat belakangan: tampilkan kerangka, bukan "tidak tersedia"
  const memuatDeret = titik && adaData && !!grid && !grid.deret
  const periode = meta && meta.periode[0] && meta.periode[1] ? `${fmtPeriode(meta.periode[0])} sampai ${fmtPeriode(meta.periode[1])}` : null
  const judul = titik ? selection.label : k ? `Kelurahan ${k.nama}` : selection.label
  const subjudul = !kel ? 'Di luar wilayah uji' : titik ? `Kelurahan ${kel.nama}, Kecamatan ${kel.kecamatan}` : `Kecamatan ${kel.kecamatan}, ${meta?.wilayah ?? ''}`
  const rataKelurahan = kel ? (kel.memadai && kel.laju != null ? `${teksLaju(kel.laju, kel.sigma)} cm/tahun` : 'data tidak memadai') : ''

  const kabari = (teks: string) => {
    setPesan(teks)
    window.setTimeout(() => setPesan(null), 2600)
  }
  const unduh = async () => {
    if (!k || !kategori || !meta) return
    setSibuk(true)
    try {
      const { unduhLaporanPdf } = await import('../lib/pdf')
      await unduhLaporanPdf({ kawasan: k, kategori, tenor, thresholds, meta, label: selection.label, lngLat: selection.lngLat, gambarPeta: jembatanPeta.ambilGambar?.() ?? null, titik, lebarBlokM: lebarBlok })
    } catch {
      kabari('PDF gagal dibuat. Coba lagi.')
    } finally {
      setSibuk(false)
    }
  }
  const salin = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      kabari('Tautan laporan tersalin.')
    } catch {
      kabari('Tidak bisa menyalin. Salin tautan dari bilah alamat.')
    }
  }
  const tambahBanding = () => {
    if (!k) return
    const label = !titik ? `Kelurahan ${k.nama}` : selection.label === LABEL_TITIK ? `Titik di ${k.nama}` : selection.label
    toggleBanding({ lngLat: selection.lngLat, label })
  }

  return {
    selection,
    bacaan,
    k,
    kel,
    titik,
    kategori,
    adaData,
    kunci,
    diBanding,
    lebarBlok,
    memuatDeret,
    periode,
    judul,
    subjudul,
    rataKelurahan,
    meta,
    tenor,
    setTenor,
    banding,
    sibuk,
    pesan,
    kabari,
    unduh,
    salin,
    tambahBanding,
    tutup,
  }
}

export type Laporan = NonNullable<ReturnType<typeof useLaporan>>

/** Daftar periksa langkah berikutnya. judul=false: tanpa judul bagian (lembar ponsel punya judul sendiri). */
export function Langkah({ kategori, judul = true }: { kategori: Kategori; judul?: boolean }) {
  const { judul: teksJudul, butir } = langkahBerikutnya(kategori)
  const [centang, setCentang] = useState<Set<number>>(new Set())
  return (
    <div>
      {judul && <JudulBagian>Langkah berikutnya</JudulBagian>}
      <p className={judul ? 'mt-2 text-[15px] font-bold text-ink' : 'text-[14px] font-semibold text-ink'}>{teksJudul}</p>
      <ul className="mt-2 space-y-1">
        {butir.map((b, i) => (
          <li key={b}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] px-2 py-1.5 text-[13.5px] leading-snug text-ink hover:bg-surface-2">
              <input
                type="checkbox"
                checked={centang.has(i)}
                onChange={() =>
                  setCentang((s) => {
                    const n = new Set(s)
                    if (n.has(i)) n.delete(i)
                    else n.add(i)
                    return n
                  })
                }
                className="mt-0.5 size-4 shrink-0 accent-[var(--ink)]"
              />
              <span className={centang.has(i) ? 'text-ink-3 line-through' : undefined}>{b}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Bacaan geologi terhadap angka yang terukur: Aluvium (Qa) atau satuan batuan lain. */
function kalimatGeologi(kode: string, laju: number | null): string | null {
  if (laju == null || !kode) return null
  if (kode === KODE_ALUVIUM) {
    return laju >= 2
      ? 'Sesuai pola umum: ambles cepat di pesisir utara Jawa terpusat di endapan aluvial seperti di sini.'
      : 'Endapan aluvial tidak selalu ambles cepat. Di sekitar titik ini satelit mencatat laju rendah, tetapi tetap tanyakan riwayat urukan dan jenis pondasi.'
  }
  return laju >= 2
    ? 'Tidak biasa untuk batuan padat seperti ini. Bisa karena tanah urukan atau gerakan lereng, jadi perlu dicek di lapangan.'
    : 'Sesuai pola umum: batuan padat seperti ini hampir tidak ambles.'
}

function BarisKonteks({ jenis, lapis, f, laju }: { jenis: JenisLapis; lapis: LapisKonteks; f: FiturKonteks; laju: number | null }) {
  const lapisKonteks = useApp((s) => s.lapisKonteks)
  const setLapisKonteks = useApp((s) => s.setLapisKonteks)
  const st = statKelas(lapis, f.nama)
  const tampil = lapisKonteks === jenis
  const bacaan = jenis === 'geologi' ? kalimatGeologi(f.kode, laju) : null
  return (
    <div className="rounded-[14px] bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-ink-3">{LABEL_LAPIS[jenis]}</span>
        <button
          type="button"
          aria-pressed={tampil}
          onClick={() => setLapisKonteks(tampil ? null : jenis)}
          className="text-[11.5px] font-semibold text-ink underline underline-offset-2"
        >
          {tampil ? 'Sembunyikan di peta' : 'Tampilkan di peta'}
        </button>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span aria-hidden="true" className="size-3.5 shrink-0 rounded-[4px] ring-1 ring-black/10" style={{ background: f.warna }} />
        <span className="text-[14px] font-bold text-ink">{f.nama}</span>
        {f.fungsi && <span className="text-[12px] text-ink-3">{f.fungsi}</span>}
      </div>
      {f.batuan && <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{f.batuan}.</p>}
      {f.sifat && <p className="mt-1 text-[12.5px] leading-snug text-ink">{f.sifat}</p>}
      {bacaan && <p className="mt-1 text-[12.5px] font-semibold leading-snug text-ink">{bacaan}</p>}
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
        {st?.median != null && `Median laju kelas ini di seluruh wilayah ${fmt(Math.max(0, st.median), 1)} cm/tahun dari ${fmt(st.nPiksel)} piksel. `}
        {lapis.meta.jenis === 'perkiraan' ? 'Batasnya perkiraan dari bentuk lahan, bukan peta geologi resmi.' : `${lapis.meta.judul}${lapis.meta.skala ? `, skala ${lapis.meta.skala}` : ''}.`}
      </p>
    </div>
  )
}

/** Pola ruang dan geologi yang memuat titik. Kosong bila tidak ada lapis yang memuatnya. */
export function useBarisKonteks(lngLat: Position) {
  const konteks = useApp((s) => s.konteks)
  return (['rtrw', 'geologi'] as const).flatMap((j) => {
    const lapis = konteks[j]
    const f = konteksDi(lapis, lngLat)
    return lapis && f ? [{ j, lapis, f }] : []
  })
}

export function DaftarKonteks({ baris, laju }: { baris: ReturnType<typeof useBarisKonteks>; laju: number | null }) {
  return (
    <>
      <div className="space-y-2">
        {baris.map(({ j, lapis, f }) => (
          <BarisKonteks key={j} jenis={j} lapis={lapis} f={f} laju={laju} />
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-ink-3">Konteks membantu membaca angka, tetapi tidak mengubah kategori. Kategori tetap hanya dari laju yang terukur.</p>
    </>
  )
}

/** Kelurahan, pola ruang, dan geologi di titik terpilih. */
function KonteksLokasi({ lngLat, laju }: { lngLat: Position; laju: number | null }) {
  const baris = useBarisKonteks(lngLat)
  if (!baris.length) return null
  return (
    <div className="border-t border-line pt-4">
      <JudulBagian>Konteks lokasi</JudulBagian>
      <div className="mt-2">
        <DaftarKonteks baris={baris} laju={laju} />
      </div>
    </div>
  )
}

/** Rincian sumber data, batasan, dan prinsip. */
export function IsiSumber({ L }: { L: Laporan }) {
  const { k, meta, periode, titik, bacaan, selection, lebarBlok } = L
  if (!k) return null
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
        <dt className="text-ink-3">Data</dt>
        <dd>{meta?.judul ?? '-'}</dd>
        {periode && (
          <>
            <dt className="text-ink-3">Periode</dt>
            <dd>{periode}</dd>
          </>
        )}
        <dt className="text-ink-3">Piksel dipakai</dt>
        <dd className="tnum">{titik && bacaan ? `${fmt(k.nPiksel)} dari ${fmt(bacaan.nBlok)} di blok` : fmt(k.nPiksel)}</dd>
        {k.koherensi != null && (
          <>
            <dt className="text-ink-3">Koherensi</dt>
            <dd className="tnum">{fmt(k.koherensi, 2)}</dd>
          </>
        )}
        <dt className="text-ink-3">Titik</dt>
        <dd className="font-mono text-[11.5px]">{fmtKoordinat(selection.lngLat)}</dd>
      </dl>
      {meta?.metode && <p className="mt-2 leading-snug">{meta.metode}</p>}
      <ul className="mt-2 list-disc space-y-1 pl-4 leading-snug">
        {batasan(titik, lebarBlok).map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p className="mt-2 font-semibold text-ink">{PRINSIP}</p>
      <button type="button" onClick={() => navigasi('metode')} className="mt-2 font-semibold text-ink underline underline-offset-2">
        Baca metode lengkap
      </button>
    </>
  )
}

/** Panel laporan di desktop (kolom kiri di atas peta). */
export default function ReportPanel() {
  const L = useLaporan()
  if (!L) return null
  const { selection, k, kel, titik, kategori, adaData, kunci, diBanding, lebarBlok, memuatDeret, periode, judul, subjudul, rataKelurahan, meta, tenor, setTenor, banding, sibuk, pesan, unduh, salin, tambahBanding, tutup } = L

  return (
    <section className="glass pa-enter flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px]" aria-label="Laporan Ambles">
      <header className="flex items-start gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
            <MapPin size={14} aria-hidden="true" />
            Laporan Ambles
          </div>
          <h2 className="mt-1 truncate text-[22px] font-bold leading-tight tracking-tight text-ink">{judul}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{subjudul}</p>
          {k && !titik && selection.label !== `Kelurahan ${k.nama}` && <p className="truncate text-[12.5px] text-ink-3">Lokasi dipilih: {selection.label}</p>}
        </div>
        <IconButton label="Tutup laporan" onClick={tutup}>
          <X size={18} />
        </IconButton>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        {!k || !kel || !kategori ? (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-ink">
              Titik ini berada di luar {meta?.wilayah ?? 'wilayah ini'}. Pilih titik di dalam batas wilayah, cari nama kelurahan, atau ganti wilayah di bilah atas.
            </p>
            <p className="font-mono text-[12px] text-ink-3">{fmtKoordinat(selection.lngLat)}</p>
          </div>
        ) : (
          <>
            {meta?.jenis === 'demo' && (
              <Notice nada="demo">
                <strong>Data demo ilustratif.</strong> Angka di bawah belum berasal dari pengukuran dan tidak untuk dasar keputusan.
              </Notice>
            )}

            <div>
              <JudulBagian kanan={<KategoriBadge kategori={kategori} />}>{titik ? 'Status di titik ini' : 'Status kawasan'}</JudulBagian>
              {adaData ? (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[46px] font-bold leading-none tracking-tight text-ink">{fmt(Math.max(0, k.laju!), 1)}</span>
                  <span className="text-[14px] font-medium text-ink-2">± {fmt(k.sigma ?? 0, 1)} cm/tahun</span>
                </div>
              ) : (
                <p className="mt-2 text-[22px] font-bold leading-tight tracking-tight text-ink">Data tidak memadai</p>
              )}
              <p className="mt-2 text-[14px] leading-snug text-ink">{kalimatStatus(k.laju, k.sigma, kategori, titik)}</p>
              {titik && adaData && (
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
                  Dari {k.nPiksel} piksel terukur di blok sekitar {lebarBlok} m di sekitar titik
                  {k.sebaran ? `, antarpiksel ${fmt(Math.max(0, k.sebaran[0]), 1)} sampai ${fmt(Math.max(0, k.sebaran[1]), 1)} cm/tahun` : ''}. Rata-rata Kelurahan {kel.nama}: {rataKelurahan}.
                </p>
              )}
            </div>

            {adaData ? (
              <>
                <div className="border-t border-line pt-4">
                  <JudulBagian kanan={periode ? <span className="text-[12px] text-ink-3">{periode}</span> : undefined}>Riwayat</JudulBagian>
                  <div className="mt-2">{memuatDeret ? <Skeleton className="h-[132px] w-full" /> : <HistoryChart deret={k.deret} />}</div>
                </div>

                <div className="border-t border-line pt-4">
                  <JudulBagian
                    kanan={
                      <Segmented
                        label="Tenor KPR"
                        ukuran="sm"
                        nilai={tenor}
                        onUbah={setTenor}
                        opsi={TENORS.map((t) => ({ nilai: t, label: `${t} th` }))}
                      />
                    }
                  >
                    Proyeksi Tenor
                  </JudulBagian>
                  <div className="mt-3">
                    <TenorVisual laju={Math.max(0, k.laju!)} sigma={k.sigma ?? 0} tenor={tenor} />
                  </div>
                </div>
              </>
            ) : (
              <Notice>
                Riwayat dan proyeksi tidak ditampilkan karena data satelit {titik ? 'di sekitar titik ini' : 'di kawasan ini'} belum memadai.
                {titik && ` Sebagai konteks, rata-rata Kelurahan ${kel.nama}: ${rataKelurahan}. Itu rata-rata kawasan, bukan angka di titik ini.`}
              </Notice>
            )}

            <KonteksLokasi lngLat={selection.lngLat} laju={adaData ? k.laju : null} />

            <div className="border-t border-line pt-4">
              <Langkah key={`${kunci}-${kategori}`} kategori={kategori} />
            </div>

            <details className="border-t border-line pt-3 text-[13px] text-ink-2">
              <summary className="cursor-pointer select-none py-1 text-[13px] font-semibold text-ink-2 hover:text-ink">Sumber data dan batasan</summary>
              <div className="mt-2">
                <IsiSumber L={L} />
              </div>
            </details>
          </>
        )}
      </div>

      {k && (
        <footer className="border-t border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Button varian="accent" className="min-w-0 flex-1" onClick={unduh} disabled={sibuk} ikon={sibuk ? <CircleNotch size={17} className="animate-spin" /> : <DownloadSimple size={17} weight="bold" />}>
              {sibuk ? 'Menyiapkan PDF' : 'Unduh PDF'}
            </Button>
            {diBanding ? (
              <Button onClick={() => navigasi('bandingkan')} ikon={<Scales size={17} />}>
                Lihat banding
              </Button>
            ) : (
              <Button
                onClick={tambahBanding}
                disabled={banding.length >= MAKS_BANDING}
                title={banding.length >= MAKS_BANDING ? `Maksimal ${MAKS_BANDING} lokasi` : 'Tambah ke daftar banding'}
                ikon={<Scales size={17} />}
              >
                Bandingkan
              </Button>
            )}
            <IconButton label="Salin tautan laporan" varian="secondary" className="h-11 w-11" onClick={salin}>
              <LinkSimple size={18} />
            </IconButton>
          </div>
          <p className="mt-1.5 h-4 text-center text-[12px] text-ink-2" role="status">
            {pesan}
          </p>
        </footer>
      )}
    </section>
  )
}
