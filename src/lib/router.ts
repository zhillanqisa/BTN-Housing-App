// Router hash kecil: #/, #/bandingkan, #/dashboard, #/metode, dengan query (?k=id&t=15).
// Hash dipilih supaya aplikasi bisa di-host statis di mana pun tanpa konfigurasi server.
import { useMemo, useSyncExternalStore } from 'react'
import type { Halaman } from './types'

const HALAMAN: Halaman[] = ['peta', 'bandingkan', 'dashboard', 'metode', 'tentang']

export interface Rute {
  halaman: Halaman
  params: URLSearchParams
}

export function bacaRute(hash: string): Rute {
  const bersih = hash.replace(/^#\/?/, '')
  const [jalur = '', query = ''] = bersih.split('?')
  const halaman = (HALAMAN as string[]).includes(jalur) ? (jalur as Halaman) : 'peta'
  return { halaman, params: new URLSearchParams(query) }
}

/** Kunci isi rute (halaman + parameter), untuk mengenali tautan yang sudah dibaca. */
export function kunciRute(r: Rute): string {
  return `${r.halaman}?${r.params.toString()}`
}

type NilaiParam = string | number | null | undefined

export function buatHash(halaman: Halaman, params: Record<string, NilaiParam> = {}): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v))
  const qs = q.toString()
  return `#/${halaman === 'peta' ? '' : halaman}${qs ? `?${qs}` : ''}`
}

/** Pindah halaman. ganti=true memakai replaceState (tidak menambah riwayat). */
export function navigasi(halaman: Halaman, params: Record<string, NilaiParam> = {}, ganti = false): void {
  const hash = buatHash(halaman, params)
  if (hash === window.location.hash) return
  if (ganti) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}

function langganan(cb: () => void): () => void {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRute(): Rute {
  const hash = useSyncExternalStore(
    langganan,
    () => window.location.hash,
    () => '',
  )
  return useMemo(() => bacaRute(hash), [hash])
}
