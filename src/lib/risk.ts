// Kategori, Proyeksi Tenor, dan teks laporan.
// Rumus Proyeksi Tenor mengikuti sheet "Kalkulator" di spreadsheet tim:
//   tengah = laju × tenor
//   bawah  = max(0, (laju − ketidakpastian) × tenor)
//   atas   = (laju + ketidakpastian) × tenor
import { LAJU_BINS } from './config'
import { fmt, rentang } from './format'
import type { Kategori, Proyeksi, Tenor, Thresholds } from './types'

export function klasifikasi(laju: number | null, memadai: boolean, t: Thresholds): Kategori {
  if (!memadai || laju == null || !Number.isFinite(laju)) return 'tidak-memadai'
  if (laju >= t.tinggi) return 'tinggi'
  if (laju >= t.sedang) return 'sedang'
  return 'rendah'
}

/** Indeks kelas peta 0..4 untuk mode "laju". */
export function binLaju(laju: number): number {
  let i = 0
  for (const b of LAJU_BINS) if (laju >= b) i++
  return i
}

export function hitungProyeksi(laju: number, sigma: number, tenor: Tenor): Proyeksi {
  const s = Math.max(0, sigma)
  return {
    tenor,
    tengah: Math.max(0, laju * tenor),
    bawah: Math.max(0, (laju - s) * tenor),
    atas: Math.max(0, (laju + s) * tenor),
  }
}

export function rentangLaju(laju: number, sigma: number): { bawah: number; atas: number } {
  const s = Math.max(0, sigma)
  return { bawah: Math.max(0, laju - s), atas: Math.max(0, laju + s) }
}

/** Teks rentang laju, mis. "4–6" atau "0,3–1,1". */
export function teksRentangLaju(laju: number, sigma: number): string {
  const { bawah, atas } = rentangLaju(laju, sigma)
  return rentang(bawah, atas, atas >= 3 ? 0 : 1)
}

const KAT_KALIMAT: Record<Kategori, string> = {
  rendah: 'kategori rendah',
  sedang: 'kategori sedang',
  tinggi: 'kategori tinggi',
  'tidak-memadai': 'data tidak memadai',
}

/** Kalimat status kawasan untuk orang awam. */
export function kalimatStatus(laju: number | null, sigma: number | null, kategori: Kategori): string {
  if (kategori === 'tidak-memadai' || laju == null) {
    return 'Data satelit di kawasan ini belum memadai, jadi laju penurunan tidak ditampilkan.'
  }
  const s = sigma ?? 0
  if (laju + s < 0.5) {
    return `Kawasan ini relatif stabil: perubahan di bawah 0,5 cm/tahun (${KAT_KALIMAT[kategori]}).`
  }
  return `Kawasan ini turun sekitar ${teksRentangLaju(laju, s)} cm/tahun (${KAT_KALIMAT[kategori]}).`
}

/** Kalimat Proyeksi Tenor. Selalu diawali "Jika tren bertahan" dan berupa rentang. */
export function kalimatProyeksi(p: Proyeksi): string {
  const a = Math.round(p.bawah)
  const b = Math.round(p.atas)
  if (b < 1) return `Jika tren bertahan, dalam ${p.tenor} tahun penurunan tanah di sini diperkirakan kurang dari 1 cm.`
  return `Jika tren bertahan, dalam ${p.tenor} tahun tanah di sini turun sekitar ${rentang(a, b)} cm.`
}

/** Teks pendek rentang proyeksi, mis. "60–90 cm". */
export function teksProyeksi(p: Proyeksi): string {
  const b = Math.round(p.atas)
  if (b < 1) return '< 1 cm'
  return `${rentang(Math.round(p.bawah), b)} cm`
}

export interface Langkah {
  judul: string
  butir: string[]
}

/** "Langkah berikutnya" per kategori. Arahan umum; detail teknis dirujuk ke ahli. */
export function langkahBerikutnya(kategori: Kategori): Langkah {
  switch (kategori) {
    case 'tinggi':
      return {
        judul: 'Periksa lebih dalam sebelum akad',
        butir: [
          'Minta dokumen penyelidikan tanah (sondir atau boring) dan rencana pondasi dari pengembang.',
          'Tanyakan elevasi lantai rumah terhadap jalan dan muka banjir, lalu bandingkan dengan proyeksi di atas.',
          'Pertimbangkan survei geoteknik independen untuk lokasi rumah.',
          'Siapkan rencana adaptasi, misalnya peninggian lantai bertahap, dan tanyakan opsi kredit renovasi ke bank.',
          'Bandingkan dengan satu atau dua lokasi lain memakai fitur Bandingkan.',
        ],
      }
    case 'sedang':
      return {
        judul: 'Tanyakan hal ini ke pengembang',
        butir: [
          'Elevasi lantai terhadap jalan, jenis pondasi, dan hasil penyelidikan tanah.',
          'Amati tanda di lapangan: retak dinding atau lantai, jalan bergelombang, selisih tinggi rumah lama dengan jalan.',
          'Bandingkan dengan satu atau dua lokasi lain memakai fitur Bandingkan.',
          'Pertimbangkan konsultasi singkat dengan ahli teknik sipil sebelum akad.',
        ],
      }
    case 'rendah':
      return {
        judul: 'Tetap lakukan pemeriksaan standar',
        butir: [
          'Simpan laporan ini sebagai catatan awal dan cek ulang saat data diperbarui.',
          'Tanyakan riwayat banjir, rob, dan kondisi drainase ke pengembang atau warga sekitar.',
          'Lakukan pemeriksaan standar sebelum akad: legalitas tanah, kondisi bangunan, dan dokumen teknis.',
        ],
      }
    default:
      return {
        judul: 'Cari informasi dari sumber lain',
        butir: [
          'Jangan artikan "data tidak memadai" sebagai aman atau berisiko. Artinya satelit belum bisa mengukur di sini, misalnya karena vegetasi rapat.',
          'Tanyakan kondisi tanah dan riwayat kawasan ke pengembang, warga sekitar, atau dinas terkait.',
          'Untuk keputusan penting, pertimbangkan survei geoteknik.',
        ],
      }
  }
}

/** Jumlah kawasan per kategori. */
export function hitungKategori(
  list: { laju: number | null; memadai: boolean }[],
  t: Thresholds,
): Record<Kategori, number> {
  const out: Record<Kategori, number> = { rendah: 0, sedang: 0, tinggi: 0, 'tidak-memadai': 0 }
  for (const k of list) out[klasifikasi(k.laju, k.memadai, t)]++
  return out
}

/** Teks laju untuk tampilan ringkas, mis. "5,2 ± 1,0". */
export function teksLaju(laju: number | null, sigma: number | null): string {
  if (laju == null) return '-'
  return sigma == null ? fmt(laju, 1) : `${fmt(laju, 1)} ± ${fmt(sigma, 1)}`
}
