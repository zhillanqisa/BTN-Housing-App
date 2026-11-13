// Halaman "Bandingkan lokasi": sampai MAKS_BANDING kawasan berdampingan.
import { useMemo } from 'react'
import { MapTrifold, Trash } from '@phosphor-icons/react'
import { MAKS_BANDING, TENORS } from '../lib/config'
import { fmt } from '../lib/format'
import { hitungProyeksi, kalimatStatus, klasifikasi, teksLaju, teksProyeksi } from '../lib/risk'
import { navigasi } from '../lib/router'
import { useApp } from '../lib/store'
import type { Kawasan, Proyeksi } from '../lib/types'
import { Button, Card, Chip, cx, JudulBagian, KategoriBadge, Notice, Segmented, Skeleton } from '../ui/primitives'

const CONTOH = ['Panggung Lor', 'Tlogosari Kulon', 'Tembalang']

function skalaRapi(maks: number): number {
  for (const s of [20, 40, 60, 80, 100, 150, 200, 250, 300, 400, 500]) if (maks <= s) return s
  return Math.ceil(maks / 100) * 100
}

function GrafikRentang({ baris, tenor }: { baris: { k: Kawasan; p: Proyeksi | null }[]; tenor: number }) {
  const maks = skalaRapi(Math.max(20, ...baris.map((b) => b.p?.atas ?? 0)))
  const kiri = 172
  const kanan = 548
  const x = (cm: number) => kiri + (cm / maks) * (kanan - kiri)
  const tinggi = baris.length * 40 + 30
  return (
    <svg viewBox={`0 0 640 ${tinggi}`} className="block w-full" role="img" aria-label={`Rentang proyeksi penurunan selama ${tenor} tahun untuk ${baris.length} kawasan, dalam cm`}>
      <defs>
        <pattern id="arsir-banding" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--nodata)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeWidth="1.2" />
        </pattern>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={x(maks * f)} x2={x(maks * f)} y1={4} y2={tinggi - 22} stroke="var(--line)" strokeWidth={1} />
          <text x={x(maks * f)} y={tinggi - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)" className="tnum">
            {fmt(maks * f)}
          </text>
        </g>
      ))}
      <text x={kanan + 10} y={tinggi - 6} fontSize={11} fill="var(--ink-3)">
        cm
      </text>
      {baris.map(({ k, p }, i) => {
        const y = 12 + i * 40
        return (
          <g key={k.id} tabIndex={0} className="outline-offset-2" aria-label={p ? `${k.nama}: ${teksProyeksi(p)}, nilai tengah ${fmt(p.tengah)} cm` : `${k.nama}: data tidak memadai`}>
            <title>{p ? `${k.nama}: bawah ${fmt(p.bawah)} cm, tengah ${fmt(p.tengah)} cm, atas ${fmt(p.atas)} cm` : `${k.nama}: data tidak memadai`}</title>
            <text x={kiri - 12} y={y + 12} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--ink)">
              {k.nama.length > 20 ? `${k.nama.slice(0, 19)}...` : k.nama}
            </text>
            {p ? (
              <>
                <rect x={x(p.bawah)} y={y + 2} width={Math.max(3, x(p.atas) - x(p.bawah))} height={12} rx={6} fill="var(--data)" opacity={0.28} />
                <circle cx={x(p.tengah)} cy={y + 8} r={5} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
                <text x={Math.min(x(p.atas) + 10, kanan + 6)} y={y + 12} fontSize={12.5} fontWeight={700} fill="var(--ink)">
                  {teksProyeksi(p)}
                </text>
              </>
            ) : (
              <>
                <rect x={kiri} y={y + 2} width={120} height={12} rx={6} fill="url(#arsir-banding)" />
                <text x={kiri + 130} y={y + 12} fontSize={12.5} fill="var(--ink-2)">
                  data tidak memadai
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function CompareView() {
  const status = useApp((s) => s.status)
  const kawasan = useApp((s) => s.kawasan)
  const banding = useApp((s) => s.banding)
  const tenor = useApp((s) => s.tenor)
  const setTenor = useApp((s) => s.setTenor)
  const thresholds = useApp((s) => s.thresholds)
  const toggleBanding = useApp((s) => s.toggleBanding)
  const kosongkan = useApp((s) => s.kosongkanBanding)
  const pilihKawasan = useApp((s) => s.pilihKawasan)
  const jenis = useApp((s) => s.meta?.jenis)

  const dipilih = useMemo(() => banding.map((id) => kawasan.find((k) => k.id === id)).filter((k): k is Kawasan => !!k), [banding, kawasan])
  const baris = useMemo(
    () => dipilih.map((k) => ({ k, p: k.memadai && k.laju != null ? hitungProyeksi(k.laju, k.sigma ?? 0, tenor) : null })),
    [dipilih, tenor],
  )
  const perKecamatan = useMemo(() => {
    const m = new Map<string, Kawasan[]>()
    for (const k of kawasan) m.set(k.kecamatan, [...(m.get(k.kecamatan) ?? []), k])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([kec, list]) => [kec, list.sort((a, b) => a.nama.localeCompare(b.nama))] as const)
  }, [kawasan])

  const penuh = banding.length >= MAKS_BANDING
  const berdata = baris.filter((b) => b.p).sort((a, b) => a.p!.tengah - b.p!.tengah)
  const terendah = berdata[0]
  const tertinggi = berdata[berdata.length - 1]
  const bukaDiPeta = (id: string) => {
    pilihKawasan(id, 'banding')
    navigasi('peta')
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-2 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight text-ink md:text-[34px]">Bandingkan lokasi</h1>
      <p className="mt-1 max-w-[65ch] text-[15px] text-ink-2">Lihat laju dan Proyeksi Tenor beberapa kawasan berdampingan.</p>
      {jenis === 'demo' && (
        <Notice nada="demo" className="mt-4 max-w-[720px]">
          <strong>Data demo ilustratif.</strong> Angka di halaman ini belum berasal dari pengukuran.
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-ink-3">Tenor KPR</div>
          <Segmented label="Tenor KPR" nilai={tenor} onUbah={setTenor} opsi={TENORS.map((t) => ({ nilai: t, label: `${t} tahun` }))} />
        </div>
        <div className="min-w-[220px]">
          <label htmlFor="tambah-kawasan" className="mb-1.5 block text-[12.5px] font-medium text-ink-3">
            Tambah kawasan {penuh ? `(maksimal ${MAKS_BANDING})` : ''}
          </label>
          <select
            id="tambah-kawasan"
            value=""
            disabled={penuh || status !== 'siap'}
            onChange={(e) => e.target.value && toggleBanding(e.target.value)}
            className="h-11 w-full rounded-[12px] border border-line-2 bg-surface px-3 text-[14px] text-ink disabled:opacity-50"
          >
            <option value="">Pilih kelurahan</option>
            {perKecamatan.map(([kec, list]) => (
              <optgroup key={kec} label={kec}>
                {list.map((k) => (
                  <option key={k.id} value={k.id} disabled={banding.includes(k.id)}>
                    {k.nama}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {dipilih.length > 0 && (
          <Button varian="ghost" onClick={kosongkan} ikon={<Trash size={17} />}>
            Kosongkan
          </Button>
        )}
      </div>

      {status === 'memuat' && <Skeleton className="mt-6 h-56 w-full" />}

      {status === 'siap' && dipilih.length === 0 && (
        <Card className="mt-6 p-6 md:p-8">
          <h2 className="text-[19px] font-bold text-ink">Belum ada lokasi yang dibandingkan</h2>
          <p className="mt-2 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">
            Tambahkan kawasan dari pilihan di atas, atau buka sebuah laporan di peta lalu tekan tombol Bandingkan. Anda bisa membandingkan sampai {MAKS_BANDING} kawasan.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CONTOH.map((nama) => {
              const k = kawasan.find((x) => x.nama === nama)
              return k ? (
                <Chip key={nama} onClick={() => toggleBanding(k.id)}>
                  Tambah {nama}
                </Chip>
              ) : null
            })}
          </div>
        </Card>
      )}

      {dipilih.length > 0 && (
        <>
          <div className={cx('mt-6 grid gap-4', dipilih.length === 1 ? 'md:grid-cols-1' : dipilih.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
            {dipilih.map((k) => {
              const kat = klasifikasi(k.laju, k.memadai, thresholds)
              const ada = k.memadai && k.laju != null
              return (
                <Card key={k.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[18px] font-bold text-ink">Kelurahan {k.nama}</h2>
                      <p className="text-[13px] text-ink-2">Kecamatan {k.kecamatan}</p>
                    </div>
                    <KategoriBadge kategori={kat} className="shrink-0" />
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[30px] font-bold leading-none tracking-tight text-ink">{ada ? teksLaju(k.laju, k.sigma) : 'Data tidak memadai'}</span>
                    {ada && <span className="text-[13px] text-ink-3">cm/tahun</span>}
                  </div>
                  <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{kalimatStatus(k.laju, k.sigma, kat)}</p>
                  <table className="mt-4 w-full text-[13.5px]">
                    <caption className="mb-1 text-left text-[12.5px] font-semibold text-ink-2">Proyeksi Tenor</caption>
                    <tbody>
                      {TENORS.map((t) => (
                        <tr key={t} className={cx('border-t border-line', t === tenor && 'bg-surface-2 font-bold')}>
                          <th scope="row" className="px-2 py-1.5 text-left font-[inherit] text-ink-2">
                            {t} tahun
                          </th>
                          <td className="tnum px-2 py-1.5 text-right text-ink">{ada ? teksProyeksi(hitungProyeksi(k.laju!, k.sigma ?? 0, t)) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-auto flex gap-2 pt-4">
                    <Button ukuran="sm" onClick={() => bukaDiPeta(k.id)} ikon={<MapTrifold size={16} />}>
                      Lihat di peta
                    </Button>
                    <Button ukuran="sm" varian="ghost" onClick={() => toggleBanding(k.id)}>
                      Hapus
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>

          <Card className="mt-4 p-5">
            <JudulBagian>Proyeksi selama {tenor} tahun</JudulBagian>
            <p className="mt-1 text-[12.5px] text-ink-3">Batang = rentang dari ketidakpastian laju. Titik = nilai tengah.</p>
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[520px]">
                <GrafikRentang baris={baris} tenor={tenor} />
              </div>
            </div>
            {berdata.length >= 2 && terendah && tertinggi && (
              <p className="mt-3 text-[14px] leading-snug text-ink">
                Proyeksi tengah terendah: Kelurahan {terendah.k.nama} ({teksProyeksi(terendah.p!)}). Tertinggi: Kelurahan {tertinggi.k.nama} ({teksProyeksi(tertinggi.p!)}).
              </p>
            )}
          </Card>

          <Notice className="mt-4 max-w-[720px]">Perbandingan ini bersifat kawasan, bukan per bangunan. Selalu dibaca jika tren bertahan.</Notice>
        </>
      )}
    </div>
  )
}
