// Lembar bawah yang bisa diseret, khusus ponsel. Tiga posisi: kecil (intip), sedang, penuh.
// Seret ke bawah melewati posisi kecil, atau kibas cepat ke bawah dari posisi kecil, untuk menutup.
// Gerak memakai transform supaya halus. Isi hanya bisa digulir pada posisi penuh; di posisi lain gerak
// tegak di mana pun pada lembar menyeret lembar. Pada posisi penuh, tarik ke bawah saat isi sudah di
// puncak juga menyeret lembar turun. Gerak mendatar (mis. deret chip) dibiarkan ke peramban.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { PECAHAN_SEDANG, useTinggiLayar } from '../lib/layar'
import { cx } from '../ui/primitives'

export type PosisiLembar = 'kecil' | 'sedang' | 'penuh'

/** Jarak tepi atas lembar penuh dari atas layar: bilah atas tetap terlihat. */
export const JARAK_ATAS_LEMBAR = 72
const TRANSISI = 'transform 440ms cubic-bezier(0.32, 0.72, 0, 1)'
/** Kecepatan kibas (px/ms) yang memindahkan lembar satu posisi tanpa melihat jarak. */
const KIBAS = 0.45
const URUTAN: PosisiLembar[] = ['penuh', 'sedang', 'kecil']

interface Seret {
  x0: number
  y0: number
  awal: number
  mode: 'tunggu' | 'seret' | 'lepas'
  diGulir: boolean
  jejak: { y: number; t: number }[]
  kini: number
}

export interface AksiLembar {
  posisi: PosisiLembar
  ke: (p: PosisiLembar) => void
  tutup: () => void
  /** Pegangan: ketuk untuk berganti posisi. */
  pegangan: ReactNode
}

interface Props {
  label: string
  posisi: PosisiLembar
  onPosisi: (p: PosisiLembar) => void
  onTutup: () => void
  gulirRef: RefObject<HTMLDivElement | null>
  /** Elemen di dalam kepala yang menjadi batas bawah posisi kecil. Tanpa ini: seluruh kepala. */
  intipRef?: RefObject<HTMLElement | null>
  kepala: (a: AksiLembar) => ReactNode
  children: ReactNode
  /** Elemen melayang tepat di atas lembar dan ikut bergerak (mis. pesan singkat). */
  melayang?: ReactNode
}

