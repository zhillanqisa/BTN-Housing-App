// Shell aplikasi: peta selalu terpasang di belakang; halaman lain menutupinya.
// Sinkron dua arah antara pilihan lokasi/tenor dan tautan (#/?ll=<lintang>,<bujur>&t=<tenor>).
// Tautan lama #/?k=<id kelurahan> tetap dibaca dan diarahkan ke pusat kelurahan itu.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowClockwise, FileText, ListChecks, MagnifyingGlass } from '@phosphor-icons/react'
import MapChrome from './components/MapChrome'
import MapView from './components/MapView'
import ReportPanel from './components/ReportPanel'
import SearchBox from './components/SearchBox'
import Sorotan from './components/Sorotan'
import TopBar from './components/TopBar'
import { DEFAULT_TENOR, TENORS } from './lib/config'
import { kunciTitik, LABEL_TITIK } from './lib/lokasi'
import { navigasi, useRute } from './lib/router'
import { useApp } from './lib/store'
import type { Position, Tenor } from './lib/types'
import { Button, cx, Notice, Panel, Skeleton } from './ui/primitives'

const DashboardView = lazy(() => import('./views/DashboardView'))
const CompareView = lazy(() => import('./views/CompareView'))
const MethodView = lazy(() => import('./views/MethodView'))

function Intro() {
  const status = useApp((s) => s.status)
  const galat = useApp((s) => s.galat)
  const jenis = useApp((s) => s.meta?.jenis)
  const titik = useApp((s) => !!s.grid)
  const muatDemo = useApp((s) => s.muatDemo)
  return (
    <Panel className="pa-enter p-5">
      <h1 className="text-[27px] font-bold leading-[1.12] tracking-tight text-ink">Cek tanah sebelum KPR</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        Pilih lokasi rumah incaran. Lihat laju penurunan tanah {titik ? 'di sekitar titik itu' : 'kawasannya'} dan proyeksinya selama masa cicilan.
      </p>
      {status === 'memuat' && <Skeleton className="mt-4 h-24 w-full" />}
      {status === 'gagal' && (
        <div className="mt-4 space-y-2">
          <Notice>Data kawasan gagal dimuat. {galat}</Notice>
          <Button ukuran="sm" onClick={() => void muatDemo()} ikon={<ArrowClockwise size={16} />}>
            Muat ulang data
          </Button>
        </div>
      )}
      {status === 'siap' && (
        <ol className="mt-4 space-y-2.5 text-[13.5px] text-ink">
          <li className="flex items-center gap-3">
            <MagnifyingGlass size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
            Cari alamat, atau klik titik mana pun di peta.
          </li>
          <li className="flex items-center gap-3">
            <FileText size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
            Baca Laporan Ambles untuk {titik ? 'titik' : 'kawasan'} itu.
          </li>
          <li className="flex items-center gap-3">
            <ListChecks size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
            Ikuti langkah berikutnya sebelum akad.
          </li>
        </ol>
      )}
      {jenis === 'demo' && (
        <Notice nada="demo" className="mt-4">
          <strong>Data demo ilustratif.</strong> Angka di peta belum berasal dari pengukuran.{' '}
          <button type="button" onClick={() => navigasi('metode')} className="font-semibold underline underline-offset-2">
            Selengkapnya
          </button>
        </Notice>
      )}
    </Panel>
  )
}

