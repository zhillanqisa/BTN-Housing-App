// Dashboard kawasan (tampilan institusi): pra-skrining banyak lokasi sekaligus.
// Satu baris filter di atas; semua angka, grafik, dan tabel dihitung dari irisan yang sama.
import { useMemo, useState } from 'react'
import { ArrowCounterClockwise, ArrowDown, ArrowUp, DownloadSimple, MapTrifold } from '@phosphor-icons/react'
import { LABEL_KATEGORI, TENORS, THRESHOLD_LIMITS, URUTAN_KATEGORI } from '../lib/config'
import { keDataset, unduhBerkas } from '../lib/data'
import { fmt } from '../lib/format'
import { normal } from '../lib/geocode'
import { hitungProyeksi, klasifikasi, teksProyeksi } from '../lib/risk'
import { navigasi } from '../lib/router'
import { useApp } from '../lib/store'
import type { Kategori, Kawasan, Proyeksi, Tenor } from '../lib/types'
import { Button, Card, cx, JudulBagian, KategoriBadge, Notice, Segmented, Skeleton, Stat, Swatch, warnaKategori } from '../ui/primitives'

interface Baris {
  k: Kawasan
  kategori: Kategori
  p: Proyeksi | null
}
type Kunci = 'nama' | 'kecamatan' | 'laju' | 'sigma' | 'proyeksi' | 'kategori' | 'nPiksel' | 'koherensi'