export default function LembarBawah({ label, posisi, onPosisi, onTutup, gulirRef, intipRef, kepala, children, melayang }: Props) {
  const tinggiLayar = useTinggiLayar()
  const akar = useRef<HTMLElement>(null)
  const kepalaRef = useRef<HTMLDivElement>(null)
  const amanRef = useRef<HTMLDivElement>(null)
  const [tinggiIntip, setTinggiIntip] = useState(190)
  const [aman, setAman] = useState(0)
  const [geser, setGeser] = useState<number | null>(null)
  const [tampil, setTampil] = useState(false)
  const [keluar, setKeluar] = useState(false)
  const seret = useRef<Seret | null>(null)
  const baruSeret = useRef(0)
  const timerTutup = useRef(0)

  const tinggiPenuh = Math.max(320, tinggiLayar - JARAK_ATAS_LEMBAR)
  const kecil = Math.min(tinggiIntip + aman, tinggiPenuh)
  const terlihat: Record<PosisiLembar, number> = {
    kecil,
    sedang: Math.min(tinggiPenuh, Math.max(Math.round(tinggiLayar * PECAHAN_SEDANG), kecil + 140)),
    penuh: tinggiPenuh,
  }
  const offset = (p: PosisiLembar) => tinggiPenuh - terlihat[p]
  const y = keluar || !tampil ? tinggiPenuh + 32 : (geser ?? offset(posisi))

  const tutup = () => {
    if (keluar) return
    setKeluar(true)
    timerTutup.current = window.setTimeout(onTutup, 280)
  }
  const ke = (p: PosisiLembar) => onPosisi(p)

  // Nilai terbaru untuk pendengar sentuh asli (dipasang sekali).
  const kini = useRef({ posisi, y, offset, ke, tutup })
  useLayoutEffect(() => {
    kini.current = { posisi, y, offset, ke, tutup }
  })

  // Ukur batas posisi kecil dan area aman bawah (garis gestur iPhone).
  useLayoutEffect(() => {
    const k = kepalaRef.current
    if (!k) return
    const ukur = () => {
      const batas = intipRef?.current
      setTinggiIntip(batas ? batas.offsetTop + batas.offsetHeight + 16 : k.offsetHeight)
      setAman(amanRef.current?.offsetHeight ?? 0)
    }
    ukur()
    const ro = new ResizeObserver(ukur)
    ro.observe(k)
    return () => ro.disconnect()
  }, [intipRef])

  // Animasi masuk: mulai di bawah layar, lalu naik ke posisinya.
  useEffect(() => {
    let r2 = 0
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setTampil(true))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
      window.clearTimeout(timerTutup.current)
    }
  }, [])

  // Isi kembali ke atas saat lembar dikecilkan.
  useEffect(() => {
    if (posisi !== 'penuh') gulirRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [posisi, gulirRef])

  const mulaiSeret = (x: number, yy: number, t: number, target: EventTarget | null) => {
    seret.current = {
      x0: x,
      y0: yy,
      awal: kini.current.y,
      mode: 'tunggu',
      diGulir: !!(target instanceof Node && gulirRef.current?.contains(target)),
      jejak: [{ y: yy, t }],
      kini: kini.current.y,
    }
  }

  /** true bila gerak ini menyeret lembar (gulir bawaan peramban harus dicegah). */
  const gerakSeret = (x: number, yy: number, t: number): boolean => {
    const s = seret.current
    if (!s || s.mode === 'lepas') return false
    const dy = yy - s.y0
    const dx = x - s.x0
    if (s.mode === 'tunggu') {
      if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return false
      if (Math.abs(dx) > Math.abs(dy)) {
        s.mode = 'lepas'
        return false
      }
      const g = gulirRef.current
      if (s.diGulir && kini.current.posisi === 'penuh' && g && (dy < 0 || g.scrollTop > 1)) {
        s.mode = 'lepas'
        return false
      }
      s.mode = 'seret'
    }
    let o = s.awal + dy
    // melewati posisi penuh: terasa seperti karet, tidak ikut jari sepenuhnya
    if (o < 0) o = -Math.sqrt(-o) * 3
    s.kini = o
    s.jejak.push({ y: yy, t })
    if (s.jejak.length > 8) s.jejak.shift()
    setGeser(o)
    return true
  }

  const selesaiSeret = () => {
    const s = seret.current
    seret.current = null
    if (!s || s.mode !== 'seret') return
    baruSeret.current = performance.now()
    const akhir = s.jejak[s.jejak.length - 1]!
    const mula = s.jejak.find((j) => akhir.t - j.t <= 100) ?? akhir
    const v = akhir.t > mula.t ? (akhir.y - mula.y) / (akhir.t - mula.t) : 0
    const { offset: off, ke: pindah, tutup: tutupLembar } = kini.current
    const o = s.kini
    const daftar = URUTAN.map((p) => ({ p, o: off(p) }))
    let tujuan: PosisiLembar | 'tutup'
    if (v > KIBAS) tujuan = daftar.find((d) => d.o > o + 8)?.p ?? 'tutup'
    else if (v < -KIBAS) tujuan = [...daftar].reverse().find((d) => d.o < o - 8)?.p ?? 'penuh'
    else if (o > off('kecil') + 64) tujuan = 'tutup'
    else tujuan = daftar.reduce((m, d) => (Math.abs(d.o - o) < Math.abs(m.o - o) ? d : m)).p
    setGeser(null)
    if (tujuan === 'tutup') tutupLembar()
    else pindah(tujuan)
  }

  // Sentuh: pendengar asli supaya touchmove bisa dicegah (React memasangnya pasif).
  useEffect(() => {
    const el = akar.current
    if (!el) return
    const mulai = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length !== 1 || !t) {
        seret.current = null
        return
      }
      mulaiSeret(t.clientX, t.clientY, e.timeStamp, e.target)
    }
    const gerak = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t && gerakSeret(t.clientX, t.clientY, e.timeStamp) && e.cancelable) e.preventDefault()
    }
    const akhir = () => selesaiSeret()
    el.addEventListener('touchstart', mulai, { passive: true })
    el.addEventListener('touchmove', gerak, { passive: false })
    el.addEventListener('touchend', akhir)
    el.addEventListener('touchcancel', akhir)
    return () => {
      el.removeEventListener('touchstart', mulai)
      el.removeEventListener('touchmove', gerak)
      el.removeEventListener('touchend', akhir)
      el.removeEventListener('touchcancel', akhir)
    }
    // fungsi di atas membaca keadaan terbaru lewat ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tetikus (pratinjau di desktop dengan jendela sempit): seret dari kepala.
  const tekanTetikus = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    mulaiSeret(e.clientX, e.clientY, e.timeStamp, e.target)
    const gerak = (ev: PointerEvent) => {
      gerakSeret(ev.clientX, ev.clientY, ev.timeStamp)
    }
    const lepas = () => {
      window.removeEventListener('pointermove', gerak)
      window.removeEventListener('pointerup', lepas)
      selesaiSeret()
    }
    window.addEventListener('pointermove', gerak)
    window.addEventListener('pointerup', lepas)
  }

  const pegangan = (
    <button
      type="button"
      onClick={() => ke(posisi === 'kecil' ? 'sedang' : posisi === 'sedang' ? 'penuh' : 'sedang')}
      aria-label={posisi === 'penuh' ? 'Kecilkan laporan' : 'Perbesar laporan'}
      className="flex h-6 w-full items-center justify-center"
    >
      <span className="h-[5px] w-10 rounded-full bg-line-2" />
    </button>
  )

  return (
    <section
      ref={akar}
      aria-label={label}
      className="absolute inset-x-0 bottom-0 z-[27] mx-auto flex max-w-[640px] flex-col rounded-t-[26px] border-t border-line bg-surface shadow-[0_-18px_44px_-18px_rgb(22_22_29/0.34)]"
      style={{ height: tinggiPenuh, transform: `translate3d(0, ${y}px, 0)`, transition: geser == null ? TRANSISI : 'none', willChange: 'transform' }}
      onClickCapture={(e) => {
        // ketukan yang mengakhiri seretan bukan klik
        if (performance.now() - baruSeret.current < 320) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') tutup()
      }}
    >
      {melayang && <div className="pointer-events-none absolute inset-x-0 -top-14 flex justify-center px-4">{melayang}</div>}
      <div ref={kepalaRef} className="relative shrink-0 touch-none select-none" onPointerDown={tekanTetikus}>
        {kepala({ posisi, ke, tutup, pegangan })}
      </div>
      <div
        ref={gulirRef}
        className={cx('scroll-thin relative min-h-0 flex-1 overscroll-contain', posisi === 'penuh' && geser == null ? 'overflow-y-auto' : 'overflow-hidden')}
        onWheel={(e) => {
          if (posisi !== 'penuh' && e.deltaY > 0) ke('penuh')
        }}
      >
        {children}
        <div aria-hidden="true" style={{ height: aman + 28 }} />
      </div>
      <div ref={amanRef} aria-hidden="true" className="pointer-events-none invisible absolute h-[env(safe-area-inset-bottom)] w-px" />
    </section>
  )
}
