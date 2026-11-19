// Pasang aplikasi (PWA) dan layar penuh.
// Android dan desktop (Chrome, Edge): peramban mengirim "beforeinstallprompt"; dialog pasang bawaan
// dipanggil dari tombol kita. iPhone dan iPad (Safari) tidak punya dialog: pengguna diberi panduan
// "Bagikan, lalu Tambahkan ke Layar Utama". Setelah dipasang, aplikasi terbuka tanpa bilah peramban.
import { useSyncExternalStore } from 'react'

interface PromptPasang extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let tertunda: PromptPasang | null = null
const pendengar = new Set<() => void>()
const kabari = () => pendengar.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // simpan untuk tombol kita sendiri; tanpa ini peramban menampilkan bilah pasang miliknya
    e.preventDefault()
    tertunda = e as PromptPasang
    kabari()
  })
  window.addEventListener('appinstalled', () => {
    tertunda = null
    kabari()
  })
  document.addEventListener('fullscreenchange', kabari)
}

function langganan(cb: () => void) {
  pendengar.add(cb)
  return () => pendengar.delete(cb)
}

/** Aplikasi sedang berjalan sebagai aplikasi terpasang (bukan tab peramban). */
export function terpasang(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || nav.standalone === true
}

function iOS(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export type CaraPasang = 'dialog' | 'ios' | null

function caraPasang(): CaraPasang {
  if (typeof window === 'undefined' || terpasang() || document.fullscreenElement) return null
  if (tertunda) return 'dialog'
  return iOS() ? 'ios' : null
}

/** Cara memasang yang tersedia di peramban ini, atau null bila tidak bisa atau sudah terpasang. */
export function usePasang(): CaraPasang {
  return useSyncExternalStore(langganan, caraPasang, () => null)
}

/** Buka dialog pasang bawaan peramban. true bila pengguna memasang. */
export async function pasangAplikasi(): Promise<boolean> {
  const p = tertunda
  if (!p) return false
  await p.prompt()
  const { outcome } = await p.userChoice
  tertunda = null
  kabari()
  return outcome === 'accepted'
}

// ---------------------------------------------------------------- ajakan sekali tampil

const KUNCI_TUTUP = 'subten.pasang.tutup'
let ditutupSesiIni = false

export function ajakanDitutup(): boolean {
  if (ditutupSesiIni) return true
  try {
    return window.localStorage.getItem(KUNCI_TUTUP) === '1'
  } catch {
    return false
  }
}

export function tutupAjakan(): void {
  ditutupSesiIni = true
  try {
    window.localStorage.setItem(KUNCI_TUTUP, '1')
  } catch {
    /* penyimpanan tidak tersedia: cukup untuk sesi ini */
  }
  kabari()
}