function median(a: number[]): number | null {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function buatCSV(baris: Baris[], tenor: Tenor, jenis: string): string {
  const d = (n: number | null | undefined, dig = 1) => (n == null ? '' : n.toFixed(dig).replace('.', ','))
  const sel = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const kepala = 'id;kawasan;kecamatan;laju_cm_th;ketidakpastian_cm_th;proyeksi_bawah_cm;proyeksi_tengah_cm;proyeksi_atas_cm;tenor_th;kategori;n_piksel;koherensi;jenis_data'
  const isi = baris.map(({ k, kategori, p }) =>
    [k.id, sel(k.nama), sel(k.kecamatan), d(k.laju), d(k.sigma), d(p?.bawah, 0), d(p?.tengah, 0), d(p?.atas, 0), String(tenor), LABEL_KATEGORI[kategori], String(k.nPiksel), d(k.koherensi, 2), jenis].join(';'),
  )
  return `${String.fromCharCode(0xfeff)}${[kepala, ...isi].join('\n')}\n`
}

function nilai(b: Baris, kunci: Kunci): number | string | null {
  switch (kunci) {
    case 'nama':
      return b.k.nama
    case 'kecamatan':
      return b.k.kecamatan
    case 'laju':
      return b.k.laju
    case 'sigma':
      return b.k.sigma
    case 'proyeksi':
      return b.p?.tengah ?? null
    case 'kategori':
      return URUTAN_KATEGORI.indexOf(b.kategori)
    case 'nPiksel':
      return b.k.nPiksel
    default:
      return b.k.koherensi
  }
}

function SebaranKategori({ n, total }: { n: Record<Kategori, number>; total: number }) {
  return (
    <div>
      <div className="flex h-7 gap-[2px]" role="img" aria-label={URUTAN_KATEGORI.map((k) => `${LABEL_KATEGORI[k]} ${n[k]}`).join(', ')}>
        {URUTAN_KATEGORI.filter((k) => n[k] > 0).map((k) => (
          <div
            key={k}
            title={`${LABEL_KATEGORI[k]}: ${n[k]} kawasan (${fmt((n[k] / total) * 100)}%)`}
            className={cx('min-w-[4px] rounded-[4px]', k === 'tidak-memadai' && 'hatch')}
            style={{ flexGrow: n[k], flexBasis: 0, ...(k === 'tidak-memadai' ? {} : { background: warnaKategori(k) }) }}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        {URUTAN_KATEGORI.map((k) => (
          <li key={k} className="flex items-center gap-2 text-ink">
            <Swatch kategori={k} />
            <span className="min-w-0 truncate">{LABEL_KATEGORI[k]}</span>
            <span className="tnum ml-auto font-bold">{n[k]}</span>
            <span className="tnum w-9 text-right text-ink-3">{total ? fmt((n[k] / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RentangKecamatan({ data }: { data: { nama: string; min: number; med: number; max: number; n: number }[] }) {
  const maks = Math.max(2, Math.ceil(Math.max(...data.map((d) => d.max)) / 2) * 2)
  const kiri = 150
  const kanan = 540
  const x = (v: number) => kiri + (v / maks) * (kanan - kiri)
  const tinggi = data.length * 24 + 26
  const tik = [0, maks / 4, maks / 2, (maks * 3) / 4, maks]
  return (
    <svg viewBox={`0 0 560 ${tinggi}`} className="block w-full" role="img" aria-label="Rentang laju per kecamatan: garis dari terendah ke tertinggi, titik pada median, dalam cm per tahun">
      {tik.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={2} y2={tinggi - 20} stroke="var(--line)" strokeWidth={1} />
          <text x={x(v)} y={tinggi - 5} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)" className="tnum">
            {fmt(v, v % 1 ? 1 : 0)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const y = 12 + i * 24
        return (
          <g key={d.nama} tabIndex={0} className="outline-offset-2" aria-label={`${d.nama}: terendah ${fmt(d.min, 1)}, median ${fmt(d.med, 1)}, tertinggi ${fmt(d.max, 1)} cm per tahun, ${d.n} kawasan`}>
            <title>{`${d.nama}: terendah ${fmt(d.min, 1)}, median ${fmt(d.med, 1)}, tertinggi ${fmt(d.max, 1)} cm/tahun (${d.n} kawasan)`}</title>
            <rect x={0} y={y - 11} width={560} height={22} fill="transparent" />
            <text x={kiri - 10} y={y + 4} textAnchor="end" fontSize={12} fill="var(--ink)">
              {d.nama} <tspan fill="var(--ink-3)">({d.n})</tspan>
            </text>
            <line x1={x(d.min)} x2={Math.max(x(d.max), x(d.min) + 2)} y1={y} y2={y} stroke="var(--data)" strokeWidth={3} strokeLinecap="round" opacity={0.35} />
            <circle cx={x(d.med)} cy={y} r={4.5} fill="var(--data)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )
      })}
    </svg>
  )
}

export default function DashboardView() {
  const status = useApp((s) => s.status)
  const kawasan = useApp((s) => s.kawasan)
  const thresholds = useApp((s) => s.thresholds)
  const setThresholds = useApp((s) => s.setThresholds)
  const resetThresholds = useApp((s) => s.resetThresholds)
  const tenor = useApp((s) => s.tenor)
  const setTenor = useApp((s) => s.setTenor)
  const meta = useApp((s) => s.meta)
  const pilihKawasan = useApp((s) => s.pilihKawasan)
  const muatDemo = useApp((s) => s.muatDemo)

  const [kec, setKec] = useState('')
  const [kat, setKat] = useState<Set<Kategori>>(() => new Set(URUTAN_KATEGORI))
  const [cari, setCari] = useState('')
  const [sortir, setSortir] = useState<{ kunci: Kunci; naik: boolean }>({ kunci: 'laju', naik: false })
  const [pilih, setPilih] = useState<Set<string>>(() => new Set())

  const semua = useMemo<Baris[]>(
    () =>
      kawasan.map((k) => ({
        k,
        kategori: klasifikasi(k.laju, k.memadai, thresholds),
        p: k.memadai && k.laju != null ? hitungProyeksi(k.laju, k.sigma ?? 0, tenor) : null,
      })),
    [kawasan, thresholds, tenor],
  )
  const daftarKec = useMemo(() => [...new Set(kawasan.map((k) => k.kecamatan))].sort((a, b) => a.localeCompare(b)), [kawasan])
  const irisan = useMemo(() => {
    const q = normal(cari)
    return semua.filter((b) => (!kec || b.k.kecamatan === kec) && kat.has(b.kategori) && (!q || normal(b.k.nama).includes(q)))
  }, [semua, kec, kat, cari])

  const ringkas = useMemo(() => {
    const berdata = irisan.filter((b) => b.p)
    const n: Record<Kategori, number> = { rendah: 0, sedang: 0, tinggi: 0, 'tidak-memadai': 0 }
    for (const b of irisan) n[b.kategori]++
    const urut = [...berdata].sort((a, b) => b.k.laju! - a.k.laju!)
    const perKec = new Map<string, number[]>()
    for (const b of berdata) perKec.set(b.k.kecamatan, [...(perKec.get(b.k.kecamatan) ?? []), b.k.laju!])
    const kecamatan = [...perKec.entries()]
      .map(([nama, v]) => ({ nama, min: Math.min(...v), med: median(v)!, max: Math.max(...v), n: v.length }))
      .sort((a, b) => b.med - a.med)
    return { berdata: berdata.length, n, med: median(berdata.map((b) => b.k.laju!)), teratas: urut.slice(0, 10), kecamatan }
  }, [irisan])

  const tabel = useMemo(() => {
    const arah = sortir.naik ? 1 : -1
    return [...irisan].sort((a, b) => {
      const x = nilai(a, sortir.kunci)
      const y = nilai(b, sortir.kunci)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number)) * arah
    })
  }, [irisan, sortir])

  const bukaDiPeta = (id: string) => {
    pilihKawasan(id, 'dashboard')
    navigasi('peta')
  }
  const aturUlang = () => {
    setKec('')
    setKat(new Set(URUTAN_KATEGORI))
    setCari('')
  }
  const dipilih = tabel.filter((b) => pilih.has(b.k.id))
  const untukCSV = dipilih.length ? dipilih : tabel
  const teratasMaks = ringkas.teratas[0]?.k.laju ?? 1
  const kelasKontrol = 'h-11 rounded-[12px] border border-line-2 bg-surface px-3 text-[14px] text-ink'

  const Kepala = ({ kunci, label, kanan }: { kunci: Kunci; label: string; kanan?: boolean }) => {
    const aktif = sortir.kunci === kunci
    return (
      <th scope="col" aria-sort={aktif ? (sortir.naik ? 'ascending' : 'descending') : 'none'} className={cx('sticky top-0 z-[1] bg-surface px-3 py-2.5 font-medium', kanan && 'text-right')}>
        <button
          type="button"
          onClick={() => setSortir((s) => ({ kunci, naik: s.kunci === kunci ? !s.naik : kunci === 'nama' || kunci === 'kecamatan' }))}
          className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] hover:text-ink', aktif ? 'text-ink' : 'text-ink-3')}
        >
          {label}
          {aktif && (sortir.naik ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />)}
        </button>
      </th>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-2 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight text-ink md:text-[34px]">Dashboard kawasan</h1>
      <p className="mt-1 max-w-[65ch] text-[15px] text-ink-2">Pra-skrining banyak lokasi sekaligus untuk pengembang dan lembaga pembiayaan.</p>
      {meta?.jenis === 'demo' && (
        <Notice nada="demo" className="mt-4 max-w-[720px]">
          <strong>Data demo ilustratif.</strong> Semua angka di halaman ini belum berasal dari pengukuran.
        </Notice>
      )}

      {status === 'memuat' && <Skeleton className="mt-6 h-72 w-full" />}
      {status === 'gagal' && (
        <Card className="mt-6 p-6">
          <p className="text-[14.5px] text-ink">Data kawasan gagal dimuat.</p>
          <Button className="mt-3" onClick={() => void muatDemo()} ikon={<ArrowCounterClockwise size={17} />}>
            Muat ulang data
          </Button>
        </Card>
      )}

      {status === 'siap' && (
        <>
          {/* satu baris filter untuk semua yang ada di bawahnya */}
          <div className="mt-6 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="f-kec" className="mb-1.5 block text-[12.5px] font-medium text-ink-3">
                Kecamatan
              </label>
              <select id="f-kec" value={kec} onChange={(e) => setKec(e.target.value)} className={cx(kelasKontrol, 'min-w-[190px]')}>
                <option value="">Semua kecamatan</option>
                {daftarKec.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-cari" className="mb-1.5 block text-[12.5px] font-medium text-ink-3">
                Cari nama kawasan
              </label>
              <input id="f-cari" value={cari} onChange={(e) => setCari(e.target.value)} className={cx(kelasKontrol, 'w-[200px]')} autoComplete="off" />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-medium text-ink-3">Kategori</legend>
              <div className="flex flex-wrap gap-1.5">
                {URUTAN_KATEGORI.map((k) => {
                  const on = kat.has(k)
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setKat((s) => {
                          const n = new Set(s)
                          if (n.has(k)) n.delete(k)
                          else n.add(k)
                          return n
                        })
                      }
                      className={cx(
                        'inline-flex h-11 items-center gap-2 rounded-[12px] border px-3 text-[13px] font-semibold transition-colors',
                        on ? 'border-ink bg-surface text-ink' : 'border-line-2 bg-transparent text-ink-3 line-through',
                      )}
                    >
                      <Swatch kategori={k} />
                      {LABEL_KATEGORI[k]}
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <div>
              <div className="mb-1.5 text-[12.5px] font-medium text-ink-3">Tenor KPR</div>
              <Segmented label="Tenor KPR" nilai={tenor} onUbah={setTenor} opsi={TENORS.map((t) => ({ nilai: t, label: `${t} th` }))} />
            </div>
            <Button varian="ghost" onClick={aturUlang} ikon={<ArrowCounterClockwise size={17} />}>
              Atur ulang
            </Button>
          </div>

          {irisan.length === 0 ? (
            <Card className="mt-6 p-8 text-center">
              <p className="text-[16px] font-bold text-ink">Tidak ada kawasan yang cocok dengan filter.</p>
              <p className="mt-1 text-[14px] text-ink-2">Longgarkan filter atau kembalikan ke awal.</p>
              <Button className="mt-4" onClick={aturUlang}>
                Atur ulang filter
              </Button>
            </Card>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card className="p-5">
                  <Stat label="Kawasan dengan data memadai" nilai={fmt(ringkas.berdata)} satuan={`dari ${fmt(irisan.length)}`} />
                </Card>
                <Card className="p-5">
                  <Stat label="Kategori tinggi" nilai={fmt(ringkas.n.tinggi)} satuan="kawasan" />
                </Card>
                <Card className="p-5">
                  <Stat label="Median laju" nilai={ringkas.med == null ? '-' : fmt(ringkas.med, 1)} satuan="cm/tahun" />
                </Card>
                <Card className="p-5">
                  <Stat
                    label="Laju tertinggi"
                    nilai={ringkas.teratas[0] ? fmt(ringkas.teratas[0].k.laju!, 1) : '-'}
                    satuan="cm/tahun"
                    catatan={ringkas.teratas[0] ? `Kelurahan ${ringkas.teratas[0].k.nama}` : undefined}
                  />
                </Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <JudulBagian>Sebaran kategori</JudulBagian>
                  <div className="mt-4">
                    <SebaranKategori n={ringkas.n} total={irisan.length} />
                  </div>
                </Card>
                <Card className="p-5">
                  <JudulBagian
                    kanan={
                      <Button ukuran="sm" varian="ghost" onClick={resetThresholds}>
                        Kembalikan ambang awal
                      </Button>
                    }
                  >
                    Uji sensitivitas ambang
                  </JudulBagian>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {(['sedang', 'tinggi'] as const).map((nama) => (
                      <div key={nama}>
                        <label htmlFor={`ambang-${nama}`} className="flex items-baseline justify-between text-[12.5px] font-medium text-ink-2">
                          Ambang {nama} (cm/tahun)
                          <span className="tnum text-[15px] font-bold text-ink">{fmt(thresholds[nama], 1)}</span>
                        </label>
                        <input
                          id={`ambang-${nama}`}
                          type="range"
                          min={THRESHOLD_LIMITS.min}
                          max={THRESHOLD_LIMITS.max}
                          step={THRESHOLD_LIMITS.step}
                          value={thresholds[nama]}
                          onChange={(e) => setThresholds({ ...thresholds, [nama]: Number(e.target.value) })}
                          className="mt-2 w-full accent-[var(--ink)]"
                        />
                      </div>
                    ))}
                  </div>
                  <Notice className="mt-3">Ambang kategori masih asumsi awal. Geser untuk melihat seberapa peka hasilnya. Perubahan juga berlaku di peta.</Notice>
                </Card>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <JudulBagian>Laju per kecamatan</JudulBagian>
                  <p className="mt-1 text-[12.5px] text-ink-3">Garis = terendah sampai tertinggi. Titik = median. Satuan cm/tahun.</p>
                  <div className="mt-3">{ringkas.kecamatan.length ? <RentangKecamatan data={ringkas.kecamatan} /> : <p className="text-[13.5px] text-ink-2">Tidak ada kawasan berdata di irisan ini.</p>}</div>
                </Card>
                <Card className="p-5">
                  <JudulBagian>10 kawasan dengan laju tertinggi</JudulBagian>
                  <p className="mt-1 text-[12.5px] text-ink-3">Satuan cm/tahun. Klik baris untuk membukanya di peta.</p>
                  <ol className="mt-3 space-y-0.5">
                    {ringkas.teratas.map(({ k }) => (
                      <li key={k.id}>
                        <button type="button" onClick={() => bukaDiPeta(k.id)} className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-3 rounded-[10px] px-2 py-1.5 text-left hover:bg-surface-2">
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-ink">{k.nama}</span>
                            <span className="block truncate text-[11.5px] text-ink-3">{k.kecamatan}</span>
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-3 rounded-r-[4px] bg-data" style={{ width: `${Math.max(2, (k.laju! / teratasMaks) * 78)}%` }} />
                            <span className="tnum text-[12.5px] font-bold text-ink">{fmt(k.laju!, 1)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>

              <Card className="mt-4 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 p-5 pb-3">
                  <div className="mr-auto">
                    <JudulBagian>Daftar kawasan</JudulBagian>
                    <p className="tnum mt-0.5 text-[12.5px] text-ink-3">
                      {fmt(tabel.length)} kawasan{dipilih.length ? `, ${fmt(dipilih.length)} dipilih` : ''}
                    </p>
                  </div>
                  <Button
                    ukuran="sm"
                    title={dipilih.length ? 'Unduh baris yang dipilih' : 'Unduh semua baris yang tampil'}
                    onClick={() => unduhBerkas(`pantau-ambles-pra-skrining-${new Date().toISOString().slice(0, 10)}.csv`, buatCSV(untukCSV, tenor, meta?.jenis ?? ''), 'text/csv;charset=utf-8')}
                    ikon={<DownloadSimple size={16} />}
                  >
                    Unduh CSV{dipilih.length ? ` (${dipilih.length})` : ''}
                  </Button>
                  <Button
                    ukuran="sm"
                    onClick={() => meta && unduhBerkas('pantau-ambles-kawasan.geojson', JSON.stringify(keDataset(tabel.map((b) => b.k), meta)), 'application/geo+json')}
                    ikon={<DownloadSimple size={16} />}
                  >
                    Unduh GeoJSON
                  </Button>
                </div>
                <div className="scroll-thin max-h-[560px] overflow-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="sticky top-0 z-[1] w-10 bg-surface px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label="Pilih semua baris"
                            checked={tabel.length > 0 && dipilih.length === tabel.length}
                            onChange={(e) => setPilih(e.target.checked ? new Set(tabel.map((b) => b.k.id)) : new Set())}
                            className="size-4 accent-[var(--ink)]"
                          />
                        </th>
                        <Kepala kunci="nama" label="Kawasan" />
                        <Kepala kunci="kecamatan" label="Kecamatan" />
                        <Kepala kunci="laju" label="Laju (cm/th)" kanan />
                        <Kepala kunci="sigma" label="± (cm/th)" kanan />
                        <Kepala kunci="proyeksi" label={`Proyeksi ${tenor} th (cm)`} kanan />
                        <Kepala kunci="kategori" label="Kategori" />
                        <Kepala kunci="nPiksel" label="Piksel" kanan />
                        <Kepala kunci="koherensi" label="Koherensi" kanan />
                        <th scope="col" className="sticky top-0 z-[1] bg-surface px-3 py-2.5">
                          <span className="sr-only">Aksi</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tabel.map(({ k, kategori, p }) => (
                        <tr key={k.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${k.nama}`}
                              checked={pilih.has(k.id)}
                              onChange={() =>
                                setPilih((s) => {
                                  const n = new Set(s)
                                  if (n.has(k.id)) n.delete(k.id)
                                  else n.add(k.id)
                                  return n
                                })
                              }
                              className="size-4 accent-[var(--ink)]"
                            />
                          </td>
                          <th scope="row" className="px-3 py-2 font-semibold text-ink">
                            {k.nama}
                          </th>
                          <td className="px-3 py-2 text-ink-2">{k.kecamatan}</td>
                          <td className="tnum px-3 py-2 text-right text-ink">{k.laju == null ? '-' : fmt(k.laju, 1)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{k.sigma == null ? '-' : fmt(k.sigma, 1)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink">{p ? teksProyeksi(p).replace(' cm', '') : '-'}</td>
                          <td className="px-3 py-2">
                            <KategoriBadge kategori={kategori} />
                          </td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{fmt(k.nPiksel)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{k.koherensi == null ? '-' : fmt(k.koherensi, 2)}</td>
                          <td className="px-3 py-2 text-right">
                            <button type="button" onClick={() => bukaDiPeta(k.id)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-ink-2 hover:bg-surface hover:text-ink" aria-label={`Lihat ${k.nama} di peta`}>
                              <MapTrifold size={15} aria-hidden="true" />
                              Peta
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
