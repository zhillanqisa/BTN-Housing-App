// Ukuran layar untuk tata letak ponsel. Di bawah 1024 px (breakpoint lg) aplikasi memakai
// tata letak khusus ponsel: navigasi bawah, lembar laporan yang bisa diseret, legenda dalam lembar.
import { useSyncExternalStore } from 'react'

const KUERI_KECIL = '(max-width: 1023.98px)'

function langgananKecil(cb: () => void) {
  const mq = window.matchMedia(KUERI_KECIL)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** true di bawah breakpoint lg: tata letak ponsel dan tablet tegak. */
export function useLayarKecil(): boolean {
  return useSyncExternalStore(
    langgananKecil,
    () => window.matchMedia(KUERI_KECIL).matches,
    () => false,
  )
}

/** Dipakai di luar React (mis. bantalan peta). */
export function layarKecil(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(KUERI_KECIL).matches
}

function langgananUkuran(cb: () => void) {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}

/** Tinggi jendela (layout viewport) dalam px. */
export function useTinggiLayar(): number {
  return useSyncExternalStore(
    langgananUkuran,
    () => window.innerHeight,
    () => 800,
  )
}

/** Bagian lembar laporan yang terlihat pada posisi "sedang", sebagai pecahan tinggi layar. */
export const PECAHAN_SEDANG = 0.56

let probeAtas: HTMLDivElement | null = null

/** Nilai --geser-atas (styles/app.css) dalam px: jarak tambahan dari tepi atas layar ponsel supaya
 *  bilah atas tidak menabrak lubang kamera. 0 di desktop. Diukur lewat elemen tak terlihat karena
 *  nilai env() hanya bisa dibaca setelah dihitung peramban. */
export function geserAtasPx(): number {
  if (typeof document === 'undefined') return 0
  if (!probeAtas) {
    probeAtas = document.createElement('div')
    probeAtas.setAttribute('aria-hidden', 'true')
    probeAtas.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:1px;height:var(--geser-atas);top:0;left:0'
    document.body.appendChild(probeAtas)
  }
  return probeAtas.offsetHeight
}
