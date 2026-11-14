// Halaman "Bandingkan lokasi": sampai MAKS_BANDING titik berdampingan.
// Dengan grid, tiap lokasi dibaca dari blok piksel di sekitar titiknya; tanpa grid, rata-rata kelurahan.
import { useMemo } from 'react'
import { MapTrifold, Trash } from '@phosphor-icons/react'
import { MAKS_BANDING, TENORS } from '../lib/config'
import { fmt } from '../lib/format'
import { lebarBlokM } from '../lib/grid'
import { useLayarKecil } from '../lib/layar'
import { bacaLokasi, kunciTitik, type Bacaan } from '../lib/lokasi'
import { hitungProyeksi, kalimatStatus, klasifikasi, teksLaju, teksProyeksi } from '../lib/risk'
import { navigasi } from '../lib/router'
import { useApp } from '../lib/store'
import type { Kawasan, Proyeksi, TitikBanding } from '../lib/types'
import { Button, Card, Chip, cx, JudulBagian, KategoriBadge, Notice, Segmented, Skeleton } from '../ui/primitives'

const CONTOH = ['Panggung Lor', 'Tlogosari Kulon', 'Tembalang']

interface Baris {
  kunci: string
  t: TitikBanding
  b: Bacaan
  p: Proyeksi | null
}

function skalaRapi(maks: number): number {
  for (const s of [20, 40, 60, 80, 100, 150, 200, 250, 300, 400, 500]) if (maks <= s) return s
  return Math.ceil(maks / 100) * 100
}

/** Garis bantu pada kelipatan 5 yang rapi: 4, 5, atau 3 bagian. */
function tikRapi(maks: number): number[] {
  const n = [4, 5, 3].find((b) => (maks / b) % 5 === 0) ?? 4
  return Array.from({ length: n + 1 }, (_, i) => (maks / n) * i)
}