function LapisanPeta() {
  const selection = useApp((s) => s.selection)
  const [lebar, setLebar] = useState(true)
  return (
    <>
      <div className="absolute inset-x-3 top-[76px] z-[11] lg:inset-x-auto lg:left-4 lg:top-[88px] lg:w-[408px]">
        <SearchBox />
      </div>

      {selection ? (
        <aside
          className={cx(
            // z-[12] di mobile: lembar laporan berada di atas tombol kontrol peta
            'absolute inset-x-0 bottom-0 z-[12] flex flex-col transition-[max-height] duration-300',
            lebar ? 'max-h-[58dvh]' : 'max-h-[204px]',
            'lg:inset-x-auto lg:bottom-4 lg:left-4 lg:top-[156px] lg:z-10 lg:max-h-none lg:w-[408px]',
          )}
        >
          <ReportPanel
            pegangan={
              <button
                type="button"
                onClick={() => setLebar((v) => !v)}
                aria-label={lebar ? 'Kecilkan laporan' : 'Buka laporan penuh'}
                className="mx-auto mt-1.5 grid h-5 w-20 shrink-0 place-items-center lg:hidden"
              >
                <span className="h-1 w-10 rounded-full bg-line-2" />
              </button>
            }
          />
        </aside>
      ) : (
        <>
          <div className="absolute left-4 top-[156px] z-10 hidden w-[408px] lg:block">
            <Intro />
          </div>
          <Sorotan />
        </>
      )}
      <MapChrome />
    </>
  )
}

export default function App() {
  const rute = useRute()
  const halaman = rute.halaman
  const status = useApp((s) => s.status)
  const selection = useApp((s) => s.selection)
  const tenor = useApp((s) => s.tenor)
  const adaGrid = useApp((s) => !!s.grid)
  const sudahBaca = useRef(false)

  useEffect(() => {
    void useApp.getState().muatDemo()
  }, [])

  // tautan -> state
  useEffect(() => {
    if (status !== 'siap' || halaman !== 'peta') return
    const s = useApp.getState()
    const k = rute.params.get('k')
    const ll = rute.params.get('ll')
    const bacaTenor = () => {
      const t = Number(rute.params.get('t'))
      if ((TENORS as number[]).includes(t)) s.setTenor(t as Tenor)
    }
    if (!sudahBaca.current) {
      sudahBaca.current = true
      bacaTenor()
    }
    if (k) {
      if (k !== s.selection?.kawasanId) s.pilihKawasan(k, 'tautan')
    } else if (ll) {
      const [lat, lon] = ll.split(',').map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const titik: Position = [lon!, lat!]
        // Juga berlaku untuk tautan yang ditempel saat aplikasi sudah terbuka. Bila titiknya sama
        // dengan pilihan sekarang, tautan itu tulisan aplikasi sendiri dan tidak perlu dibaca lagi.
        if (!s.selection || kunciTitik(s.selection.lngLat) !== kunciTitik(titik)) {
          // n = nama lokasi dari tautan; hanya ditampilkan sebagai teks
          const nama = rute.params.get('n')?.slice(0, 60)
          s.pilihTitik(titik, 'tautan', nama || undefined)
          bacaTenor()
        }
      }
    }
  }, [rute, status, halaman])

  // state -> tautan
  useEffect(() => {
    if (status !== 'siap' || halaman !== 'peta' || !sudahBaca.current) return
    const s = useApp.getState()
    const sel = s.selection
    // dengan grid, laporan bergantung pada titiknya, jadi tautan menyimpan koordinat
    const pakaiTitik = !!sel && (adaGrid || !sel.kawasanId)
    navigasi(
      'peta',
      {
        k: sel && !pakaiTitik ? sel.kawasanId : null,
        ll: sel && pakaiTitik ? `${sel.lngLat[1].toFixed(5)},${sel.lngLat[0].toFixed(5)}` : null,
        n: sel && pakaiTitik && sel.label !== LABEL_TITIK ? sel.label.slice(0, 60) : null,
        t: s.tenor !== DEFAULT_TENOR ? s.tenor : null,
      },
      true,
    )
  }, [selection, tenor, status, halaman, adaGrid])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-ink">
      <MapView aktif={halaman === 'peta'} />
      {halaman === 'peta' ? (
        <LapisanPeta />
      ) : (
        <main className="scroll-thin absolute inset-0 z-20 overflow-y-auto bg-bg pt-[88px]">
          <Suspense
            fallback={
              <div className="mx-auto w-full max-w-[1240px] px-4 md:px-8">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="mt-6 h-64 w-full" />
              </div>
            }
          >
            {halaman === 'dashboard' ? <DashboardView /> : halaman === 'bandingkan' ? <CompareView /> : <MethodView />}
          </Suspense>
        </main>
      )}
      <TopBar halaman={halaman} />
    </div>
  )
}
