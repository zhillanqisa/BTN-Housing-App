// Tur aplikasi untuk kunjungan pertama: satu bagian layar disorot, kartu penjelasan di dekatnya.
// Bagian terpenting adalah laporan: tur membuka satu laporan contoh lalu menjelaskan isinya.
// Langkah tanpa sasaran (sambutan, penutup) tampil sebagai kartu di tengah layar.
// Keyboard: panah kanan lanjut, panah kiri kembali, Escape menutup.
// Sasaran ditandai atribut data-tur di komponen; yang tidak terlihat dilewati otomatis.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { ArrowLeft, ArrowRight, ChartLineDown, FilePdf, MapPin, X } from '@phosphor-icons/react'
import { sorotanWilayah } from '../lib/gazetteer'
import { useRute } from '../lib/router'
import { useApp } from '../lib/store'
import { sudahLihatTur, useTur } from '../lib/tur'
import { Button, cx, Logo, Wordmark } from '../ui/primitives'

interface Langkah {
  sasaran?: string
  judul: string
  isi: ReactNode
  /** dijalankan saat langkah dibuka: buka laporan contoh atau tutup laporan */
  masuk?: () => void
  /** gulir sasaran ke dalam pandangan (bagian laporan yang panjang) */
  gulir?: boolean
}

function tutupLaporan(): void {
  const s = useApp.getState()
  if (s.selection) s.tutupLaporan()
}

/** Buka satu laporan contoh di wilayah aktif (sekali saja; langkah berikutnya memakai laporan yang sama). */
function bukaLaporanContoh(): void {
  const s = useApp.getState()
  if (s.selection?.asal === 'sorotan') return
  const daftar = sorotanWilayah(s.wilayah)
  const t = daftar[1] ?? daftar[0]
  if (t) s.pilihTitik(t.lngLat, 'sorotan', t.label)
}

const LANGKAH: Langkah[] = [
  { judul: 'Cek tanah sebelum KPR', isi: null },
  {
    sasaran: 'wilayah',
    judul: 'Pilih wilayah pesisir',
    isi: 'Semarang, Jakarta, dan Pekalongan sudah diolah dari data satelit. Kabupaten Demak menyusul.',
    masuk: tutupLaporan,
  },
  {
    sasaran: 'cari',
    judul: 'Cari rumah incaran',
    isi: 'Ketik alamat, nama perumahan, atau kelurahan. Bisa juga langsung ketuk titiknya di peta.',
    masuk: tutupLaporan,
  },
  {
    sasaran: 'legenda',
    judul: 'Baca warna peta',
    isi: 'Ungu makin pekat berarti tanah makin cepat turun. Di sini juga ada lapis zona RDTR, geologi, dan bahaya banjir.',
    masuk: tutupLaporan,
  },
  {
    sasaran: 'contoh',
    judul: 'Buka laporan sebuah titik',
    isi: 'Setiap titik yang dipilih menghasilkan Laporan Ambles. Kita buka satu lokasi contoh untuk melihat isinya.',
    masuk: tutupLaporan,
  },
  {
    sasaran: 'lap-status',
    judul: 'Angka utama: laju turun',
    isi: 'Berapa sentimeter tanah turun per tahun di blok sekitar 240 m di titik itu, beserta kategorinya. Angka ± adalah ketidakpastian ukurnya.',
    // kartu status selalu di atas laporan yang baru dibuka: tidak perlu digulir
    masuk: bukaLaporanContoh,
  },
  {
    sasaran: 'lap-riwayat',
    judul: 'Riwayat sejak 2020',
    isi: 'Perpindahan tanah yang diukur satelit Sentinel-1 dari waktu ke waktu. Garis yang terus menurun berarti tanahnya terus turun, bukan sekali lalu berhenti.',
    masuk: bukaLaporanContoh,
    gulir: true,
  },
  {
    sasaran: 'lap-proyeksi',
    judul: 'Proyeksi selama tenor',
    isi: 'Pilih tenor 10, 15, atau 20 tahun untuk melihat perkiraan turunnya tanah sampai cicilan lunas, digambarkan terhadap tinggi rumah.',
    masuk: bukaLaporanContoh,
    gulir: true,
  },
  {
    sasaran: 'lap-konteks',
    judul: 'Konteks lokasi',
    isi: 'Zona tata ruang, jenis batuan, dan bahaya banjir di titik itu, lengkap dengan artinya bagi pembeli rumah dan yang perlu ditanyakan ke penjual.',
    masuk: bukaLaporanContoh,
    gulir: true,
  },
  {
    sasaran: 'lap-aksi',
    judul: 'Bawa laporannya',
    isi: 'Unduh PDF untuk dibawa ke pengembang, bank, atau saat akad. Tambahkan ke Bandingkan untuk menimbang beberapa rumah sekaligus.',
    masuk: bukaLaporanContoh,
    gulir: true,
  },
  {
    sasaran: 'nav',
    judul: 'Halaman lain',
    isi: 'Bandingkan rumah, lihat ringkasan kawasan, pelajari metodenya, atau buka Tentang kami untuk bekerja sama dengan tim.',
    masuk: tutupLaporan,
  },
  { judul: 'Siap mencoba?', isi: 'Cari alamat rumah incaran Anda, atau ketuk titiknya di peta. Tur ini bisa dibuka lagi lewat tombol tanda tanya di bilah atas.' },
]

