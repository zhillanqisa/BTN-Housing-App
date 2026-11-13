// Pemformatan angka dan tanggal (id-ID).
import type { Position } from './types'

const cache = new Map<number, Intl.NumberFormat>()
function nf(d: number): Intl.NumberFormat {
  let f = cache.get(d)
  if (!f) {
    f = new Intl.NumberFormat('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d })
    cache.set(d, f)
  }
  return f
}

/** Angka dengan d desimal, format Indonesia (koma desimal, titik ribuan). */
export function fmt(n: number, d = 0): string {
  if (!Number.isFinite(n)) return '-'
  // hindari "-0"
  const v = Math.abs(n) < 0.5 * 10 ** -d ? 0 : n
  return nf(d).format(v)
}

/** Rentang "a–b" (tanda pisah en). Bila sama setelah pembulatan, tampil satu angka. */
export function rentang(a: number, b: number, d = 0): string {
  const x = fmt(a, d)
  const y = fmt(b, d)
  return x === y ? x : `${x}–${y}`
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** '2017-01' -> 'Jan 2017' */
export function fmtPeriode(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym)
  if (!m) return ym
  return `${BULAN[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim()
}

/** '2026-11-13' atau Date -> '13 Nov 2026' */
export function fmtTanggal(d: string | Date): string {
  const t = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(t.getTime())) return String(d)
  return `${t.getDate()} ${BULAN[t.getMonth()]} ${t.getFullYear()}`
}

/** [110.4104, -6.9642] -> '6,9642° LS, 110,4104° BT' */
export function fmtKoordinat(p: Position): string {
  const [lon, lat] = p
  return `${fmt(Math.abs(lat), 4)}° ${lat < 0 ? 'LS' : 'LU'}, ${fmt(Math.abs(lon), 4)}° ${lon < 0 ? 'BB' : 'BT'}`
}

/** Nama file aman dari nama kawasan. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
