// Grafik riwayat: perpindahan kumulatif (cm) dari deret waktu satelit.
// Satu seri, satu sumbu, garis 2px + sapuan tipis, titik akhir berlabel,
// garis bidik saat kursor/keyboard, dan tabel sebagai padanan.
import { useMemo, useState } from 'react'
import { fmt } from '../lib/format'

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** Tahun desimal -> "Feb 2020". Dibulatkan ke bawah: 2020,125 (pertengahan Februari) adalah Februari. */
export function labelWaktu(t: number): string {
  const tahun = Math.floor(t + 1e-6)
  const bulan = Math.min(11, Math.max(0, Math.floor((t - tahun) * 12 + 1e-6)))
  return `${BULAN[bulan]} ${tahun}`
}

/** Satu baris per tahun (epoch pertama tiap tahun) ditambah titik terakhir. Epoch tidak harus jatuh di awal tahun. */
export function barisTahunan(deret: [number, number][]): [number, number][] {
  const hasil: [number, number][] = []
  let tahunLalu = Number.NEGATIVE_INFINITY
  deret.forEach((d, i) => {
    const tahun = Math.floor(d[0] + 1e-6)
    if (tahun !== tahunLalu || i === deret.length - 1) hasil.push(d)
    tahunLalu = tahun
  })
  return hasil
}

function langkahRapi(rentang: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200]) if (rentang / s <= 4) return s
  return 500
}

const W = 360
const H = 156
const M = { l: 34, r: 52, t: 12, b: 24 }

export default function HistoryChart({ deret }: { deret: [number, number][] }) {
  const [aktif, setAktif] = useState<number | null>(null)

  const g = useMemo(() => {
    // data unggahan tanpa deret: jangan hitung apa pun (hook tetap dipanggil, hasilnya null)
    if (deret.length < 2) return null
    const t0 = deret[0]![0]
    const t1 = deret[deret.length - 1]![0]
    const vMin = Math.min(...deret.map((d) => d[1]))
    const vMax = Math.max(0, ...deret.map((d) => d[1]))
    const langkah = langkahRapi(Math.max(2, vMax - vMin))
    const yBawah = Math.min(-langkah, Math.floor(vMin / langkah) * langkah)
    const yAtas = Math.ceil(vMax / langkah) * langkah
    const x = (t: number) => M.l + ((t - t0) / Math.max(1e-9, t1 - t0)) * (W - M.l - M.r)
    const y = (v: number) => M.t + ((yAtas - v) / (yAtas - yBawah)) * (H - M.t - M.b)
    const titik = deret.map((d) => [x(d[0]), y(d[1])] as const)
    const garis = titik.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
    const luas = `${garis}L${titik[titik.length - 1]![0].toFixed(1)},${y(0).toFixed(1)}L${titik[0]![0].toFixed(1)},${y(0).toFixed(1)}Z`
    const tikY: number[] = []
    for (let v = yAtas; v >= yBawah - 1e-9; v -= langkah) tikY.push(v)
    const tikX: number[] = []
    for (let th = Math.ceil(t0); th <= t1; th += 2) tikX.push(th)
    return { x, y, titik, garis, luas, tikY, tikX }
  }, [deret])

  if (!g) return <p className="text-[13px] text-ink-3">Deret waktu tidak tersedia di data ini.</p>

  const akhir = deret[deret.length - 1]!
  const tAkhir = g.titik[g.titik.length - 1]!
  const pilih = aktif !== null ? deret[aktif]! : null
  const tPilih = aktif !== null ? g.titik[aktif]! : null

  const dariPointer = (e: React.PointerEvent<SVGRectElement>) => {
    const kotak = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - kotak.left) / kotak.width) * (W - M.l - M.r) + M.l
    let terdekat = 0
    let jarak = Infinity
    g.titik.forEach((p, i) => {
      const d = Math.abs(p[0] - px)
      if (d < jarak) {
        jarak = d
        terdekat = i
      }
    })
    setAktif(terdekat)
  }

  const tahunan = barisTahunan(deret)

  return (
    <div>
      <div className="flex h-5 items-baseline justify-between text-[12.5px]" aria-live="off">
        {pilih ? (
          <span>
            <strong className="font-bold text-ink">{fmt(pilih[1], 1)} cm</strong> <span className="text-ink-3">{labelWaktu(pilih[0])}</span>
          </span>
        ) : (
          <span className="text-ink-3">Perpindahan kumulatif (cm). Negatif = turun.</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 block w-full touch-none select-none rounded-[10px] outline-offset-4"
        role="img"
        tabIndex={0}
        aria-label={`Grafik riwayat: dari ${labelWaktu(deret[0]![0])} sampai ${labelWaktu(akhir[0])}, perpindahan kumulatif ${fmt(akhir[1], 1)} cm. Gunakan panah kiri dan kanan untuk membaca tiap titik.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setAktif((i) => Math.min(deret.length - 1, (i ?? -1) + 1))
          else if (e.key === 'ArrowLeft') setAktif((i) => Math.max(0, (i ?? deret.length) - 1))
          else if (e.key === 'Escape') setAktif(null)
          else return
          e.preventDefault()
        }}
        onBlur={() => setAktif(null)}
      >
        {g.tikY.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={g.y(v)} y2={g.y(v)} stroke={v === 0 ? 'var(--line-2)' : 'var(--line)'} strokeWidth={1} />
            <text x={M.l - 6} y={g.y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)" className="tnum">
              {fmt(v)}
            </text>
          </g>
        ))}
        {g.tikX.map((th) => (
          <text key={th} x={g.x(th)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)" className="tnum">
            {th}
          </text>
        ))}
        <path d={g.luas} fill="var(--data)" opacity={0.1} />
        <path d={g.garis} fill="none" stroke="var(--data)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={tAkhir[0]} cy={tAkhir[1]} r={4} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
        <text x={tAkhir[0] + 8} y={tAkhir[1] + 4} fontSize={11.5} fontWeight={700} fill="var(--ink)">
          {fmt(akhir[1], 0)} cm
        </text>
        {tPilih && (
          <g pointerEvents="none">
            <line x1={tPilih[0]} x2={tPilih[0]} y1={M.t} y2={H - M.b} stroke="var(--ink-3)" strokeWidth={1} />
            <circle cx={tPilih[0]} cy={tPilih[1]} r={4.5} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={M.l}
          y={0}
          width={W - M.l - M.r}
          height={H - M.b}
          fill="transparent"
          onPointerMove={dariPointer}
          onPointerDown={dariPointer}
          onPointerLeave={() => setAktif(null)}
        />
      </svg>
      <details className="mt-2 text-[12.5px] text-ink-2">
        <summary className="cursor-pointer select-none font-medium text-ink-2 hover:text-ink">Lihat angka per tahun</summary>
        <table className="tnum mt-2 w-full text-left">
          <thead>
            <tr className="text-ink-3">
              <th scope="col" className="py-1 font-medium">
                Waktu
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Kumulatif (cm)
              </th>
            </tr>
          </thead>
          <tbody>
            {tahunan.map((d) => (
              <tr key={d[0]} className="border-t border-line">
                <td className="py-1">{labelWaktu(d[0])}</td>
                <td className="py-1 text-right">{fmt(d[1], 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