const ALUR: { Ikon: typeof MapPin; judul: string; isi: string }[] = [
  { Ikon: MapPin, judul: 'Pilih titik', isi: 'Rumah incaran di peta' },
  { Ikon: ChartLineDown, judul: 'Baca laporan', isi: 'Laju, riwayat, proyeksi' },
  { Ikon: FilePdf, judul: 'Bawa ke akad', isi: 'Unduh PDF, bandingkan' },
]

function cariSasaran(nama: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tur="${nama}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** Langkah berikutnya (arah +1) atau sebelumnya (-1) yang bisa ditampilkan. Langkah yang membuka
 *  atau menutup laporan selalu bisa: sasarannya baru muncul setelah langkah itu dibuka. */
function langkahBerikut(dari: number, arah: 1 | -1): number {
  for (let i = dari + arah; i >= 0 && i < LANGKAH.length; i += arah) {
    const l = LANGKAH[i]!
    if (!l.sasaran || l.masuk || cariSasaran(l.sasaran)) return i
  }
  return -1
}

interface Kotak {
  x: number
  y: number
  w: number
  h: number
}

const JARAK = 8
const CELAH = 14

export default function TurAplikasi() {
  const buka = useTur((s) => s.buka)
  const status = useApp((s) => s.status)
  const rute = useRute()

  // Mulai otomatis sekali: kunjungan pertama, di peta, setelah data siap. Tautan yang membawa titik
  // (laporan yang dibagikan) tidak diganggu tur.
  useEffect(() => {
    if (buka || status !== 'siap' || rute.halaman !== 'peta' || sudahLihatTur()) return
    if (rute.params.get('ll') || rute.params.get('k')) return
    const t = window.setTimeout(() => {
      if (!sudahLihatTur() && !useApp.getState().selection) useTur.setState({ buka: true, langkah: 0 })
    }, 900)
    return () => window.clearTimeout(t)
  }, [buka, status, rute])

  return buka ? <Lapisan /> : null
}

function Lapisan() {
  const langkah = useTur((s) => s.langkah)
  const ke = useTur((s) => s.ke)
  const tutup = useTur((s) => s.tutup)
  const [kotak, setKotak] = useState<Kotak | null>(null)
  const [layar, setLayar] = useState({ w: window.innerWidth, h: window.innerHeight })
  const kartu = useRef<HTMLDivElement>(null)
  const utama = useRef<HTMLButtonElement>(null)
  const l = LANGKAH[langkah]!
  const pertama = langkah === 0
  const akhir = langkah === LANGKAH.length - 1
  const jumlah = LANGKAH.length - 2

  const ukur = useCallback(() => {
    setLayar({ w: window.innerWidth, h: window.innerHeight })
    const el = l.sasaran ? cariSasaran(l.sasaran) : null
    if (!el) {
      setKotak(null)
      return
    }
    const r = el.getBoundingClientRect()
    setKotak({ x: r.left - JARAK, y: r.top - JARAK, w: r.width + JARAK * 2, h: r.height + JARAK * 2 })
  }, [l])

  useLayoutEffect(() => {
    ukur()
    // Laporan butuh waktu untuk tampil dan lembarnya bergerak: gulir sasaran ke pandangan, lalu ukur lagi.
    const t = [
      window.setTimeout(() => {
        if (l.gulir && l.sasaran) cariSasaran(l.sasaran)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        ukur()
      }, 260),
      window.setTimeout(ukur, 650),
      window.setTimeout(ukur, 1100),
    ]
    window.addEventListener('resize', ukur)
    return () => {
      t.forEach(window.clearTimeout)
      window.removeEventListener('resize', ukur)
    }
  }, [ukur, l])

  const pindah = useCallback(
    (arah: 1 | -1) => {
      const i = langkahBerikut(langkah, arah)
      if (i < 0) {
        if (arah === 1) tutup()
        return
      }
      LANGKAH[i]!.masuk?.()
      ke(i)
    },
    [langkah, ke, tutup],
  )
  const lanjut = useCallback(() => pindah(1), [pindah])
  const kembali = useCallback(() => pindah(-1), [pindah])

  useEffect(() => {
    utama.current?.focus({ preventScroll: true })
  }, [langkah])

  useEffect(() => {
    const tombol = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutup()
      else if (e.key === 'ArrowRight') lanjut()
      else if (e.key === 'ArrowLeft') kembali()
      else if (e.key === 'Tab' && kartu.current) {
        // fokus tetap di dalam kartu
        const fokus = [...kartu.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (!fokus.length) return
        const i = fokus.indexOf(document.activeElement as HTMLElement)
        const j = e.shiftKey ? (i <= 0 ? fokus.length - 1 : i - 1) : i >= fokus.length - 1 ? 0 : i + 1
        e.preventDefault()
        fokus[j]!.focus()
      }
    }
    window.addEventListener('keydown', tombol)
    return () => window.removeEventListener('keydown', tombol)
  }, [lanjut, kembali, tutup])

  // Posisi kartu. Desktop, sasaran di panel laporan kiri: di samping kanannya supaya laporan tetap
  // terbaca. Selain itu: di bawah sasaran bila sasaran di separuh atas layar, di atasnya bila tidak.
  const lebar = Math.min(pertama ? 440 : 360, layar.w - 32)
  let gaya: CSSProperties
  if (!kotak) {
    // dipusatkan lewat wadah flex, bukan transform: animasi masuk memakai transform
    gaya = { width: lebar }
  } else if (layar.w >= 1024 && kotak.x + kotak.w < layar.w * 0.45 && kotak.x + kotak.w + CELAH + lebar + 16 <= layar.w && kotak.h > 60) {
    gaya = { left: kotak.x + kotak.w + CELAH, top: Math.min(Math.max(16, kotak.y), layar.h - 280), width: lebar }
  } else {
    const kiri = Math.min(Math.max(16, kotak.x + kotak.w / 2 - lebar / 2), layar.w - lebar - 16)
    const diAtas = kotak.y + kotak.h / 2 > layar.h / 2
    gaya = diAtas ? { left: kiri, bottom: Math.min(layar.h - kotak.y + CELAH, layar.h - 200), width: lebar } : { left: kiri, top: kotak.y + kotak.h + CELAH, width: lebar }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* peredup dengan lubang di sasaran; tanpa sasaran, seluruh layar diredupkan */}
      {kotak ? (
        <div aria-hidden="true" className="pa-tur-sorot pointer-events-none fixed rounded-[18px]" style={{ left: kotak.x, top: kotak.y, width: kotak.w, height: kotak.h }} />
      ) : (
        <div aria-hidden="true" className="pa-fade fixed inset-0 bg-[rgb(8_8_14/0.62)] backdrop-blur-[2px]" />
      )}
      {/* penahan klik: selama tur, peta dan tombol di belakang tidak bisa disentuh */}
      <div className="fixed inset-0" />

      <div className={kotak ? 'contents' : 'fixed inset-0 flex items-center justify-center overflow-y-auto p-4'}>
        <div
          ref={kartu}
          key={langkah}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tur-judul"
          aria-describedby="tur-isi"
          className={cx('pa-enter rounded-[22px] border border-line bg-surface p-5 shadow-[0_24px_64px_-20px_rgb(0_0_0/0.55)]', kotak ? 'fixed' : 'relative my-auto')}
          style={gaya}
        >
          {pertama ? (
            <Sambutan onMulai={lanjut} onLewati={tutup} tombolUtama={utama} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                {akhir ? (
                  <span className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-3">Tur selesai</span>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1" aria-hidden="true">
                      {Array.from({ length: jumlah }, (_, i) => (
                        <span key={i} className={cx('h-1.5 rounded-full transition-all duration-300', i + 1 === langkah ? 'w-5 bg-ink' : i + 1 < langkah ? 'w-1.5 bg-ink-3' : 'w-1.5 bg-line-2')} />
                      ))}
                    </div>
                    <span className="tnum text-[11.5px] font-semibold text-ink-3" aria-live="polite">
                      {langkah} dari {jumlah}
                    </span>
                  </div>
                )}
                <button type="button" onClick={tutup} aria-label="Tutup tur" className="-mr-1.5 grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X size={15} weight="bold" />
                </button>
              </div>
              <h2 id="tur-judul" className="mt-2.5 text-[18px] font-bold leading-snug tracking-tight text-ink">
                {l.judul}
              </h2>
              <p id="tur-isi" className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
                {l.isi}
              </p>
              {akhir ? (
                <div className="mt-4 flex justify-end">
                  <button ref={utama} type="button" onClick={tutup} className="inline-flex h-9 items-center gap-2 rounded-[12px] bg-accent px-3.5 text-[13px] font-bold text-accent-ink hover:brightness-95">
                    Mulai cek lokasi <ArrowRight size={15} weight="bold" />
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button ukuran="sm" varian="ghost" onClick={kembali} ikon={<ArrowLeft size={15} />}>
                    Kembali
                  </Button>
                  <button ref={utama} type="button" onClick={lanjut} className="inline-flex h-9 items-center gap-2 rounded-[12px] bg-ink px-3.5 text-[13px] font-semibold text-surface hover:opacity-90">
                    Lanjut <ArrowRight size={15} weight="bold" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Sambutan({ onMulai, onLewati, tombolUtama }: { onMulai: () => void; onLewati: () => void; tombolUtama: RefObject<HTMLButtonElement | null> }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Logo size={34} />
          <Wordmark className="text-[18px]" />
        </span>
        <button type="button" onClick={onLewati} aria-label="Lewati tur" className="-mr-1.5 grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={15} weight="bold" />
        </button>
      </div>
      <h2 id="tur-judul" className="mt-4 text-[26px] font-bold leading-[1.1] tracking-tight text-ink">
        Cek tanah sebelum KPR
      </h2>
      <p id="tur-isi" className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
        Di pesisir utara Jawa, tanah bisa turun beberapa sentimeter setiap tahun, padahal cicilan berjalan belasan tahun. SubTen membaca laju itu di titik rumah incaran dari radar satelit Sentinel-1.
      </p>
      <ol className="mt-5 grid grid-cols-3 gap-2">
        {ALUR.map(({ Ikon, judul, isi }, i) => (
          <li key={judul} className="relative rounded-[14px] bg-surface-2 p-3">
            <span className="tnum absolute right-2.5 top-2 text-[11px] font-bold text-ink-3">{i + 1}</span>
            <Ikon size={20} weight="duotone" className="text-data" aria-hidden="true" />
            <span className="mt-2 block text-[13px] font-bold leading-tight text-ink">{judul}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{isi}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button ukuran="sm" varian="ghost" onClick={onLewati}>
          Lewati
        </Button>
        <button ref={tombolUtama} type="button" onClick={onMulai} className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-ink px-4 text-[13.5px] font-semibold text-surface hover:opacity-90">
          Mulai tur singkat <ArrowRight size={15} weight="bold" />
        </button>
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">Sekitar satu menit, termasuk contoh laporan. Bisa dibuka lagi dari tombol tanda tanya di bilah atas.</p>
    </>
  )
}
