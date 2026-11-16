// Tur aplikasi: muncul sekali pada kunjungan pertama, bisa dibuka lagi dari tombol bantuan
// di bilah atas atau dari halaman Tentang kami. Penanda "sudah dilihat" disimpan di peramban.
import { create } from 'zustand'
import { navigasi } from './router'
import { useApp } from './store'

const KUNCI = 'subten.tur.v1'
// cadangan bila penyimpanan peramban tidak bisa dipakai (mode privat): tur cukup sekali per kunjungan
let dilihatSesiIni = false

export function sudahLihatTur(): boolean {
  if (dilihatSesiIni) return true
  try {
    return window.localStorage.getItem(KUNCI) === '1'
  } catch {
    return false
  }
}

function tandaiDilihat(): void {
  dilihatSesiIni = true
  try {
    window.localStorage.setItem(KUNCI, '1')
  } catch {
    /* penyimpanan tidak tersedia: penanda sesi sudah cukup */
  }
}

interface StateTur {
  buka: boolean
  langkah: number
  ke: (i: number) => void
  tutup: () => void
}

export const useTur = create<StateTur>((set) => ({
  buka: false,
  langkah: 0,
  ke: (langkah) => set({ langkah }),
  tutup: () => {
    tandaiDilihat()
    set({ buka: false, langkah: 0 })
  },
}))

/** Buka tur dari awal: ke halaman peta, tutup laporan yang sedang terbuka supaya peta terlihat. */
export function mulaiTur(): void {
  navigasi('peta')
  useApp.getState().tutupLaporan()
  useTur.setState({ buka: true, langkah: 0 })
}
