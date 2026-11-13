// Util geometri kecil (tanpa dependensi): titik-dalam-poligon, bbox, pusat, luas.
import type { BBox, KawasanGeometry, PolygonCoords, Position } from './types'

export function polygonsOf(g: KawasanGeometry): PolygonCoords[] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates
}

export function pointInRing(pt: Position, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** true bila titik di dalam poligon (lubang diperhitungkan). */
export function pointInGeometry(pt: Position, g: KawasanGeometry): boolean {
  return polygonsOf(g).some((poly) => {
    const outer = poly[0]
    if (!outer || !pointInRing(pt, outer)) return false
    return !poly.slice(1).some((hole) => pointInRing(pt, hole))
  })
}

export function bboxOf(g: KawasanGeometry): BBox {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const poly of polygonsOf(g)) {
    for (const p of poly[0] ?? []) {
      if (p[0] < w) w = p[0]
      if (p[0] > e) e = p[0]
      if (p[1] < s) s = p[1]
      if (p[1] > n) n = p[1]
    }
  }
  return [w, s, e, n]
}

export function inBBox(pt: Position, b: BBox): boolean {
  return pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3]
}

export function mergeBBox(list: BBox[]): BBox | null {
  if (!list.length) return null
  return [
    Math.min(...list.map((b) => b[0])),
    Math.min(...list.map((b) => b[1])),
    Math.max(...list.map((b) => b[2])),
    Math.max(...list.map((b) => b[3])),
  ]
}

/** Luas cincin dalam km2 (proyeksi lokal sederhana; cukup untuk skala kota). */
export function ringAreaKm2(ring: Position[]): number {
  if (ring.length < 3) return 0
  const lat0 = (ring.reduce((sum, p) => sum + p[1], 0) / ring.length) * (Math.PI / 180)
  const kx = 111.32 * Math.cos(lat0)
  const ky = 110.57
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j]![0] * kx * (ring[i]![1] * ky) - ring[i]![0] * kx * (ring[j]![1] * ky)
  }
  return Math.abs(a) / 2
}

export function areaKm2(g: KawasanGeometry): number {
  return polygonsOf(g).reduce((sum, poly) => {
    const outer = poly[0] ? ringAreaKm2(poly[0]) : 0
    const holes = poly.slice(1).reduce((h, r) => h + ringAreaKm2(r), 0)
    return sum + outer - holes
  }, 0)
}

function ringCentroid(ring: Position[]): Position {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1]
    a += f
    cx += (ring[j]![0] + ring[i]![0]) * f
    cy += (ring[j]![1] + ring[i]![1]) * f
  }
  if (a === 0) return ring[0] ?? [0, 0]
  return [cx / (3 * a), cy / (3 * a)]
}

/** Titik pusat yang dijamin berada di dalam poligon terbesar. */
export function pusatOf(g: KawasanGeometry): Position {
  const polys = polygonsOf(g)
    .filter((p) => p[0] && p[0].length >= 4)
    .sort((a, b) => ringAreaKm2(b[0]!) - ringAreaKm2(a[0]!))
  const terbesar = polys[0]
  if (!terbesar) return [0, 0]
  const c = ringCentroid(terbesar[0]!)
  if (pointInGeometry(c, g)) return c
  const [w, s, e, n] = bboxOf({ type: 'Polygon', coordinates: terbesar })
  for (let i = 1; i < 24; i++) {
    for (let j = 1; j < 24; j++) {
      const p: Position = [w + ((e - w) * i) / 24, s + ((n - s) * j) / 24]
      if (pointInGeometry(p, g)) return p
    }
  }
  return c
}

export function haversineKm(a: Position, b: Position): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