/** sempit=true (ponsel): nama lokasi di atas batangnya, supaya grafik muat selebar layar tanpa digeser. */
function GrafikRentang({ baris, tenor, sempit }: { baris: Baris[]; tenor: number; sempit: boolean }) {
  const maks = skalaRapi(Math.max(20, ...baris.map((b) => b.p?.atas ?? 0)))
  const lebar = sempit ? 340 : 640
  const kiri = sempit ? 10 : 172
  const kanan = sempit ? 306 : 548
  const tinggiBaris = sempit ? 54 : 40
  const x = (cm: number) => kiri + (cm / maks) * (kanan - kiri)
  const tinggi = baris.length * tinggiBaris + 30
  return (
    <svg viewBox={`0 0 ${lebar} ${tinggi}`} className="block w-full" role="img" aria-label={`Rentang proyeksi penurunan selama ${tenor} tahun untuk ${baris.length} lokasi, dalam cm`}>
      <defs>
        <pattern id="arsir-banding" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--nodata)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeWidth="1.2" />
        </pattern>
      </defs>
      {tikRapi(maks).map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={4} y2={tinggi - 22} stroke="var(--line)" strokeWidth={1} />
          <text x={x(v)} y={tinggi - 6} textAnchor="middle" fontSize={11} fill="var(--ink-3)" className="tnum">
            {fmt(v)}
          </text>
        </g>
      ))}
      <text x={kanan + (sempit ? 14 : 10)} y={tinggi - 6} fontSize={11} fill="var(--ink-3)">
        cm
      </text>
      {baris.map(({ kunci, t, p }, i) => {
        const nama = t.label
        if (sempit) {
          const y = 8 + i * tinggiBaris
          return (
            <g key={kunci} tabIndex={0} className="outline-offset-2" aria-label={p ? `${nama}: ${teksProyeksi(p)}, nilai tengah ${fmt(p.tengah)} cm` : `${nama}: data tidak memadai`}>
              <text x={kiri} y={y + 12} fontSize={13} fontWeight={600} fill="var(--ink)">
                {nama.length > 30 ? `${nama.slice(0, 29)}...` : nama}
              </text>
              <text x={lebar - 4} y={y + 12} textAnchor="end" fontSize={12.5} fontWeight={700} fill="var(--ink)">
                {p ? teksProyeksi(p) : 'tidak memadai'}
              </text>
              {p ? (
                <>
                  <rect x={x(p.bawah)} y={y + 22} width={Math.max(3, x(p.atas) - x(p.bawah))} height={12} rx={6} fill="var(--data)" opacity={0.28} />
                  <circle cx={x(p.tengah)} cy={y + 28} r={5} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
                </>
              ) : (
                <rect x={kiri} y={y + 22} width={120} height={12} rx={6} fill="url(#arsir-banding)" />
              )}
            </g>
          )
        }
        const y = 12 + i * 40
        return (
          <g key={kunci} tabIndex={0} className="outline-offset-2" aria-label={p ? `${nama}: ${teksProyeksi(p)}, nilai tengah ${fmt(p.tengah)} cm` : `${nama}: data tidak memadai`}>
            <title>{p ? `${nama}: bawah ${fmt(p.bawah)} cm, tengah ${fmt(p.tengah)} cm, atas ${fmt(p.atas)} cm` : `${nama}: data tidak memadai`}</title>
            <text x={kiri - 12} y={y + 12} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--ink)">
              {nama.length > 20 ? `${nama.slice(0, 19)}...` : nama}
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
  const grid = useApp((s) => s.grid)
  const versiGrid = useApp((s) => s.versiGrid)
  const banding = useApp((s) => s.banding)
  const tenor = useApp((s) => s.tenor)
  const setTenor = useApp((s) => s.setTenor)
  const thresholds = useApp((s) => s.thresholds)
  const toggleBanding = useApp((s) => s.toggleBanding)
  const kosongkan = useApp((s) => s.kosongkanBanding)
  const pilihTitik = useApp((s) => s.pilihTitik)
  const jenis = useApp((s) => s.meta?.jenis)
  const sempit = useLayarKecil()

  const titik = !!grid
  const baris = useMemo<Baris[]>(
    () =>
      banding.flatMap((t) => {
        const b = bacaLokasi(t.lngLat, kawasan, grid)
        if (!b) return []
        const k = b.data
        return [{ kunci: kunciTitik(t.lngLat), t, b, p: k.memadai && k.laju != null ? hitungProyeksi(k.laju, k.sigma ?? 0, tenor) : null }]
      }),
    // versiGrid: deret dan grid bisa berganti tanpa mengubah identitas daftar kawasan
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [banding, kawasan, grid, versiGrid, tenor],
  )
  const perKecamatan = useMemo(() => {
    const m = new Map<string, Kawasan[]>()
    for (const k of kawasan) m.set(k.kecamatan, [...(m.get(k.kecamatan) ?? []), k])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([kec, list]) => [kec, list.sort((a, b) => a.nama.localeCompare(b.nama))] as const)
  }, [kawasan])

  const penuh = banding.length >= MAKS_BANDING
  const terpakai = new Set(banding.map((t) => kunciTitik(t.lngLat)))
  const berdata = baris.filter((b) => b.p).sort((a, b) => a.p!.tengah - b.p!.tengah)
  const terendah = berdata[0]
  const tertinggi = berdata[berdata.length - 1]
  // dari daftar kelurahan: dengan grid yang dibaca adalah blok piksel di pusat kelurahan
  const titikKelurahan = (k: Kawasan): TitikBanding => ({ lngLat: k.pusat, label: titik ? `Pusat Kelurahan ${k.nama}` : `Kelurahan ${k.nama}` })
  const tambahKelurahan = (id: string) => {
    const k = kawasan.find((x) => x.id === id)
    if (k) toggleBanding(titikKelurahan(k))
  }
  const bukaDiPeta = (t: TitikBanding) => {
    pilihTitik(t.lngLat, 'banding', t.label)
    navigasi('peta')
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-2 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight text-ink md:text-[34px]">Bandingkan lokasi</h1>
      <p className="mt-1 max-w-[65ch] text-[15px] text-ink-2">Lihat laju dan Proyeksi Tenor beberapa lokasi berdampingan.</p>
      {jenis === 'demo' && (
        <Notice nada="demo" className="mt-4 max-w-[720px]">
          <strong>Data demo ilustratif.</strong> Angka di halaman ini belum berasal dari pengukuran.
        </Notice>
      )}

      <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-ink-3">Tenor KPR</div>
          <Segmented label="Tenor KPR" nilai={tenor} onUbah={setTenor} opsi={TENORS.map((t) => ({ nilai: t, label: `${t} tahun` }))} />
        </div>
        <div className="min-w-0 sm:min-w-[220px]">
          <label htmlFor="tambah-kawasan" className="mb-1.5 block text-[12.5px] font-medium text-ink-3">
            {titik ? 'Tambah pusat kelurahan' : 'Tambah kawasan'} {penuh ? `(maksimal ${MAKS_BANDING})` : ''}
          </label>
          <select
            id="tambah-kawasan"
            value=""
            disabled={penuh || status !== 'siap'}
            onChange={(e) => e.target.value && tambahKelurahan(e.target.value)}
            className="h-11 w-full rounded-[12px] border border-line-2 bg-surface px-3 text-[14px] text-ink disabled:opacity-50"
          >
            <option value="">Pilih kelurahan</option>
            {perKecamatan.map(([kec, list]) => (
              <optgroup key={kec} label={kec}>
                {list.map((k) => (
                  <option key={k.id} value={k.id} disabled={terpakai.has(kunciTitik(k.pusat))}>
                    {k.nama}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {baris.length > 0 && (
          <Button varian="ghost" className="justify-self-start" onClick={kosongkan} ikon={<Trash size={17} />}>
            Kosongkan
          </Button>
        )}
      </div>
      {titik && <p className="mt-2 max-w-[65ch] text-[12.5px] text-ink-3">Untuk membandingkan titik tertentu, buka laporannya di peta lalu tekan Bandingkan.</p>}

      {status === 'memuat' && <Skeleton className="mt-6 h-56 w-full" />}

      {status === 'siap' && baris.length === 0 && (
        <Card className="mt-6 p-6 md:p-8">
          <h2 className="text-[19px] font-bold text-ink">Belum ada lokasi yang dibandingkan</h2>
          <p className="mt-2 max-w-[60ch] text-[14.5px] leading-relaxed text-ink-2">
            Buka sebuah laporan di peta lalu tekan tombol Bandingkan, atau tambahkan dari pilihan di atas. Anda bisa membandingkan sampai {MAKS_BANDING} lokasi.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CONTOH.map((nama) => {
              const k = kawasan.find((x) => x.nama === nama)
              return k ? (
                <Chip key={nama} onClick={() => toggleBanding(titikKelurahan(k))}>
                  Tambah {nama}
                </Chip>
              ) : null
            })}
          </div>
        </Card>
      )}

      {baris.length > 0 && (
        <>
          <div className={cx('mt-6 grid grid-cols-1 gap-4', baris.length === 1 ? 'md:grid-cols-1' : baris.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
            {baris.map(({ kunci, t, b }) => {
              const k = b.data
              const kat = klasifikasi(k.laju, k.memadai, thresholds)
              const ada = k.memadai && k.laju != null
              return (
                <Card key={kunci} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[18px] font-bold text-ink">{t.label}</h2>
                      <p className="text-[13px] text-ink-2">
                        {titik ? `Kelurahan ${b.kelurahan.nama}, ` : ''}Kecamatan {b.kelurahan.kecamatan}
                      </p>
                    </div>
                    <KategoriBadge kategori={kat} className="shrink-0" />
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[30px] font-bold leading-none tracking-tight text-ink">{ada ? teksLaju(Math.max(0, k.laju!), k.sigma) : 'Data tidak memadai'}</span>
                    {ada && <span className="text-[13px] text-ink-3">cm/tahun</span>}
                  </div>
                  <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{kalimatStatus(k.laju, k.sigma, kat, titik)}</p>
                  <table className="mt-4 w-full text-[13.5px]">
                    <caption className="mb-1 text-left text-[12.5px] font-semibold text-ink-2">Proyeksi Tenor</caption>
                    <tbody>
                      {TENORS.map((tn) => (
                        <tr key={tn} className={cx('border-t border-line', tn === tenor && 'bg-surface-2 font-bold')}>
                          <th scope="row" className="px-2 py-1.5 text-left font-[inherit] text-ink-2">
                            {tn} tahun
                          </th>
                          <td className="tnum px-2 py-1.5 text-right text-ink">{ada ? teksProyeksi(hitungProyeksi(k.laju!, k.sigma ?? 0, tn)) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-auto flex gap-2 pt-4">
                    <Button ukuran="sm" onClick={() => bukaDiPeta(t)} ikon={<MapTrifold size={16} />}>
                      Lihat di peta
                    </Button>
                    <Button ukuran="sm" varian="ghost" onClick={() => toggleBanding(t)}>
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
            <div className={cx('mt-3', !sempit && 'overflow-x-auto')}>
              <div className={cx(!sempit && 'min-w-[520px]')}>
                <GrafikRentang baris={baris} tenor={tenor} sempit={sempit} />
              </div>
            </div>
            {berdata.length >= 2 && terendah && tertinggi && (
              <p className="mt-3 text-[14px] leading-snug text-ink">
                Proyeksi tengah terendah: {terendah.t.label} ({teksProyeksi(terendah.p!)}). Tertinggi: {tertinggi.t.label} ({teksProyeksi(tertinggi.p!)}).
              </p>
            )}
          </Card>

          <Notice className="mt-4 max-w-[720px]">
            {titik
              ? `Tiap angka menggambarkan blok sekitar ${lebarBlokM(grid)} m di sekitar titiknya, bukan satu bangunan. Selalu dibaca jika tren bertahan.`
              : 'Perbandingan ini bersifat kawasan, bukan per bangunan. Selalu dibaca jika tren bertahan.'}
          </Notice>
        </>
      )}
    </div>
  )
}
