// Visual Proyeksi Tenor: potongan samping. Garis putus = rumah dan tanah sekarang.
// Rumah terisi = posisi jika tren bertahan. Pita violet = rentang ketidakpastian muka tanah baru.
//
// Skala ditentukan dari proyeksi tenor TERPANJANG di lokasi ini, bukan tenor yang dipilih, supaya
// mengganti tenor menggeser rumah pada skala yang sama. Bila penurunan cukup besar, gambar berskala
// nyata (100 cm = 26 px, pintu 2 m). Bila terlalu kecil untuk terlihat, sumbu tegak diperbesar dan
// rumah menjadi ikon tidak berskala; keterangan dan mistar menyebutkannya.
import { TENORS } from '../lib/config'
import { fmt } from '../lib/format'
import { hitungProyeksi, kalimatProyeksi, teksProyeksi } from '../lib/risk'
import type { Tenor } from '../lib/types'

const S_NYATA = 0.26 // px per cm pada skala nyata
const Y0 = 122 // muka tanah sekarang
const DALAM_PX = 78 // tinggi area di bawah muka tanah sampai batas gambar
const MIN_NYATA_PX = 26 // proyeksi terpanjang di bawah ini (100 cm) terlalu kecil untuk skala nyata
const FAKTOR = [2, 5, 10, 20, 50, 100] // pembesaran bertingkat supaya mudah dibaca dan dibandingkan
const EASE = '700ms cubic-bezier(0.16, 1, 0.3, 1)'

/** Langkah mistar yang rapi (1, 2, 5 x 10^n) untuk rentang tertentu. */
function langkahRapi(rentang: number): number {
  const kasar = rentang / 3
  const pangkat = 10 ** Math.floor(Math.log10(kasar))
  const n = kasar / pangkat
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pangkat
}

/** Skala px per cm untuk satu lokasi. Diperbesar bertingkat bila proyeksi terpanjang di bawah 1 m,
 *  dengan faktor terbesar yang masih memuat proyeksi terpanjang di dalam gambar. */
export function skalaTenor(laju: number, sigma: number): { s: number; perbesar: number } {
  const terpanjang = hitungProyeksi(laju, sigma, Math.max(...TENORS) as Tenor).atas * S_NYATA
  if (terpanjang >= MIN_NYATA_PX) return { s: S_NYATA, perbesar: 1 }
  const f = [...FAKTOR].reverse().find((x) => terpanjang * x <= DALAM_PX) ?? FAKTOR[0]!
  return { s: S_NYATA * f, perbesar: f }
}

/** Rumah satu lantai. Pada skala nyata: dinding 3 m, atap 1,4 m, pintu 0,9 x 2 m, lebar 6 m. */
function Rumah({ hantu }: { hantu?: boolean }) {
  const x = 126 // di kanan label "Muka tanah sekarang"
  const lebar = 600 * S_NYATA
  const dinding = 300 * S_NYATA
  const atap = 140 * S_NYATA
  const gaya = hantu
    ? { fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '3 3' }
    : { fill: 'var(--surface)', stroke: 'var(--ink)', strokeWidth: 1.5 }
  return (
    <g strokeLinejoin="round">
      <path d={`M${x - 10},${Y0 - dinding} L${x + lebar / 2},${Y0 - dinding - atap} L${x + lebar + 10},${Y0 - dinding} Z`} {...gaya} />
      <rect x={x} y={Y0 - dinding} width={lebar} height={dinding} {...gaya} />
      {!hantu && (
        <>
          <rect x={x + 26} y={Y0 - 200 * S_NYATA} width={90 * S_NYATA} height={200 * S_NYATA} fill="var(--surface-2)" stroke="var(--ink)" strokeWidth={1.2} />
          <rect x={x + 82} y={Y0 - 220 * S_NYATA} width={46} height={30} fill="var(--surface-2)" stroke="var(--ink)" strokeWidth={1.2} />
        </>
      )}
    </g>
  )
}

