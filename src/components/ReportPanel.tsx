// Laporan Ambles: satu halaman per lokasi.
// Status kawasan -> Riwayat -> Proyeksi Tenor -> Langkah berikutnya -> Sumber dan batasan.
import { useState, type ReactNode } from 'react'
import { CircleNotch, DownloadSimple, LinkSimple, MapPin, Scales, X } from '@phosphor-icons/react'
import { BATASAN, MAKS_BANDING, PRINSIP, TENORS } from '../lib/config'
import { fmt, fmtKoordinat, fmtPeriode } from '../lib/format'
import { kalimatStatus, klasifikasi, langkahBerikutnya } from '../lib/risk'
import { navigasi } from '../lib/router'
import { jembatanPeta, useApp, useKawasan } from '../lib/store'
import type { Kategori } from '../lib/types'
import { Button, IconButton, JudulBagian, KategoriBadge, Notice, Segmented } from '../ui/primitives'
import HistoryChart from './HistoryChart'
import TenorVisual from './TenorVisual'

function Langkah({ kategori }: { kategori: Kategori }) {
  const { judul, butir } = langkahBerikutnya(kategori)
  const [centang, setCentang] = useState<Set<number>>(new Set())
  return (
    <div>
      <JudulBagian>Langkah berikutnya</JudulBagian>
      <p className="mt-2 text-[15px] font-bold text-ink">{judul}</p>
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

export default function ReportPanel({ pegangan }: { pegangan?: ReactNode }) {
  const selection = useApp((s) => s.selection)
  const k = useKawasan(selection?.kawasanId)
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
  const kategori = k ? klasifikasi(k.laju, k.memadai, thresholds) : null
  const adaData = !!k && k.memadai && k.laju != null
  const diBanding = !!k && banding.includes(k.id)
  const periode = meta && meta.periode[0] && meta.periode[1] ? `${fmtPeriode(meta.periode[0])} sampai ${fmtPeriode(meta.periode[1])}` : null

  const kabari = (teks: string) => {
    setPesan(teks)
    window.setTimeout(() => setPesan(null), 2600)
  }
  const unduh = async () => {
    if (!k || !kategori || !meta) return
    setSibuk(true)
    try {
      const { unduhLaporanPdf } = await import('../lib/pdf')
      await unduhLaporanPdf({ kawasan: k, kategori, tenor, thresholds, meta, label: selection.label, lngLat: selection.lngLat, gambarPeta: jembatanPeta.ambilGambar?.() ?? null })
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

  return (
    <section className="glass pa-enter flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[22px] lg:rounded-[22px]" aria-label="Laporan Ambles">
      {pegangan}
      <header className="flex items-start gap-3 px-5 pb-3 pt-3 lg:pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-3">
            <MapPin size={14} aria-hidden="true" />
            Laporan Ambles
          </div>
          <h2 className="mt-1 truncate text-[22px] font-bold leading-tight tracking-tight text-ink">{k ? `Kelurahan ${k.nama}` : selection.label}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{k ? `Kecamatan ${k.kecamatan}, Kota Semarang` : 'Di luar wilayah uji'}</p>
          {k && selection.label !== `Kelurahan ${k.nama}` && <p className="truncate text-[12.5px] text-ink-3">Lokasi dipilih: {selection.label}</p>}
        </div>
        <IconButton label="Tutup laporan" onClick={tutup}>
          <X size={18} />
        </IconButton>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        {!k || !kategori ? (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-ink">
              Titik ini berada di luar Kota Semarang, wilayah uji awal PANTAU AMBLES. Pilih titik di dalam batas kota atau cari nama kelurahan.
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
              <JudulBagian kanan={<KategoriBadge kategori={kategori} />}>Status kawasan</JudulBagian>
              {adaData ? (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[46px] font-bold leading-none tracking-tight text-ink">{fmt(k.laju!, 1)}</span>
                  <span className="text-[14px] font-medium text-ink-2">± {fmt(k.sigma ?? 0, 1)} cm/tahun</span>
                </div>
              ) : (
                <p className="mt-2 text-[22px] font-bold leading-tight tracking-tight text-ink">Data tidak memadai</p>
              )}
              <p className="mt-2 text-[14px] leading-snug text-ink">{kalimatStatus(k.laju, k.sigma, kategori)}</p>
            </div>

            {adaData ? (
              <>
                <div className="border-t border-line pt-4">
                  <JudulBagian kanan={periode ? <span className="text-[12px] text-ink-3">{periode}</span> : undefined}>Riwayat</JudulBagian>
                  <div className="mt-2">
                    <HistoryChart deret={k.deret} />
                  </div>
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
                    <TenorVisual laju={k.laju!} sigma={k.sigma ?? 0} tenor={tenor} />
                  </div>
                </div>
              </>
            ) : (
              <Notice>Riwayat dan proyeksi tidak ditampilkan karena data satelit di kawasan ini belum memadai.</Notice>
            )}

            <div className="border-t border-line pt-4">
              <Langkah key={`${k.id}-${kategori}`} kategori={kategori} />
            </div>

            <details className="border-t border-line pt-3 text-[13px] text-ink-2">
              <summary className="cursor-pointer select-none py-1 text-[13px] font-semibold text-ink-2 hover:text-ink">Sumber data dan batasan</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
                <dt className="text-ink-3">Data</dt>
                <dd>{meta?.judul ?? '-'}</dd>
                {periode && (
                  <>
                    <dt className="text-ink-3">Periode</dt>
                    <dd>{periode}</dd>
                  </>
                )}
                <dt className="text-ink-3">Piksel dipakai</dt>
                <dd className="tnum">{fmt(k.nPiksel)}</dd>
                <dt className="text-ink-3">Koherensi</dt>
                <dd className="tnum">{k.koherensi == null ? '-' : fmt(k.koherensi, 2)}</dd>
                <dt className="text-ink-3">Titik</dt>
                <dd className="font-mono text-[11.5px]">{fmtKoordinat(selection.lngLat)}</dd>
              </dl>
              {meta?.metode && <p className="mt-2 leading-snug">{meta.metode}</p>}
              <ul className="mt-2 list-disc space-y-1 pl-4 leading-snug">
                {BATASAN.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="mt-2 font-semibold text-ink">{PRINSIP}</p>
              <button type="button" onClick={() => navigasi('metode')} className="mt-2 font-semibold text-ink underline underline-offset-2">
                Baca metode lengkap
              </button>
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
                onClick={() => toggleBanding(k.id)}
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
