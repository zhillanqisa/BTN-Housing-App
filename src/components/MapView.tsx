// Peta MapLibre GL JS v6 di atas peta dasar OpenFreeMap.
// Bila dataset punya grid: laju/kategori tampil per piksel (sekitar 80 m) dan titik terpilih
// disorot sebagai blok piksel. Tanpa grid (mis. data unggahan): koroplet per kelurahan.
import { useEffect, useRef, useState } from 'react'
import { Map as PetaGL, Marker, Popup, setWorkerUrl, type GeoJSONSource, type ImageSource, type MapLayerMouseEvent, type PaddingOptions } from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSourceSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
// MapLibre v6 memuat worker dari file terpisah; Vite membundelnya lewat ?worker&url.
import urlPekerja from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { LABEL_KATEGORI, LAJU_BINS, MAP, RAMP, WARNA_KATEGORI } from '../lib/config'
import { geojsonPeta } from '../lib/data'
import { fmt } from '../lib/format'
import { mergeBBox, polygonsOf } from '../lib/geo'
import { batasBlok, lukisGrid, nilaiDi, type Grid, type RGBA } from '../lib/grid'
import { JENIS_LAPIS, konteksDi, LABEL_LAPIS, lapisBahaya, type JenisLapis, type LapisKonteks } from '../lib/konteks'
import { geserAtasPx, layarKecil, PECAHAN_SEDANG } from '../lib/layar'
import { binLaju, klasifikasi } from '../lib/risk'
import { jembatanPeta, kawasanById, useApp } from '../lib/store'
import { wilayahById, wilayahDiTitik } from '../lib/wilayah'
import type { BBox, Kawasan, ModePeta, Position, Tema, Thresholds } from '../lib/types'
import { Notice } from '../ui/primitives'

setWorkerUrl(urlPekerja)

const SRC = 'pa-kawasan'
const L_ISI = 'pa-kawasan-isi'
const L_ARSIR = 'pa-kawasan-arsir'
const L_GARIS = 'pa-kawasan-garis'
const L_PILIH_LUAR = 'pa-pilih-luar'
const L_PILIH = 'pa-pilih'
const L_BANGUNAN = 'pa-bangunan'
const ARSIR = 'pa-hatch'
const SRC_GRID = 'pa-grid'
const L_GRID = 'pa-grid-piksel'
const SRC_BLOK = 'pa-blok'
const L_BLOK_LUAR = 'pa-blok-luar'
const L_BLOK = 'pa-blok-garis'
// Sorotan kelurahan yang memuat titik terpilih: area di luarnya diredupkan, batasnya diberi cahaya.
const SRC_REDUP = 'pa-redup'
const L_REDUP = 'pa-redup-isi'
const L_PILIH_HALO = 'pa-pilih-halo'
// sorotan lokasi terpilih: teal logo (sama dengan --accent di styles/app.css), kontras dengan skala jingga
const aksen = (gelap: boolean) => (gelap ? '#34b5a3' : '#13796f')
const srcKonteks = (j: JenisLapis) => `pa-konteks-${j}`
const lIsiKonteks = (j: JenisLapis) => `pa-konteks-${j}-isi`
const lGarisKonteks = (j: JenisLapis) => `pa-konteks-${j}-garis`
const lPendarKonteks = (j: JenisLapis) => `pa-konteks-${j}-pendar`
// Relief bayangan dan medan 3D dari ubin elevasi terbuka (Mapzen Terrain Tiles di AWS Open Data).
// Dua sumber terpisah: MapLibre menyarankan sumber berbeda untuk hillshade dan terrain.
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const DEM_ATRIBUSI = '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Relief © Mapzen</a>'
const SRC_DEM = 'pa-dem'
const SRC_DEM_3D = 'pa-dem-3d'
const L_RELIEF = 'pa-relief'
const EKSAGERASI_3D = 1.6
const OPASITAS_GRID = { biasa: { light: 0.76, dark: 0.82 }, konteks: { light: 0.3, dark: 0.34 } }

const ekspr = (e: unknown) => e as ExpressionSpecification
const KOSONG = { type: 'FeatureCollection' as const, features: [] }

// Kotak jauh lebih luas dari batas gerak peta: lubangnya adalah kelurahan terpilih.
const DUNIA: Position[] = [
  [109.4, -8],
  [111.5, -8],
  [111.5, -6.1],
  [109.4, -6.1],
  [109.4, -8],
]
const luasBertanda = (r: Position[]) => r.reduce((a, p, i) => (i ? a + (r[i - 1]![0] * p[1] - p[0] * r[i - 1]![1]) : a), 0) / 2
/** MapLibre mengenali lubang dari arah putaran yang berlawanan dengan cincin luar. */
const searah = (r: Position[], berlawananJarum: boolean) => ((luasBertanda(r) > 0) === berlawananJarum ? r : [...r].reverse())

function topengLuar(k: Kawasan) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [searah(DUNIA, true), ...polygonsOf(k.geometry).map((p) => searah(p[0]!, false))] },
      },
    ],
  }
}