export default function TenorVisual({ laju, sigma, tenor }: { laju: number; sigma: number; tenor: Tenor }) {
  const p = hitungProyeksi(laju, sigma, tenor)
  const { s, perbesar } = skalaTenor(laju, sigma)
  const maksCm = DALAM_PX / s
  const px = (cm: number) => Math.min(maksCm, Math.max(0, cm)) * s
  const geserTengah = px(p.tengah)
  const atasBand = px(p.bawah)
  const tinggiBand = Math.max(2, px(p.atas) - px(p.bawah))
  const melebihi = p.atas > maksCm
  const langkah = langkahRapi(maksCm)
  const tanda: number[] = []
  for (let v = 0; v <= maksCm + 1e-9; v += langkah) tanda.push(Math.round(v * 1000) / 1000)
  // Semua gerak memakai CSS transform: transisinya berjalan di semua peramban, tidak seperti atribut y/height SVG
  const gerak = (y: number) => ({ transform: `translateY(${y}px)`, transition: `transform ${EASE}` })

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[36px] font-bold leading-none tracking-tight text-ink">{teksProyeksi(p)}</div>
          <div className="mt-1.5 text-[13px] text-ink-2">
            dalam {tenor} tahun, nilai tengah {fmt(p.tengah)} cm
          </div>
        </div>
      </div>

      <svg viewBox="0 0 360 214" className="mt-3 block w-full" role="img" aria-label={kalimatProyeksi(p)}>
        {/* tanah di bawah muka tanah baru */}
        <rect x={0} y={Y0} width={300} height={214 - Y0} fill="var(--surface-2)" style={gerak(geserTengah)} />

        {/* posisi sekarang */}
        <Rumah hantu />
        <line x1={0} x2={300} y1={Y0} y2={Y0} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={2} y={Y0 - 6} fontSize={10.5} fill="var(--ink-3)">
          Muka tanah sekarang
        </text>

        {/* rentang muka tanah baru: persegi 1 px yang digeser lalu ditarik setinggi rentangnya */}
        <rect
          x={0}
          y={Y0}
          width={300}
          height={1}
          fill="var(--data)"
          opacity={0.22}
          style={{ transform: `translateY(${atasBand}px) scaleY(${tinggiBand})`, transformBox: 'fill-box', transformOrigin: 'top', transition: `transform ${EASE}` }}
        />
        <g data-geser={geserTengah.toFixed(1)} style={gerak(geserTengah)}>
          <line x1={0} x2={300} y1={Y0} y2={Y0} stroke="var(--data)" strokeWidth={2} />
          <Rumah />
        </g>
        <text x={2} y={206} fontSize={10.5} fill="var(--ink-2)">
          Jika tren bertahan, setelah {tenor} tahun
        </text>

        {/* mistar kedalaman, mengikuti skala */}
        <line x1={318} x2={318} y1={Y0} y2={Y0 + DALAM_PX} stroke="var(--line-2)" strokeWidth={1} />
        {tanda.map((cm) => (
          <g key={cm}>
            <line x1={314} x2={322} y1={Y0 + cm * s} y2={Y0 + cm * s} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={326} y={Y0 + cm * s + 3.5} fontSize={10} fill="var(--ink-3)" className="tnum">
              {fmt(cm, cm > 0 && cm < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        <text x={326} y={Y0 - 10} fontSize={10} fill="var(--ink-3)">
          cm
        </text>
      </svg>

      <p className="mt-2 text-[13.5px] leading-snug text-ink">{kalimatProyeksi(p)}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
        {perbesar > 1
          ? `Penurunan di sini kecil, jadi sumbu tegak diperbesar ${fmt(perbesar)} kali supaya terlihat. Rumah hanya ikon, tidak berskala. Baca angkanya pada mistar di kanan.`
          : 'Gambar berskala, pintu setinggi 2 m. Seluruh kawasan turun bersama, termasuk jalan dan rumah.'}
        {melebihi ? ` Proyeksi melebihi batas gambar (${fmt(maksCm)} cm).` : ''}
      </p>
    </div>
  )
}
