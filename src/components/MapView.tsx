// Peta MapLibre GL JS v6: koroplet laju/kategori per kelurahan di atas peta dasar
// OpenFreeMap, bangunan 3D, penanda lokasi, dan tooltip saat kursor di atas kawasan.
import { useEffect, useRef, useState } from 'react'
import { Map as PetaGL, Marker, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent, type PaddingOptions } from 'maplibre-gl'
import type { ExpressionSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
// MapLibre v6 memuat worker dari file terpisah; Vite membundelnya lewat ?worker&url.
import urlPekerja from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { LABEL_KATEGORI, LAJU_BINS, MAP, RAMP, WARNA_KATEGORI } from '../lib/config'
import { geojsonPeta } from '../lib/data'
import { fmt } from '../lib/format'
import { mergeBBox } from '../lib/geo'
import { klasifikasi } from '../lib/risk'
import { jembatanPeta, useApp } from '../lib/store'
import type { Kawasan, ModePeta, Position, Tema, Thresholds } from '../lib/types'
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

const ekspr = (e: unknown) => e as ExpressionSpecification

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

/** Pola arsir 45 derajat untuk "data tidak memadai". */
function gambarArsir(tema: Tema): ImageData {
  const n = 16
  const c = document.createElement('canvas')
  c.width = n
  c.height = n
  const g = c.getContext('2d')!
  g.strokeStyle = tema === 'dark' ? 'rgba(255,255,255,0.36)' : 'rgba(22,22,29,0.36)'
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
    layers: [{ id: 'latar', type: 'background', paint: { 'background-color': tema === 'dark' ? '#101016' : '#eceef2' } }],
  }
}

/** Ruang kosong supaya titik fokus tidak tertutup panel. */
function bantalan(): PaddingOptions {
  if (window.innerWidth >= 1024) return { left: 440, top: 96, right: 76, bottom: 56 }
  return { left: 24, top: 150, right: 24, bottom: Math.round(window.innerHeight * 0.45) }
}

interface Ringkas {
  kawasan: Kawasan[]
  tema: Tema
  modePeta: ModePeta
  thresholds: Thresholds
  tigaD: boolean
}

/** Pasang sumber dan layer kita di atas gaya peta dasar. Aman dipanggil berulang. */
function pasang(map: PetaGL, s: Ringkas): void {
  const layers = map.getStyle().layers ?? []
  const sebelumJalan = layers.find((l) => 'source-layer' in l && l['source-layer'] === 'transportation')?.id
  const simbolPertama = layers.find((l) => l.type === 'symbol')?.id
  const bawah = sebelumJalan ?? simbolPertama
  const gelap = s.tema === 'dark'

  if (!map.hasImage(ARSIR)) map.addImage(ARSIR, gambarArsir(s.tema))
  if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: geojsonPeta(s.kawasan), promoteId: 'id' })

  if (!map.getLayer(L_ISI)) {
    map.addLayer(
      {
        id: L_ISI,
        type: 'fill',
        source: SRC,
        paint: {
          'fill-color': warnaIsi(s.modePeta, s.tema, s.thresholds),
          'fill-opacity': ekspr(['case', ['boolean', ['feature-state', 'hover'], false], 0.92, gelap ? 0.78 : 0.7]),
        },
      },
      bawah,
    )
  }
  if (!map.getLayer(L_ARSIR)) {
    map.addLayer({ id: L_ARSIR, type: 'fill', source: SRC, filter: ['==', ['get', 'memadai'], false], paint: { 'fill-pattern': ARSIR } }, bawah)
  }
  if (!map.getLayer(L_GARIS)) {
    map.addLayer(
      {
        id: L_GARIS,
        type: 'line',
        source: SRC,
        paint: {
          'line-color': gelap ? 'rgba(255,255,255,0.3)' : 'rgba(22,22,29,0.26)',
          'line-width': ekspr(['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.3]),
        },
      },
      simbolPertama,
    )
  }
  const tanpaPilihan = ['==', ['get', 'id'], '__tidak_ada__'] as ['==', ['get', string], string]
  if (!map.getLayer(L_PILIH_LUAR)) {
    map.addLayer(
      { id: L_PILIH_LUAR, type: 'line', source: SRC, filter: tanpaPilihan, layout: { 'line-join': 'round' }, paint: { 'line-color': gelap ? '#0d0d12' : '#16161d', 'line-width': 6.5 } },
      simbolPertama,
    )
  }
  if (!map.getLayer(L_PILIH)) {
    map.addLayer(
      { id: L_PILIH, type: 'line', source: SRC, filter: tanpaPilihan, layout: { 'line-join': 'round' }, paint: { 'line-color': '#c6f135', 'line-width': 3 } },
      simbolPertama,
    )
  }
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
          'fill-extrusion-color': gelap ? '#2c2c3a' : '#ffffff',
          'fill-extrusion-height': ekspr(['interpolate', ['linear'], ['zoom'], 13, 0, 14.2, ['coalesce', ['get', 'render_height'], 5]]),
          'fill-extrusion-base': ekspr(['coalesce', ['get', 'render_min_height'], 0]),
          'fill-extrusion-opacity': gelap ? 0.82 : 0.8,
        },
      },
      simbolPertama,
    )
  }
  if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', s.tigaD && map.getLayer(L_BANGUNAN) ? 'none' : 'visible')
}