function warnaIsi(mode: ModePeta, tema: Tema, t: Thresholds): ExpressionSpecification {
  const w = WARNA_KATEGORI[tema]
  const tak = ['==', ['get', 'memadai'], false]
  if (mode === 'kategori') {
    return ekspr(['case', tak, w['tidak-memadai'], ['>=', ['get', 'laju'], t.tinggi], w.tinggi, ['>=', ['get', 'laju'], t.sedang], w.sedang, w.rendah])
  }
  const r = RAMP[tema]
  return ekspr([
    'case',
    tak,
    w['tidak-memadai'],
    ['step', ['get', 'laju'], r[0], LAJU_BINS[0], r[1], LAJU_BINS[1], r[2], LAJU_BINS[2], r[3], LAJU_BINS[3], r[4]],
  ])
}

/** Dengan grid, isi kelurahan dibuat tembus pandang (tetap menangkap kursor untuk tooltip). */
function opasitasIsi(adaGrid: boolean, gelap: boolean): ExpressionSpecification | number {
  if (adaGrid) return 0
  return ekspr(['case', ['boolean', ['feature-state', 'hover'], false], 0.92, gelap ? 0.78 : 0.7])
}

function rgba(hex: string, alfa = 255): RGBA {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alfa]
}

/** Grid sebagai PNG (data URL): satu piksel gambar = satu piksel data. */
function gambarGrid(grid: Grid, mode: ModePeta, tema: Tema, t: Thresholds): string {
  const w = WARNA_KATEGORI[tema]
  const kosong = rgba(w['tidak-memadai'], 150)
  const data =
    mode === 'kategori'
      ? lukisGrid(grid, (laju) => (laju >= t.tinggi ? 2 : laju >= t.sedang ? 1 : 0), [rgba(w.rendah), rgba(w.sedang), rgba(w.tinggi)], kosong)
      : lukisGrid(grid, binLaju, RAMP[tema].map((h) => rgba(h)), kosong)
  const { nx, ny } = grid.kepala
  const c = document.createElement('canvas')
  c.width = nx
  c.height = ny
  c.getContext('2d')!.putImageData(new ImageData(data, nx, ny), 0, 0)
  return c.toDataURL('image/png')
}

type Sudut = [[number, number], [number, number], [number, number], [number, number]]
function sudutGrid(grid: Grid): Sudut {
  const [barat, selatan, timur, utara] = grid.kepala.bbox
  return [[barat, utara], [timur, utara], [timur, selatan], [barat, selatan]]
}

function poligonKotak(b: BBox) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] },
      },
    ],
  }
}

/** Pola arsir 45 derajat untuk "data tidak memadai". */
function gambarArsir(tema: Tema): ImageData {
  const n = 16
  const c = document.createElement('canvas')
  c.width = n
  c.height = n
  const g = c.getContext('2d')!
  g.strokeStyle = tema === 'dark' ? 'rgba(255,255,255,0.36)' : 'rgba(15,29,51,0.36)'
  g.lineWidth = 1.4
  for (const o of [-16, -8, 0, 8, 16]) {
    g.beginPath()
    g.moveTo(o, n)
    g.lineTo(o + n, 0)
    g.stroke()
  }
  return g.getImageData(0, 0, n, n)
}

/** Gaya cadangan bila peta dasar gagal dimuat (mis. tanpa internet): latar polos. */
function gayaCadangan(tema: Tema): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'latar', type: 'background', paint: { 'background-color': tema === 'dark' ? '#0b1220' : '#e9edf3' } }],
  }
}

/** Ruang kosong supaya titik fokus tidak tertutup panel. laporan=true: di ponsel, lembar laporan
 *  menutup bagian bawah layar (posisi sedang), jadi titik ditaruh di peta yang masih terlihat. */
function bantalan(laporan = false): PaddingOptions {
  if (!layarKecil()) return { left: 440, top: 96, right: 76, bottom: 56 }
  const bawah = laporan ? Math.round(window.innerHeight * PECAHAN_SEDANG) : 230
  const atas = geserAtasPx()
  return { left: 24, top: 150 + atas, right: 64, bottom: Math.min(bawah, window.innerHeight - 260 - atas) }
}

/** Paskan kotak ke layar dengan bantalan(). Bantalan yang tersimpan di kamera (dari flyTo ke titik
 *  terpilih, di ponsel bawahnya 56% layar) dinolkan dulu: MapLibre menjumlahkannya dengan bantalan
 *  baru, dan di ponsel jumlahnya melebihi tinggi layar sehingga fitBounds batal diam-diam
 *  ("Map cannot fit within canvas"), dan peta tertinggal di lokasi lama. */
function pasKotak(map: PetaGL, kotak: BBox, pitch: number, duration: number) {
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 })
  map.fitBounds([[kotak[0], kotak[1]], [kotak[2], kotak[3]]], { padding: bantalan(), pitch, bearing: MAP.bearing, duration })
}

