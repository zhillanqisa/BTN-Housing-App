// Pencarian lokasi: (1) luring dari daftar lokasi contoh + nama kelurahan,
// (2) daring lewat Nominatim, HANYA saat pengguna menekan Cari
// (kebijakan Nominatim: tanpa autocomplete, maksimal 1 permintaan per detik).
import { NOMINATIM } from './config'
import { GAZETTEER } from './gazetteer'
import type { Kawasan, Position } from './types'

export interface HasilCari {
  kunci: string
  label: string
  sub: string
  lngLat: Position
  sumber: 'lokal' | 'nominatim'
  kawasanId?: string
  perkiraan?: boolean
}

export function normal(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Saran instan tanpa jaringan. */
export function cariLokal(q: string, kawasan: Kawasan[], maks = 6): HasilCari[] {
  const n = normal(q).replace(/^(kelurahan|kel|kecamatan|kec|desa)\s+/, '')
  if (n.length < 2) return []
  const skor = (nama: string): number => {
    const m = normal(nama)
    if (m === n) return 3
    if (m.startsWith(n)) return 2
    return m.includes(n) ? 1 : 0
  }
  const calon: { s: number; h: HasilCari }[] = []
  for (const t of GAZETTEER) {
    const s = skor(t.label)
    if (s) {
      calon.push({
        s: s + 0.5,
        h: {
          kunci: `g-${t.label}`,
          label: t.label,
          sub: t.perkiraan ? 'Lokasi contoh, titik perkiraan' : 'Lokasi contoh',
          lngLat: t.lngLat,
          sumber: 'lokal',
          perkiraan: t.perkiraan,
        },
      })
    }
  }
  for (const k of kawasan) {
    const s = skor(k.nama)
    if (s) {
      calon.push({
        s,
        h: { kunci: `k-${k.id}`, label: `Kelurahan ${k.nama}`, sub: `Kecamatan ${k.kecamatan}`, lngLat: k.pusat, sumber: 'lokal', kawasanId: k.id },
      })
    }
  }
  return calon
    .sort((a, b) => b.s - a.s || a.h.label.localeCompare(b.h.label))
    .slice(0, maks)
    .map((c) => c.h)
}

let terakhir = 0

/** Cari alamat lewat Nominatim, dibatasi ke sekitar Kota Semarang. */
export async function cariNominatim(q: string, signal?: AbortSignal): Promise<HasilCari[]> {
  const jeda = 1100 - (Date.now() - terakhir)
  if (jeda > 0) await new Promise((r) => setTimeout(r, jeda))
  terakhir = Date.now()

  const u = new URL(NOMINATIM.url)
  u.search = new URLSearchParams({
    format: 'jsonv2',
    q,
    limit: '5',
    countrycodes: 'id',
    viewbox: NOMINATIM.viewbox,
    bounded: '1',
    'accept-language': 'id',
  }).toString()

  const res = await fetch(u, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []

  const hasil: HasilCari[] = []
  data.forEach((d: unknown, i: number) => {
    if (typeof d !== 'object' || d === null) return
    const o = d as Record<string, unknown>
    const lat = Number(o.lat)
    const lon = Number(o.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    const bagian = String(o.display_name ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const label = String(o.name || bagian[0] || q)
    hasil.push({
      kunci: `n-${i}-${lat}-${lon}`,
      label,
      sub: bagian
        .filter((b) => b !== label)
        .slice(0, 3)
        .join(', '),
      lngLat: [lon, lat],
      sumber: 'nominatim',
    })
  })
  return hasil
}