export default function MapView({ aktif }: { aktif: boolean }) {
  const wadah = useRef<HTMLDivElement>(null)
  const peta = useRef<PetaGL | null>(null)
  const penanda = useRef<Marker | null>(null)
  const temaTerpasang = useRef<Tema>(useApp.getState().tema)
  const modeCadangan = useRef(false)
  const sudahPas = useRef(false)
  const terbangTerakhir = useRef('')
  const [gayaKe, setGayaKe] = useState(0)
  const [cadangan, setCadangan] = useState(false)

  const tema = useApp((s) => s.tema)
  const kawasan = useApp((s) => s.kawasan)
  const versiData = useApp((s) => s.versiData)
  const modePeta = useApp((s) => s.modePeta)
  const thresholds = useApp((s) => s.thresholds)
  const tigaD = useApp((s) => s.tigaD)
  const selection = useApp((s) => s.selection)

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

    // tooltip + sorot saat kursor di atas kawasan
    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '240px' })
    let idSorot: string | null = null
    const lepas = () => {
      if (idSorot !== null && map.getSource(SRC)) map.setFeatureState({ source: SRC, id: idSorot }, { hover: false })
      idSorot = null
      popup.remove()
      map.getCanvas().style.cursor = ''
    }
    map.on('mousemove', L_ISI, (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as { id: string; nama: string; kecamatan: string; laju: number; memadai: boolean }
      if (idSorot !== p.id) {
        if (idSorot !== null) map.setFeatureState({ source: SRC, id: idSorot }, { hover: false })
        idSorot = p.id
        map.setFeatureState({ source: SRC, id: idSorot }, { hover: true })
        const kat = klasifikasi(p.memadai ? p.laju : null, p.memadai, useApp.getState().thresholds)
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
        c.textContent = p.memadai ? `${fmt(p.laju, 1)} cm/tahun, kategori ${LABEL_KATEGORI[kat].toLowerCase()}` : 'Data tidak memadai'
        el.append(a, b, c)
        popup.setDOMContent(el)
      }
      popup.setLngLat(e.lngLat).addTo(map)
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', L_ISI, lepas)

    map.on('click', (e) => {
      useApp.getState().pilihTitik([e.lngLat.lng, e.lngLat.lat], 'peta')
    })

    // jembatan untuk kontrol dan PDF
    jembatanPeta.zoom = (d) => map.easeTo({ zoom: map.getZoom() + d, duration: 300 })
    jembatanPeta.aturUlang = () => {
      const s = useApp.getState()
      const kotak = mergeBBox(s.kawasan.map((k) => k.bbox))
      if (kotak) map.fitBounds([[kotak[0], kotak[1]], [kotak[2], kotak[3]]], { padding: bantalan(), pitch: s.tigaD ? MAP.pitch : 0, bearing: MAP.bearing, duration: 900 })
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

  // ---------- data ----------
  useEffect(() => {
    const map = peta.current
    const src = map?.getSource(SRC) as GeoJSONSource | undefined
    if (!map || !src) return
    src.setData(geojsonPeta(kawasan))
    if (!sudahPas.current && kawasan.length) {
      sudahPas.current = true
      const kotak = mergeBBox(kawasan.map((k) => k.bbox))
      if (kotak && !useApp.getState().selection) {
        map.fitBounds([[kotak[0], kotak[1]], [kotak[2], kotak[3]]], { padding: bantalan(), pitch: tigaD ? MAP.pitch : 0, bearing: MAP.bearing, duration: 0 })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versiData, gayaKe])

  // ---------- warna (mode, ambang, tema) ----------
  useEffect(() => {
    const map = peta.current
    if (!map || !map.getLayer(L_ISI)) return
    map.setPaintProperty(L_ISI, 'fill-color', warnaIsi(modePeta, tema, thresholds))
  }, [modePeta, thresholds, tema, gayaKe])

  // ---------- 2D / 3D ----------
  useEffect(() => {
    const map = peta.current
    if (!map || !map.getLayer(L_ISI)) return
    if (map.getLayer(L_BANGUNAN)) map.setLayoutProperty(L_BANGUNAN, 'visibility', tigaD ? 'visible' : 'none')
    if (map.getLayer('building')) map.setLayoutProperty('building', 'visibility', tigaD && map.getLayer(L_BANGUNAN) ? 'none' : 'visible')
    map.easeTo({ pitch: tigaD ? MAP.pitch : 0, duration: 600 })
  }, [tigaD, gayaKe])

  // ---------- lokasi terpilih: garis sorot, penanda, kamera ----------
  useEffect(() => {
    const map = peta.current
    if (!map || !map.getLayer(L_PILIH)) return
    const filter = ['==', ['get', 'id'], selection?.kawasanId ?? '__tidak_ada__'] as ['==', ['get', string], string]
    map.setFilter(L_PILIH, filter)
    map.setFilter(L_PILIH_LUAR, filter)

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
      map.flyTo({ center: pusat, zoom: Math.max(map.getZoom(), 13.7), pitch: tigaD ? 58 : 0, padding: bantalan(), duration: 1500 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, gayaKe])

  return (
    <div className="absolute inset-0" inert={!aktif}>
      {/* h-full, bukan absolute: CSS MapLibre memaksa position: relative pada kontainer */}
      <div ref={wadah} className="h-full w-full" aria-label="Peta penurunan tanah Kota Semarang" />
      {cadangan && aktif && (
        <div className="pointer-events-none absolute inset-x-0 top-[150px] z-10 flex justify-center px-4 lg:top-[92px]">
          <Notice className="pointer-events-auto max-w-[420px] shadow-pop">
            Peta dasar tidak termuat. Periksa koneksi internet. Data kawasan tetap tampil.
          </Notice>
        </div>
      )}
    </div>
  )
}
