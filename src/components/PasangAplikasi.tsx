// Ajakan dan tombol untuk memasang SubTen sebagai aplikasi (tampil penuh tanpa bilah peramban),
// serta panduan langkah untuk iPhone dan iPad yang tidak punya dialog pasang otomatis.
import { useEffect, useRef, useState } from 'react'
import { DotsThreeVertical, DownloadSimple, Export, PlusSquare, X } from '@phosphor-icons/react'
import { useLayarKecil } from '../lib/layar'
import { ajakanDitutup, pasangAplikasi, tutupAjakan, usePasang } from '../lib/pasang'
import { useRute } from '../lib/router'
import { useApp } from '../lib/store'
import { sudahLihatTur, useTur } from '../lib/tur'
import { Button, cx, IconButton, Logo } from '../ui/primitives'

/** Jalankan pemasangan sesuai peramban: dialog bawaan, atau panduan untuk iPhone. */
function usePemasang() {
  const cara = usePasang()
  const [panduan, setPanduan] = useState(false)
  const mulai = async () => {
    if (cara === 'ios') setPanduan(true)
    else if (cara === 'dialog') {
      if (await pasangAplikasi()) tutupAjakan()
    }
  }
  return { cara, mulai, panduan, tutupPanduan: () => setPanduan(false) }
}

/** Tombol pasang untuk bilah atas desktop dan halaman Tentang kami. Tidak tampil bila tidak bisa dipasang. */
export function TombolPasang({ bentuk = 'ikon' }: { bentuk?: 'ikon' | 'tombol' }) {
  const { cara, mulai, panduan, tutupPanduan } = usePemasang()
  if (!cara) return null
  return (
    <>
      {bentuk === 'ikon' ? (
        <IconButton label="Pasang aplikasi" title="Pasang aplikasi" onClick={() => void mulai()}>
          <DownloadSimple size={18} />
        </IconButton>
      ) : (
        <Button onClick={() => void mulai()} ikon={<DownloadSimple size={17} />}>
          Pasang aplikasi
        </Button>
      )}
      {panduan && <PanduanIOS onTutup={tutupPanduan} />}
    </>
  )
}

/** Kartu ajakan di ponsel: sekali tampil setelah tur, di halaman peta, saat tidak ada laporan terbuka. */
export function AjakanPasang() {
  const kecil = useLayarKecil()
  const rute = useRute()
  const turBuka = useTur((s) => s.buka)
  const adaPilihan = useApp((s) => !!s.selection)
  const status = useApp((s) => s.status)
  const { cara, mulai, panduan, tutupPanduan } = usePemasang()
  const [siap, setSiap] = useState(false)
  const boleh = kecil && !!cara && rute.halaman === 'peta' && status === 'siap' && !turBuka && !adaPilihan && sudahLihatTur() && !ajakanDitutup()

  // muncul sebentar setelah peta tenang, tidak langsung menutupi peta
  useEffect(() => {
    if (!boleh) {
      setSiap(false)
      return
    }
    const t = window.setTimeout(() => setSiap(true), 1800)
    return () => window.clearTimeout(t)
  }, [boleh])

  if (panduan) return <PanduanIOS onTutup={tutupPanduan} />
  if (!boleh || !siap) return null
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[26] flex justify-center lg:hidden">
      <section aria-label="Pasang aplikasi" className="glass pa-enter pointer-events-auto flex w-full max-w-[520px] items-center gap-3 rounded-[20px] p-3 pr-2">
        <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-white shadow-[0_2px_8px_-2px_rgb(15_29_51/0.25)]">
          <Logo size={34} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold leading-tight text-ink">Pasang SubTen</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">Buka dari layar utama, tampil penuh tanpa bilah peramban.</span>
        </span>
        <Button ukuran="sm" varian="accent" onClick={() => void mulai()}>
          Pasang
        </Button>
        <IconButton label="Tutup ajakan pasang" onClick={tutupAjakan} className="size-9 shrink-0">
          <X size={16} />
        </IconButton>
      </section>
    </div>
  )
}

const LANGKAH_IOS = [
  { Ikon: Export, teks: 'Ketuk tombol Bagikan di bilah Safari.' },
  { Ikon: PlusSquare, teks: 'Pilih "Tambahkan ke Layar Utama".' },
  { Ikon: DotsThreeVertical, teks: 'Ketuk "Tambah". SubTen muncul di layar utama dan terbuka layar penuh.' },
]

function PanduanIOS({ onTutup }: { onTutup: () => void }) {
  const tutupRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    tutupRef.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onTutup])
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="pa-fade absolute inset-0 bg-[rgb(8_14_26/0.45)]" onClick={onTutup} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pasang-ios-judul"
        className="pa-enter absolute inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-[26px] border-t border-line bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-18px_44px_-18px_rgb(15_29_51/0.34)]"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-[13px] bg-white ring-1 ring-line">
              <Logo size={30} />
            </span>
            <h2 id="pasang-ios-judul" className="text-[17px] font-bold tracking-tight text-ink">
              Pasang SubTen di iPhone
            </h2>
          </span>
          <button ref={tutupRef} type="button" onClick={onTutup} aria-label="Tutup panduan" className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-2">
            <X size={16} weight="bold" />
          </button>
        </div>
        <ol className="mt-5 space-y-3">
          {LANGKAH_IOS.map(({ Ikon, teks }, i) => (
            <li key={teks} className="flex items-center gap-3">
              <span className="tnum grid size-7 shrink-0 place-items-center rounded-full bg-ink text-[12.5px] font-bold text-surface">{i + 1}</span>
              <span className="flex-1 text-[14px] leading-snug text-ink">{teks}</span>
              <Ikon size={22} className={cx('shrink-0 text-accent', i === 2 && 'invisible')} aria-hidden="true" />
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12.5px] text-ink-3">Pakai Safari. Peramban lain di iPhone belum bisa memasang aplikasi web.</p>
      </section>
    </div>
  )
}
