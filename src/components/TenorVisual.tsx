// Visual Proyeksi Tenor: potongan samping berskala tetap (100 cm = 26 px).
// Garis putus = posisi rumah dan tanah sekarang. Rumah terisi = posisi jika tren bertahan.
// Pita violet = rentang ketidakpastian muka tanah baru.
import { fmt } from '../lib/format'
import { hitungProyeksi, kalimatProyeksi, teksProyeksi } from '../lib/risk'
import type { Tenor } from '../lib/types'

const S = 0.26 // px per cm
const Y0 = 122 // muka tanah sekarang
const MAKS_CM = 300 // batas gambar
const GESER = 'transform 700ms cubic-bezier(0.16, 1, 0.3, 1)'

/** Rumah satu lantai berskala: dinding 3 m, atap 1,4 m, pintu 0,9 x 2 m, lebar 6 m. */
function Rumah({ hantu }: { hantu?: boolean }) {
  const x = 126 // di kanan label "Muka tanah sekarang"
  const lebar = 600 * S
  const dinding = 300 * S
  const atap = 140 * S
  const gaya = hantu
    ? { fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1, strokeDasharray: '3 3' }
    : { fill: 'var(--surface)', stroke: 'var(--ink)', strokeWidth: 1.5 }
  return (
    <g strokeLinejoin="round">
      <path d={`M${x - 10},${Y0 - dinding} L${x + lebar / 2},${Y0 - dinding - atap} L${x + lebar + 10},${Y0 - dinding} Z`} {...gaya} />
      <rect x={x} y={Y0 - dinding} width={lebar} height={dinding} {...gaya} />
      {!hantu && (
        <>
          <rect x={x + 26} y={Y0 - 200 * S} width={90 * S} height={200 * S} fill="var(--surface-2)" stroke="var(--ink)" strokeWidth={1.2} />
          <rect x={x + 82} y={Y0 - 220 * S} width={46} height={30} fill="var(--surface-2)" stroke="var(--ink)" strokeWidth={1.2} />
        </>
      )}
    </g>
  )
}

export default function TenorVisual({ laju, sigma, tenor }: { laju: number; sigma: number; tenor: Tenor }) {
  const p = hitungProyeksi(laju, sigma, tenor)
  const px = (cm: number) => Math.min(MAKS_CM, cm) * S
  const yBawah = Y0 + px(p.bawah)
  const yAtas = Y0 + px(p.atas)
  const yTengah = Y0 + px(p.tengah)
  const melebihi = p.atas > MAKS_CM

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
        <rect x={0} y={yTengah} width={300} height={214 - yTengah} fill="var(--surface-2)" style={{ transition: 'y 700ms cubic-bezier(0.16,1,0.3,1), height 700ms cubic-bezier(0.16,1,0.3,1)' }} />

        {/* posisi sekarang */}
        <Rumah hantu />
        <line x1={0} x2={300} y1={Y0} y2={Y0} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={2} y={Y0 - 6} fontSize={10.5} fill="var(--ink-3)">
          Muka tanah sekarang
        </text>

        {/* rentang muka tanah baru */}
        <rect
          x={0}
          y={yBawah}
          width={300}
          height={Math.max(2, yAtas - yBawah)}
          fill="var(--data)"
          opacity={0.22}
          style={{ transition: 'y 700ms cubic-bezier(0.16,1,0.3,1), height 700ms cubic-bezier(0.16,1,0.3,1)' }}
        />
        <g style={{ transform: `translateY(${px(p.tengah)}px)`, transition: GESER }}>
          <line x1={0} x2={300} y1={Y0} y2={Y0} stroke="var(--data)" strokeWidth={2} />
          <Rumah />
        </g>
        <text x={2} y={206} fontSize={10.5} fill="var(--ink-2)">
          Jika tren bertahan, setelah {tenor} tahun
        </text>

        {/* mistar kedalaman */}
        <line x1={318} x2={318} y1={Y0} y2={Y0 + MAKS_CM * S} stroke="var(--line-2)" strokeWidth={1} />
        {[0, 100, 200, 300].map((cm) => (
          <g key={cm}>
            <line x1={314} x2={322} y1={Y0 + cm * S} y2={Y0 + cm * S} stroke="var(--ink-3)" strokeWidth={1} />
            <text x={326} y={Y0 + cm * S + 3.5} fontSize={10} fill="var(--ink-3)" className="tnum">
              {cm}
            </text>
          </g>
        ))}
        <text x={326} y={Y0 - 10} fontSize={10} fill="var(--ink-3)">
          cm
        </text>
      </svg>

      <p className="mt-2 text-[13.5px] leading-snug text-ink">{kalimatProyeksi(p)}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
        Gambar berskala, pintu setinggi 2 m. Seluruh kawasan turun bersama, termasuk jalan dan rumah.
        {melebihi ? ' Proyeksi melebihi batas gambar (300 cm).' : ''}
      </p>
    </div>
  )
}