interface Ringkas {
  kawasan: Kawasan[]
  grid: Grid | null
  tema: Tema
  modePeta: ModePeta
  thresholds: Thresholds
  tigaD: boolean
  konteks: Partial<Record<JenisLapis, LapisKonteks>>
  lapisKonteks: JenisLapis | null
}

const opasitasGrid = (s: Ringkas) => OPASITAS_GRID[s.lapisKonteks ? 'konteks' : 'biasa'][s.tema]

// data terakhir yang dipasang ke tiap sumber lapis konteks (berganti saat pindah wilayah)
const dataKonteks = new Map<string, unknown>()

/** Lapis konteks (pola ruang, geologi): pasang yang sudah termuat, tampilkan hanya yang dipilih. */
function terapkanKonteks(map: PetaGL, s: Ringkas): void {
  if (!map.getLayer(L_ISI)) return
  const gelap = s.tema === 'dark'
  for (const j of JENIS_LAPIS) {
    const l = s.konteks[j]
    const src = srcKonteks(j)
    if (!l) {
      // wilayah ini tidak punya lapis tersebut: kosongkan bila sumbernya pernah dipasang
      if (map.getSource(src) && dataKonteks.get(src) !== KOSONG) {
        ;(map.getSource(src) as GeoJSONSource).setData(KOSONG)
        dataKonteks.set(src, KOSONG)
      }
      continue
    }
    if (!map.getSource(src)) {
      map.addSource(src, { type: 'geojson', data: l.geojson as GeoJSONSourceSpecification['data'] })
      dataKonteks.set(src, l.geojson)
    } else if (dataKonteks.get(src) !== l.geojson) {
      ;(map.getSource(src) as GeoJSONSource).setData(l.geojson as GeoJSONSourceSpecification['data'] as never)
      dataKonteks.set(src, l.geojson)
    }
    // di bawah lapis redup, supaya sorotan kelurahan tetap bekerja
    const sebelum = map.getLayer(L_REDUP) ? L_REDUP : undefined
    const bahaya = lapisBahaya(j)
    if (!map.getLayer(lIsiKonteks(j))) {
      map.addLayer(
        { id: lIsiKonteks(j), type: 'fill', source: src, paint: { 'fill-color': ekspr(['get', 'warna']), 'fill-opacity': bahaya ? (gelap ? 0.46 : 0.5) : gelap ? 0.5 : 0.56, 'fill-antialias': true } },
        sebelum,
      )
    }
    // lapis bahaya: pendar lembut di tepi kelas, lalu garis tipis berwarna kelas (tanpa garis gelap yang keras)
    if (bahaya && !map.getLayer(lPendarKonteks(j))) {
      map.addLayer(
        {
          id: lPendarKonteks(j),
          type: 'line',
          source: src,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ekspr(['get', 'warna']),
            'line-width': ekspr(['interpolate', ['linear'], ['zoom'], 10, 3, 15, 12]),
            'line-blur': ekspr(['interpolate', ['linear'], ['zoom'], 10, 3, 15, 10]),
            'line-opacity': gelap ? 0.55 : 0.45,
          },
        },
        sebelum,
      )
    }
    if (!map.getLayer(lGarisKonteks(j))) {
      map.addLayer(
        {
          id: lGarisKonteks(j),
          type: 'line',
          source: src,
          layout: { 'line-join': 'round' },
          paint: bahaya
            ? { 'line-color': ekspr(['get', 'warna']), 'line-width': ekspr(['interpolate', ['linear'], ['zoom'], 10, 0.5, 15, 1.4]), 'line-opacity': 0.95 }
            : { 'line-color': gelap ? 'rgba(255,255,255,0.55)' : 'rgba(15,29,51,0.45)', 'line-width': ekspr(['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.6]) },
        },
        sebelum,
      )
    }
    const tampil = s.lapisKonteks === j ? 'visible' : 'none'
    map.setLayoutProperty(lIsiKonteks(j), 'visibility', tampil)
    map.setLayoutProperty(lGarisKonteks(j), 'visibility', tampil)
    if (map.getLayer(lPendarKonteks(j))) map.setLayoutProperty(lPendarKonteks(j), 'visibility', tampil)
  }
  if (map.getLayer(L_GRID)) map.setPaintProperty(L_GRID, 'raster-opacity', opasitasGrid(s))
  // saat lapis konteks tampil, redupan di luar kelurahan dibuat tipis supaya warna kelasnya tetap terbaca
  if (map.getLayer(L_REDUP)) map.setPaintProperty(L_REDUP, 'fill-opacity', opasitasRedup(s))
}

function opasitasRedup(s: Ringkas): number {
  const gelap = s.tema === 'dark'
  if (s.lapisKonteks) return gelap ? 0.18 : 0.1
  return gelap ? 0.42 : 0.26
}

/** Pasang sumber dan layer kita di atas gaya peta dasar. Aman dipanggil berulang. */
function pasang(map: PetaGL, s: Ringkas): void {
  const layers = map.getStyle().layers ?? []
  const sebelumJalan = layers.find((l) => 'source-layer' in l && l['source-layer'] === 'transportation')?.id
  const simbolPertama = layers.find((l) => l.type === 'symbol')?.id
  const bawah = sebelumJalan ?? simbolPertama
  const gelap = s.tema === 'dark'
  const adaGrid = !!s.grid

  if (!map.hasImage(ARSIR)) map.addImage(ARSIR, gambarArsir(s.tema))
  if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: geojsonPeta(s.kawasan), promoteId: 'id' })

  // Relief bayangan tipis di bawah semua lapis data: perbukitan terlihat timbul, dataran pantai tetap rata.
  if (!map.getSource(SRC_DEM)) map.addSource(SRC_DEM, { type: 'raster-dem', tiles: [DEM_URL], tileSize: 256, maxzoom: 14, encoding: 'terrarium', attribution: DEM_ATRIBUSI })
  if (!map.getLayer(L_RELIEF)) {
    map.addLayer(
      {
        id: L_RELIEF,
        type: 'hillshade',
        source: SRC_DEM,
        paint: gelap
          ? { 'hillshade-exaggeration': 0.55, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': 'rgba(160,185,230,0.22)', 'hillshade-accent-color': '#050a14' }
          : { 'hillshade-exaggeration': 0.3, 'hillshade-shadow-color': '#2b3a55', 'hillshade-highlight-color': 'rgba(255,255,255,0.55)', 'hillshade-accent-color': '#4f5b73' },
      },
      bawah,
    )
  }
  terapkanMedan(map, s.tigaD, gelap)

  if (s.grid && !map.getSource(SRC_GRID)) {
    map.addSource(SRC_GRID, { type: 'image', url: gambarGrid(s.grid, s.modePeta, s.tema, s.thresholds), coordinates: sudutGrid(s.grid) })
  }
  if (s.grid && !map.getLayer(L_GRID)) {
    // grid bisa tiba setelah lapis lain terpasang: selalu sisipkan di bawah lapis kita (konteks, redup)
    map.addLayer(
      { id: L_GRID, type: 'raster', source: SRC_GRID, paint: { 'raster-resampling': 'nearest', 'raster-opacity': opasitasGrid(s), 'raster-fade-duration': 0 } },
      map.getLayer(L_ISI) ? L_ISI : bawah,
    )
  }

  if (!map.getLayer(L_ISI)) {
    map.addLayer(
      { id: L_ISI, type: 'fill', source: SRC, paint: { 'fill-color': warnaIsi(s.modePeta, s.tema, s.thresholds), 'fill-opacity': opasitasIsi(adaGrid, gelap) } },
      bawah,
    )
  }
  if (!map.getLayer(L_ARSIR)) {
    map.addLayer(
      { id: L_ARSIR, type: 'fill', source: SRC, filter: ['==', ['get', 'memadai'], false], layout: { visibility: adaGrid ? 'none' : 'visible' }, paint: { 'fill-pattern': ARSIR } },
      bawah,
    )
  }
  if (!map.getLayer(L_GARIS)) {
    map.addLayer(
      {
        id: L_GARIS,
        type: 'line',
        source: SRC,
        paint: {
          'line-color': gelap ? 'rgba(255,255,255,0.3)' : 'rgba(15,29,51,0.26)',
          'line-width': ekspr(['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.3]),
        },
      },
      simbolPertama,
    )
  }
  // lapis redup: di atas piksel dan lapis konteks, di bawah jalan dan label peta dasar
  if (!map.getSource(SRC_REDUP)) map.addSource(SRC_REDUP, { type: 'geojson', data: KOSONG })
  if (!map.getLayer(L_REDUP)) {
    map.addLayer({ id: L_REDUP, type: 'fill', source: SRC_REDUP, paint: { 'fill-color': gelap ? '#000000' : '#0f1d33', 'fill-opacity': opasitasRedup(s) } }, bawah)
  }
  terapkanKonteks(map, s)
  const tanpaPilihan = ['==', ['get', 'id'], '__tidak_ada__'] as ['==', ['get', string], string]
  const luar = gelap ? '#070c16' : '#0f1d33'
  // Bangunan 3D dari tile vektor peta dasar (OpenMapTiles: layer "building", atribut render_height).
  if (map.getSource('openmaptiles') && !map.getLayer(L_BANGUNAN)) {
    map.addLayer(
      {
        id: L_BANGUNAN,
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        filter: ['!=', ['get', 'hide_3d'], true],
        layout: { visibility: s.tigaD ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-color': gelap ? '#243149' : '#ffffff',
          'fill-extrusion-height': ekspr(['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['coalesce', ['get', 'render_height'], 5]]),
          'fill-extrusion-base': ekspr(['coalesce', ['get', 'render_min_height'], 0]),
          'fill-extrusion-opacity': gelap ? 0.82 : 0.8,
        },
      },
      simbolPertama,
    )
  }
  if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', s.tigaD && map.getLayer(L_BANGUNAN) ? 'none' : 'visible')
  // Batas kelurahan terpilih: cahaya lebar, garis gelap, lalu garis aksen. Setelah bangunan 3D supaya tidak tertutup.
  if (!map.getLayer(L_PILIH_HALO)) {
    map.addLayer(
      {
        id: L_PILIH_HALO,
        type: 'line',
        source: SRC,
        filter: tanpaPilihan,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': aksen(gelap), 'line-width': 16, 'line-blur': 12, 'line-opacity': gelap ? 0.55 : 0.7 },
      },
      simbolPertama,
    )
  }
  if (!map.getLayer(L_PILIH_LUAR)) {
    map.addLayer(
      { id: L_PILIH_LUAR, type: 'line', source: SRC, filter: tanpaPilihan, layout: { 'line-join': 'round' }, paint: { 'line-color': luar, 'line-width': 5.5 } },
      simbolPertama,
    )
  }
  if (!map.getLayer(L_PILIH)) {
    map.addLayer(
      { id: L_PILIH, type: 'line', source: SRC, filter: tanpaPilihan, layout: { 'line-join': 'round' }, paint: { 'line-color': aksen(gelap), 'line-width': 2.6 } },
      simbolPertama,
    )
  }
  // Blok piksel di sekitar titik terpilih (hanya terisi bila ada grid). Dipasang setelah
  // bangunan 3D supaya garisnya tidak tertutup: blok 240 m lebih kecil dari satu blok kota.
  if (!map.getSource(SRC_BLOK)) map.addSource(SRC_BLOK, { type: 'geojson', data: KOSONG })
  if (!map.getLayer(L_BLOK_LUAR)) {
    map.addLayer({ id: L_BLOK_LUAR, type: 'line', source: SRC_BLOK, layout: { 'line-join': 'round' }, paint: { 'line-color': luar, 'line-width': 6 } }, simbolPertama)
  }
  if (!map.getLayer(L_BLOK)) {
    map.addLayer({ id: L_BLOK, type: 'line', source: SRC_BLOK, layout: { 'line-join': 'round' }, paint: { 'line-color': aksen(gelap), 'line-width': 2.8 } }, simbolPertama)
  }
}

/** Medan dan langit untuk tampilan 3D. Di 2D medan dimatikan: peta datar lebih tajam dan ringan. */
function terapkanMedan(map: PetaGL, tigaD: boolean, gelap: boolean): void {
  if (tigaD) {
    if (!map.getSource(SRC_DEM_3D)) map.addSource(SRC_DEM_3D, { type: 'raster-dem', tiles: [DEM_URL], tileSize: 256, maxzoom: 14, encoding: 'terrarium' })
    map.setTerrain({ source: SRC_DEM_3D, exaggeration: EKSAGERASI_3D })
    map.setSky(
      gelap
        ? { 'sky-color': '#08101d', 'horizon-color': '#1d2f52', 'fog-color': '#0b1220', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.4 }
        : { 'sky-color': '#cddcf0', 'horizon-color': '#eef3fa', 'fog-color': '#e9edf3', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.35 },
    )
  } else if (map.getTerrain()) {
    map.setTerrain(null)
  }
}

/** Selaraskan lapis piksel dengan state: gambar ulang, pasang, atau cabut bila dataset tanpa grid. */
function terapkanGrid(map: PetaGL, s: Ringkas): void {
  const src = map.getSource(SRC_GRID) as ImageSource | undefined
  if (s.grid) {
    if (src) src.updateImage({ url: gambarGrid(s.grid, s.modePeta, s.tema, s.thresholds), coordinates: sudutGrid(s.grid) })
    else pasang(map, s)
  } else {
    if (map.getLayer(L_GRID)) map.removeLayer(L_GRID)
    if (src) map.removeSource(SRC_GRID)
  }
  map.setPaintProperty(L_ISI, 'fill-opacity', opasitasIsi(!!s.grid, s.tema === 'dark'))
  if (map.getLayer(L_ARSIR)) map.setLayoutProperty(L_ARSIR, 'visibility', s.grid ? 'none' : 'visible')
}

export default function MapView({ aktif }: { aktif: boolean }) {
  const wadah = useRef<HTMLDivElement>(null)
  const peta = useRef<PetaGL | null>(null)
  const penanda = useRef<Marker | null>(null)
  const labelKel = useRef<Marker | null>(null)
  const temaTerpasang = useRef<Tema>(useApp.getState().tema)
  const modeCadangan = useRef(false)
  // wilayah yang terakhir dipaskan ke layar: peta dipaskan ulang saat pindah wilayah
  const wilayahPas = useRef<string | null>(null)
  const terbangTerakhir = useRef('')
  const [gayaKe, setGayaKe] = useState(0)
  const [cadangan, setCadangan] = useState(false)

  const tema = useApp((s) => s.tema)
  const kawasan = useApp((s) => s.kawasan)
  const grid = useApp((s) => s.grid)
  const versiData = useApp((s) => s.versiData)
  const modePeta = useApp((s) => s.modePeta)
  const thresholds = useApp((s) => s.thresholds)
  const tigaD = useApp((s) => s.tigaD)
  const selection = useApp((s) => s.selection)
  const konteks = useApp((s) => s.konteks)
  const lapisKonteks = useApp((s) => s.lapisKonteks)
  const wilayah = useApp((s) => s.wilayah)

  // ---------- inisialisasi (sekali) ----------
  useEffect(() => {
    if (!wadah.current) return
    const awal = useApp.getState()
    let gayaDimuat = false
    const map = new PetaGL({
      container: wadah.current,
      style: MAP.styles[awal.tema],
      center: MAP.center,
      zoom: MAP.zoom,
      pitch: awal.tigaD ? MAP.pitch : 0,
      bearing: MAP.bearing,
      minZoom: MAP.minZoom,
      maxZoom: MAP.maxZoom,
      maxPitch: 70,
      maxBounds: MAP.maxBounds,
      attributionControl: { compact: true },
      // supaya kanvas bisa disalin ke PDF
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })
    peta.current = map
    // Di ponsel atribusi ringkas dimulai tertutup (tombol i) supaya tidak menutupi peta; isinya tetap
    // bisa dibuka kapan saja. MapLibre membukanya di awal dan baru menutup setelah peta digeser.
    map.once('load', () => {
      if (!layarKecil()) return
      const atribusi = wadah.current?.querySelector('.maplibregl-ctrl-attrib')
      atribusi?.classList.remove('maplibregl-compact-show')
      atribusi?.removeAttribute('open')
    })
    // kait debug, hanya saat pengembangan
    if (import.meta.env.DEV) (window as unknown as { __peta?: PetaGL }).__peta = map

    const pakaiCadangan = () => {
      if (gayaDimuat || modeCadangan.current) return
      modeCadangan.current = true
      setCadangan(true)
      map.setStyle(gayaCadangan(useApp.getState().tema))
    }
    const batasWaktu = window.setTimeout(pakaiCadangan, 12000)
    map.on('error', () => {
      if (!gayaDimuat) pakaiCadangan()
    })

    map.on('style.load', () => {
      gayaDimuat = true
      window.clearTimeout(batasWaktu)
      pasang(map, useApp.getState())
      setGayaKe((n) => n + 1)
    })

    // tooltip saat kursor di atas wilayah: nilai piksel (ada grid) atau rata-rata kelurahan
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '240px' })
    let idSorot: string | null = null
    let kunciSorot = ''
    const lepas = () => {
      if (idSorot !== null && map.getSource(SRC)) map.setFeatureState({ source: SRC, id: idSorot }, { hover: false })
      idSorot = null
      kunciSorot = ''
      popup.remove()
      map.getCanvas().style.cursor = ''
    }
    map.on('mousemove', L_ISI, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as { id: string; nama: string; kecamatan: string; laju: number; memadai: boolean }
      const st = useApp.getState()
      const piksel = st.grid ? nilaiDi(st.grid, [e.lngLat.lng, e.lngLat.lat]) : null
      if (idSorot !== p.id) {
        if (idSorot !== null) map.setFeatureState({ source: SRC, id: idSorot }, { hover: false })
        idSorot = p.id
        map.setFeatureState({ source: SRC, id: idSorot }, { hover: true })
      }
      const lapis = st.lapisKonteks
      const kelas = lapis ? konteksDi(st.konteks[lapis], [e.lngLat.lng, e.lngLat.lat]) : null
      const kunci = `${p.id}|${piksel ? (piksel.status === 'luar' ? 'luar' : piksel.indeks) : ''}|${lapis ?? ''}|${kelas?.nama ?? ''}`
      if (kunci !== kunciSorot) {
        kunciSorot = kunci
        let nilai: string
        if (piksel) {
          nilai =
            piksel.status === 'ada'
              ? `${fmt(Math.max(0, piksel.laju), 1)} cm/tahun di piksel ini, kategori ${LABEL_KATEGORI[klasifikasi(piksel.laju, true, st.thresholds)].toLowerCase()}`
              : 'Tidak ada data satelit di piksel ini'
        } else {
          const kat = klasifikasi(p.memadai ? p.laju : null, p.memadai, st.thresholds)
          nilai = p.memadai ? `${fmt(p.laju, 1)} cm/tahun, kategori ${LABEL_KATEGORI[kat].toLowerCase()}` : 'Data tidak memadai'
        }
        // nama berasal dari data: selalu lewat textContent
        const el = document.createElement('div')
        const a = document.createElement('div')
        a.style.fontWeight = '700'
        a.textContent = `Kelurahan ${p.nama}`
        const b = document.createElement('div')
        b.style.opacity = '0.7'
        b.textContent = `Kecamatan ${p.kecamatan}`
        const c = document.createElement('div')
        c.style.marginTop = '4px'
        c.textContent = nilai
        el.append(a, b, c)
        if (lapis && kelas) {
          const d = document.createElement('div')
          d.style.cssText = 'margin-top:4px;display:flex;align-items:center;gap:6px'
          const kotak = document.createElement('span')
          kotak.style.cssText = `width:10px;height:10px;border-radius:3px;flex-shrink:0;background:${kelas.warna}`
          const t = document.createElement('span')
          t.textContent = `${LABEL_LAPIS[lapis]}: ${kelas.nama}`
          d.append(kotak, t)
          el.append(d)
        }
        popup.setDOMContent(el)
      }
      popup.setLngLat(e.lngLat).addTo(map)
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', L_ISI, lepas)

    map.on('click', (e) => {
      const st = useApp.getState()
      const p: Position = [e.lngLat.lng, e.lngLat.lat]
      // klik di wilayah lain: pindah wilayah dulu, lalu pilih titiknya
      const w = wilayahDiTitik(p)
      if (w && w.id !== st.wilayah) void st.pilihWilayah(w.id).then(() => useApp.getState().pilihTitik(p, 'peta'))
      else st.pilihTitik(p, 'peta')
    })

    // jembatan untuk kontrol dan PDF
    jembatanPeta.zoom = (d) => map.easeTo({ zoom: map.getZoom() + d, duration: 300 })
    jembatanPeta.aturUlang = () => {
      const s = useApp.getState()
      const kotak = mergeBBox(s.kawasan.map((k) => k.bbox))
      if (kotak) pasKotak(map, kotak, s.tigaD ? MAP.pitch : 0, 900)
    }
    jembatanPeta.ambilGambar = () => {
      try {
        const src = map.getCanvas()
        const dpr = src.width / Math.max(1, src.clientWidth)
        const sel = useApp.getState().selection
        // potong 720x500 px di sekitar titik terpilih (atau tengah kanvas)
        const pusat = sel ? map.project(sel.lngLat) : { x: src.clientWidth / 2, y: src.clientHeight / 2 }
        const lebar = Math.min(720, src.clientWidth)
        const tinggi = Math.min(500, src.clientHeight)
        const x = Math.max(0, Math.min(src.clientWidth - lebar, pusat.x - lebar / 2))
        const y = Math.max(0, Math.min(src.clientHeight - tinggi, pusat.y - tinggi / 2))
        const c = document.createElement('canvas')
        c.width = lebar * 1.5
        c.height = tinggi * 1.5
        c.getContext('2d')!.drawImage(src, x * dpr, y * dpr, lebar * dpr, tinggi * dpr, 0, 0, c.width, c.height)
        // JPEG supaya PDF tetap ringan (PNG peta bisa lebih dari 1 MB)
        return c.toDataURL('image/jpeg', 0.86)
      } catch {
        return null
      }
    }

    return () => {
      window.clearTimeout(batasWaktu)
      jembatanPeta.zoom = null
      jembatanPeta.aturUlang = null
      jembatanPeta.ambilGambar = null
      penanda.current?.remove()
      penanda.current = null
      labelKel.current?.remove()
      labelKel.current = null
      popup.remove()
      map.remove()
      peta.current = null
    }
  }, [])

  // ---------- ganti tema -> ganti gaya peta dasar ----------
  useEffect(() => {
    const map = peta.current
    if (!map || temaTerpasang.current === tema) return
    temaTerpasang.current = tema
    map.setStyle(modeCadangan.current ? gayaCadangan(tema) : MAP.styles[tema])
  }, [tema])

  // ---------- data kelurahan ----------
  useEffect(() => {
    const map = peta.current
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!map || !src) return
    src.setData(geojsonPeta(kawasan))
    const w = useApp.getState().wilayah
    // data kosong (gagal muat) tetap memindah kamera ke kotak wilayah, supaya peta tidak tertinggal di wilayah lama
    const gagal = !kawasan.length && useApp.getState().status === 'gagal'
    if (wilayahPas.current !== w && (kawasan.length || gagal)) {
      const pertama = wilayahPas.current === null
      wilayahPas.current = w
      const kotak = kawasan.length ? mergeBBox(kawasan.map((k) => k.bbox)) : (wilayahById(w)?.bbox ?? null)
      if (kotak && !useApp.getState().selection) {
        pasKotak(map, kotak, tigaD ? MAP.pitch : 0, pertama ? 0 : 1600)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versiData, gayaKe])

  // ---------- pindah wilayah: kamera langsung ke wilayah baru, tanpa menunggu datanya ----------
  // Kotak wilayah di wilayah.ts sama dengan batas datanya, jadi efek data di atas tidak memaskan
  // ulang. Pemasangan pertama (wilayahPas masih null) tetap diurus efek data.
  useEffect(() => {
    const map = peta.current
    if (!map || wilayahPas.current === null || wilayahPas.current === wilayah) return
    const kotak = wilayahById(wilayah)?.bbox
    if (!kotak) return
    wilayahPas.current = wilayah
    // titik terpilih yang tetap berlaku di wilayah baru: kamera tetap di titik itu
    if (useApp.getState().selection) return
    pasKotak(map, kotak, tigaD ? MAP.pitch : 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wilayah])

  // ---------- warna (mode, ambang, tema) dan lapis piksel ----------
  useEffect(() => {
    const map = peta.current
    if (!map || !map.getLayer(L_ISI)) return
    map.setPaintProperty(L_ISI, 'fill-color', warnaIsi(modePeta, tema, thresholds))
    terapkanGrid(map, useApp.getState())
  }, [grid, modePeta, thresholds, tema, gayaKe])

  // ---------- 2D / 3D ----------
  useEffect(() => {
    const map = peta.current
    if (!map || !map.getLayer(L_ISI)) return
    if (map.getLayer(L_BANGUNAN)) map.setLayoutProperty(L_BANGUNAN, 'visibility', tigaD ? 'visible' : 'none')
    if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', tigaD && map.getLayer(L_BANGUNAN) ? 'none' : 'visible')
    terapkanMedan(map, tigaD, useApp.getState().tema === 'dark')
    map.easeTo({ pitch: tigaD ? MAP.pitch : 0, duration: 600 })
  }, [tigaD, gayaKe])

  // ---------- lapis konteks ----------
  useEffect(() => {
    const map = peta.current
    if (map) terapkanKonteks(map, useApp.getState())
  }, [konteks, lapisKonteks, tema, gayaKe])

  // ---------- lokasi terpilih: sorotan kelurahan, blok piksel, penanda, kamera ----------
  useEffect(() => {
    const map = peta.current
    if (!map || !map.getLayer(L_PILIH)) return
    // kelurahan yang memuat titik selalu disorot; dengan grid, blok piksel ikut disorot di dalamnya
    const kel = kawasanById(selection?.kawasanId)
    const filter = ['==', ['get', 'id'], kel?.id ?? '__tidak_ada__'] as ['==', ['get', string], string]
    for (const l of [L_PILIH_HALO, L_PILIH_LUAR, L_PILIH]) if (map.getLayer(l)) map.setFilter(l, filter)
    ;(map.getSource(SRC_REDUP) as GeoJSONSource | undefined)?.setData(kel ? topengLuar(kel) : KOSONG)
    const kotak = grid && kel && selection ? batasBlok(grid, selection.lngLat) : null
    ;(map.getSource(SRC_BLOK) as GeoJSONSource | undefined)?.setData(kotak ? poligonKotak(kotak) : KOSONG)

    labelKel.current?.remove()
    labelKel.current = null
    if (kel) {
      // nama dari data: lewat textContent. Animasi ada di elemen dalam, karena MapLibre
      // memosisikan elemen luar lewat transform.
      const el = document.createElement('div')
      const isi = document.createElement('div')
      isi.className = 'pa-label-kel'
      const kecil = document.createElement('small')
      kecil.textContent = 'Kel.'
      const nama = document.createElement('b')
      nama.textContent = kel.nama
      isi.append(kecil, nama)
      el.append(isi)
      // di atas titik terpilih (bukan di tepi batas): selalu terlihat, juga saat peta miring 3D
      labelKel.current = new Marker({ element: el, anchor: 'bottom', offset: [0, -30] }).setLngLat(selection!.lngLat).addTo(map)
    }

    if (!selection) {
      penanda.current?.remove()
      penanda.current = null
      terbangTerakhir.current = ''
      return
    }
    if (!penanda.current) {
      const el = document.createElement('div')
      el.className = 'pa-marker'
      penanda.current = new Marker({ element: el }).setLngLat(selection.lngLat).addTo(map)
    } else {
      penanda.current.setLngLat(selection.lngLat)
    }
    const kunci = selection.lngLat.join(',')
    if (terbangTerakhir.current !== kunci) {
      terbangTerakhir.current = kunci
      const pusat: Position = selection.lngLat
      // dengan grid, perbesar sampai blok sekitar 240 m terlihat jelas
      map.flyTo({ center: pusat, zoom: Math.max(map.getZoom(), grid ? 14.6 : 13.7), pitch: tigaD ? 58 : 0, padding: bantalan(true), duration: 1500 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, grid, gayaKe])

  return (
    <div className="absolute inset-0" inert={!aktif}>
      {/* h-full, bukan absolute: CSS MapLibre memaksa position: relative pada kontainer */}
      <div ref={wadah} className="h-full w-full" aria-label={`Peta penurunan tanah ${wilayahById(wilayah)?.nama ?? ''}`} />
      {cadangan && aktif && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(150px+var(--geser-atas))] z-10 flex justify-center px-4 lg:top-[92px]">
          <Notice className="pointer-events-auto max-w-[420px] shadow-pop">
            Peta dasar tidak termuat. Periksa koneksi internet. Data kawasan tetap tampil.
          </Notice>
        </div>
      )}
    </div>
  )
}
