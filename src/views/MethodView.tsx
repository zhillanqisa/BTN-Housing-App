// Halaman "Data & metode": dari mana angkanya, cara membacanya, batasannya,
// dan tempat mengganti data demo dengan data tim (CSV / GeoJSON).
import { useRef, useState, type ReactNode } from 'react'
import { ArrowCounterClockwise, ArrowRight, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import { BATASAN, LABEL_KATEGORI, PRINSIP, TENORS, URUTAN_KATEGORI } from '../lib/config'
import { keDataset, unduhBerkas } from '../lib/data'
import { fmt, fmtPeriode, fmtTanggal } from '../lib/format'
import { imporCSV, imporGeoJSON, templatCSV, type HasilImpor } from '../lib/importer'
import { hitungProyeksi, kalimatProyeksi } from '../lib/risk'
import { navigasi } from '../lib/router'
import { useApp } from '../lib/store'
import type { Kategori, Tenor } from '../lib/types'
import { Button, Card, Chip, cx, Notice, Segmented, Skeleton, Swatch } from '../ui/primitives'

const BAGIAN = [
  ['status', 'Status data'],
  ['kategori', 'Kategori'],
  ['proyeksi', 'Proyeksi Tenor'],
  ['alur', 'Alur olah data'],
  ['sumber', 'Sumber data'],
  ['batasan', 'Batasan'],
  ['ganti-data', 'Ganti data'],
] as const

const ALUR: { judul: string; isi: string; sudah?: boolean }[] = [
  { judul: 'Citra radar Sentinel-1', isi: 'Citra satelit radar gratis yang melintas tiap beberapa hari. Dicari lewat ASF Vertex.' },
  { judul: 'Interferogram', isi: 'Pasangan citra dibandingkan untuk melihat perubahan jarak ke permukaan tanah. Diolah di ASF HyP3 (pasangan small baseline).' },
  { judul: 'Deret waktu SBAS', isi: 'Banyak interferogram disusun menjadi laju dan riwayat per piksel dengan MintPy.' },
  { judul: 'Koreksi atmosfer dan titik referensi stabil', isi: 'Gangguan atmosfer dikurangi (GACOS atau ERA5). Acuan dipilih di area stabil dekat stasiun CSEM.' },
  { judul: 'Gerak garis pandang menjadi vertikal', isi: 'Bila hanya satu lintasan yang dipakai, berlaku asumsi gerak dominan vertikal.' },
  { judul: 'Validasi dengan GNSS dan publikasi', isi: 'Hasil dibandingkan dengan dataset GNSS Pantura (Susilo dkk. 2023) dan angka penelitian terdahulu.' },
  { judul: 'Agregasi per kelurahan', isi: 'Median, jumlah piksel, dan sebaran per kelurahan. Koherensi rendah ditandai data tidak memadai.' },
  { judul: 'Kategori dan Proyeksi Tenor', isi: 'Laju dikelompokkan dengan ambang terbuka, lalu diproyeksikan selama tenor KPR.', sudah: true },
  { judul: 'Ekspor ke web (GeoJSON)', isi: 'Satu file per kota yang dibaca langsung oleh aplikasi ini.', sudah: true },
]

const SUMBER: [string, string, 'Dipakai' | 'Rencana' | 'Perlu dicek'][] = [
  ['Batas kelurahan (OpenStreetMap)', 'Unit kawasan', 'Dipakai'],
  ['Peta dasar (OpenFreeMap, OpenMapTiles)', 'Tampilan peta', 'Dipakai'],
  ['Pencarian alamat (Nominatim)', 'Cari lokasi', 'Dipakai'],
  ['Sentinel-1 lewat ASF HyP3', 'Laju penurunan', 'Rencana'],
  ['GNSS CORS Pantura (Susilo dkk. 2023)', 'Validasi', 'Rencana'],
  ['DEMNAS atau Copernicus DEM', 'Konteks elevasi', 'Rencana'],
  ['Genangan rob dan pasang surut', 'Konteks rob', 'Perlu dicek'],
  ['Tata ruang (GISTARU)', 'Konteks kawasan', 'Perlu dicek'],
  ['Peta geologi 1:100.000', 'Penjelasan penyebab', 'Perlu dicek'],
]

const ARTI: Record<Kategori, string> = {
  rendah: 'Perubahan kecil. Tetap lakukan pemeriksaan standar sebelum akad.',
  sedang: 'Ada penurunan yang perlu ditanyakan ke pengembang: elevasi lantai dan jenis pondasi.',
  tinggi: 'Penurunan cepat. Perlu pemeriksaan lebih dalam dan rencana adaptasi.',
  'tidak-memadai': 'Satelit belum bisa mengukur di sini. Bukan berarti aman, bukan berarti berisiko.',
}

function Pil({ teks }: { teks: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-[11.5px] font-semibold',
        teks === 'Dipakai' || teks === 'Sudah di demo'
          ? 'border-transparent bg-ink text-surface'
          : teks === 'Perlu dicek'
            ? 'border-notice-line bg-notice-bg text-notice-ink'
            : 'border-line-2 text-ink-2',
      )}
    >
      {teks}
    </span>
  )
}

function Bagian({ id, judul, children }: { id: string; judul: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-28 p-5 md:p-7">
      <h2 className="text-[20px] font-bold tracking-tight text-ink">{judul}</h2>
      <div className="mt-3 max-w-[72ch] space-y-3 text-[14.5px] leading-relaxed text-ink-2">{children}</div>
    </Card>
  )
}

function Kalkulator() {
  const [laju, setLaju] = useState('5')
  const [sigma, setSigma] = useState('1')
  const [tenor, setTenor] = useState<Tenor>(15)
  const l = Number(laju.replace(',', '.'))
  const s = Number(sigma.replace(',', '.'))
  const sah = Number.isFinite(l) && Number.isFinite(s) && l >= 0 && s >= 0 && laju !== '' && sigma !== ''
  const p = sah ? hitungProyeksi(l, s, tenor) : null
  const kelasInput = 'h-11 w-full rounded-[12px] border border-line-2 bg-surface px-3 text-[14px] text-ink'
  return (
    <div className="rounded-[16px] bg-surface-2 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="kalk-laju" className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
            Laju penurunan (cm/tahun)
          </label>
          <input id="kalk-laju" inputMode="decimal" value={laju} onChange={(e) => setLaju(e.target.value)} className={kelasInput} />
        </div>
        <div>
          <label htmlFor="kalk-sigma" className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
            Ketidakpastian ± (cm/tahun)
          </label>
          <input id="kalk-sigma" inputMode="decimal" value={sigma} onChange={(e) => setSigma(e.target.value)} className={kelasInput} />
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-ink-2">Tenor KPR</div>
          <Segmented label="Tenor KPR" penuh nilai={tenor} onUbah={setTenor} opsi={TENORS.map((t) => ({ nilai: t, label: `${t} th` }))} />
        </div>
      </div>
      {p ? (
        <div className="mt-4">
          <dl className="tnum grid grid-cols-3 gap-3 text-ink">
            {(
              [
                ['Batas bawah', p.bawah],
                ['Proyeksi tengah', p.tengah],
                ['Batas atas', p.atas],
              ] as const
            ).map(([nama, v]) => (
              <div key={nama}>
                <dt className="text-[12px] text-ink-3">{nama}</dt>
                <dd className="text-[22px] font-bold tracking-tight">
                  {fmt(v)} <span className="text-[12px] font-medium text-ink-3">cm</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[14.5px] font-semibold text-ink">{kalimatProyeksi(p)}</p>
        </div>
      ) : (
        <p className="mt-4 text-[13.5px] text-ink-2">Isi laju dan ketidakpastian dengan angka nol atau lebih.</p>
      )}
    </div>
  )
}

function GantiData() {
  const kawasan = useApp((s) => s.kawasan)
  const meta = useApp((s) => s.meta)
  const pakaiDataset = useApp((s) => s.pakaiDataset)
  const muatDemo = useApp((s) => s.muatDemo)
  const [hasil, setHasil] = useState<{ nama: string; h: HasilImpor } | null>(null)
  const [terpakai, setTerpakai] = useState(false)
  const [seret, setSeret] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const baca = async (f: File | undefined) => {
    if (!f) return
    setTerpakai(false)
    if (f.size > 20 * 1024 * 1024) return setHasil({ nama: f.name, h: { ok: false, galat: ['Ukuran file melebihi 20 MB.'] } })
    try {
      const teks = await f.text()
      setHasil({ nama: f.name, h: /\.csv$/i.test(f.name) ? imporCSV(teks, kawasan, meta, f.name) : imporGeoJSON(teks, f.name) })
    } catch {
      setHasil({ nama: f.name, h: { ok: false, galat: ['File tidak bisa dibaca.'] } })
    }
  }

  return (
    <>
      <p>
        Hasil olah tim bisa langsung menggantikan data demo. Unggah GeoJSON lengkap, atau CSV yang berisi laju per kelurahan. CSV digabung ke batas kelurahan yang sedang dimuat.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setSeret(true)
        }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSeret(false)
          void baca(e.dataTransfer.files[0])
        }}
        className={cx('rounded-[16px] border-2 border-dashed p-6 text-center transition-colors', seret ? 'border-ink bg-surface-2' : 'border-line-2')}
      >
        <UploadSimple size={26} className="mx-auto text-ink-3" aria-hidden="true" />
        <p className="mt-2 text-[14.5px] font-semibold text-ink">Seret file ke sini, atau pilih dari komputer</p>
        <p className="mt-1 text-[12.5px] text-ink-3">Format .geojson, .json, atau .csv. File diproses di peramban Anda dan tidak dikirim ke server.</p>
        <input
          ref={input}
          type="file"
          accept=".geojson,.json,.csv"
          className="sr-only"
          aria-label="Pilih file data"
          onChange={(e) => {
            void baca(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button varian="primary" className="mt-4" onClick={() => input.current?.click()} ikon={<UploadSimple size={17} />}>
          Pilih file
        </Button>
      </div>

      {hasil && !hasil.h.ok && (
        <div role="alert" className="rounded-[12px] border border-notice-line bg-notice-bg p-4 text-[13.5px] text-notice-ink">
          <p className="font-bold">{hasil.nama} tidak bisa dipakai</p>
          <ul className="mt-1 list-disc pl-5">
            {hasil.h.galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {hasil && hasil.h.ok && (
        <div className="rounded-[16px] bg-surface-2 p-4 text-[13.5px] text-ink">
          <p className="font-bold">{terpakai ? `${hasil.nama} sedang dipakai` : `Pratinjau ${hasil.nama}`}</p>
          <dl className="tnum mt-2 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-[12px] text-ink-3">Baris dibaca</dt>
              <dd className="text-[20px] font-bold">{fmt(hasil.h.ringkasan.total)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">Cocok dengan kelurahan</dt>
              <dd className="text-[20px] font-bold">{fmt(hasil.h.ringkasan.cocok)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-3">Data memadai</dt>
              <dd className="text-[20px] font-bold">{fmt(hasil.h.ringkasan.memadai)}</dd>
            </div>
          </dl>
          {hasil.h.ringkasan.takCocok.length > 0 && <p className="mt-2 text-ink-2">Tidak cocok: {hasil.h.ringkasan.takCocok.join(', ')}.</p>}
          {hasil.h.peringatan.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-ink-2">
              {hasil.h.peringatan.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {terpakai ? (
              <Button varian="accent" onClick={() => navigasi('peta')} ikon={<ArrowRight size={17} />}>
                Lihat di peta
              </Button>
            ) : (
              <>
                <Button
                  varian="primary"
                  onClick={() => {
                    if (hasil.h.ok) pakaiDataset(hasil.h.dataset)
                    setTerpakai(true)
                  }}
                >
                  Pakai data ini
                </Button>
                <Button varian="ghost" onClick={() => setHasil(null)}>
                  Batal
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button ukuran="sm" onClick={() => unduhBerkas('templat-pantau-ambles.csv', templatCSV(kawasan), 'text/csv;charset=utf-8')} ikon={<DownloadSimple size={16} />} disabled={!kawasan.length}>
          Unduh templat CSV
        </Button>
        <Button
          ukuran="sm"
          onClick={() => meta && unduhBerkas('pantau-ambles-kawasan.geojson', JSON.stringify(keDataset(kawasan, meta)), 'application/geo+json')}
          ikon={<DownloadSimple size={16} />}
          disabled={!kawasan.length || !meta}
        >
          Unduh data saat ini (GeoJSON)
        </Button>
        {meta && meta.jenis !== 'demo' && (
          <Button
            ukuran="sm"
            varian="ghost"
            onClick={() => {
              setHasil(null)
              void muatDemo()
            }}
            ikon={<ArrowCounterClockwise size={16} />}
          >
            Kembali ke data demo
          </Button>
        )}
      </div>
      <p className="text-[13px]">
        Kolom CSV: <code className="font-mono text-[12.5px] text-ink">id</code> atau <code className="font-mono text-[12.5px] text-ink">nama</code> (tambah{' '}
        <code className="font-mono text-[12.5px] text-ink">kecamatan</code> bila nama kelurahan kembar), <code className="font-mono text-[12.5px] text-ink">laju</code> dalam cm/tahun dengan nilai positif berarti turun,{' '}
        <code className="font-mono text-[12.5px] text-ink">sigma</code> untuk ketidakpastian. Opsional: <code className="font-mono text-[12.5px] text-ink">n_piksel</code>,{' '}
        <code className="font-mono text-[12.5px] text-ink">koherensi</code>, <code className="font-mono text-[12.5px] text-ink">memadai</code>.
      </p>
    </>
  )
}

export default function MethodView() {
  const status = useApp((s) => s.status)
  const meta = useApp((s) => s.meta)
  const kawasan = useApp((s) => s.kawasan)
  const t = useApp((s) => s.thresholds)
  const memadai = kawasan.filter((k) => k.memadai).length
  const aturan: Record<Kategori, string> = {
    rendah: `Di bawah ${fmt(t.sedang, 1)} cm/tahun`,
    sedang: `${fmt(t.sedang, 1)} sampai di bawah ${fmt(t.tinggi, 1)} cm/tahun`,
    tinggi: `Mulai ${fmt(t.tinggi, 1)} cm/tahun`,
    'tidak-memadai': 'Koherensi rendah atau piksel terlalu sedikit',
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-2 md:px-8">
      <h1 className="text-[28px] font-bold tracking-tight text-ink md:text-[34px]">Data & metode</h1>
      <p className="mt-1 max-w-[65ch] text-[15px] text-ink-2">Dari mana angkanya, cara membacanya, dan apa batasannya.</p>
      <nav aria-label="Bagian halaman" className="mt-5 flex flex-wrap gap-2">
        {BAGIAN.map(([id, label]) => (
          <Chip key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {label}
          </Chip>
        ))}
      </nav>

      <div className="mt-6 space-y-4">
        <Bagian id="status" judul="Status data saat ini">
          {status === 'memuat' && <Skeleton className="h-24 w-full" />}
          {meta && (
            <>
              {meta.jenis === 'demo' && (
                <Notice nada="demo">
                  <strong>Data demo ilustratif.</strong> {meta.catatan}
                </Notice>
              )}
              {meta.jenis === 'unggahan' && <Notice>Anda sedang memakai data unggahan. Data ini hanya ada di peramban Anda dan hilang saat halaman dimuat ulang.</Notice>}
              {meta.jenis === 'olahan' && <Notice>Data ini ditandai sebagai hasil olah tim.</Notice>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[14px]">
                <dt className="text-ink-3">Judul</dt>
                <dd className="text-ink">{meta.judul}</dd>
                <dt className="text-ink-3">Wilayah</dt>
                <dd className="text-ink">{meta.wilayah}</dd>
                {meta.periode[0] && meta.periode[1] && (
                  <>
                    <dt className="text-ink-3">Periode</dt>
                    <dd className="text-ink">
                      {fmtPeriode(meta.periode[0])} sampai {fmtPeriode(meta.periode[1])}
                    </dd>
                  </>
                )}
                {meta.dibuat && (
                  <>
                    <dt className="text-ink-3">Dibuat</dt>
                    <dd className="text-ink">{fmtTanggal(meta.dibuat)}</dd>
                  </>
                )}
                <dt className="text-ink-3">Kawasan</dt>
                <dd className="tnum text-ink">
                  {fmt(kawasan.length)} kelurahan, {fmt(memadai)} dengan data memadai, {fmt(kawasan.length - memadai)} tidak memadai
                </dd>
              </dl>
              <p>{meta.metode}</p>
              {meta.sumber.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-[13.5px]">
                  {meta.sumber.map((s) => (
                    <li key={s.nama}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline underline-offset-2">
                          {s.nama}
                        </a>
                      ) : (
                        <span className="text-ink">{s.nama}</span>
                      )}
                      {s.catatan ? ` ${s.catatan}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Bagian>

        <Bagian id="kategori" judul="Cara membaca kategori">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13.5px]">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Kategori
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Aturan
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Artinya bagi calon pembeli
                  </th>
                </tr>
              </thead>
              <tbody>
                {URUTAN_KATEGORI.map((kat) => (
                  <tr key={kat} className="border-t border-line align-top">
                    <th scope="row" className="whitespace-nowrap py-2.5 pr-4 font-semibold text-ink">
                      <span className="inline-flex items-center gap-2">
                        <Swatch kategori={kat} />
                        {LABEL_KATEGORI[kat]}
                      </span>
                    </th>
                    <td className="tnum py-2.5 pr-4 text-ink">{aturan[kat]}</td>
                    <td className="py-2.5">{ARTI[kat]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Kategori hanya berasal dari laju penurunan. Konteks lain seperti rob, elevasi, dan guna lahan direncanakan sebagai lapisan terpisah. Semuanya belum digabung menjadi satu skor karena data dan bobotnya belum
            terverifikasi.
          </p>
          <p>Ambang kategori masih asumsi awal dan terbuka untuk diuji.</p>
          <Button ukuran="sm" onClick={() => navigasi('dashboard')} ikon={<ArrowRight size={16} />}>
            Coba ubah ambang di Dashboard
          </Button>
        </Bagian>

        <Bagian id="proyeksi" judul="Proyeksi Tenor">
          <p>Proyeksi Tenor memperkirakan total penurunan tanah selama masa cicilan KPR. Caranya sederhana: tren laju saat ini diperpanjang selama tenor, lalu ditampilkan sebagai rentang.</p>
          <ul className="space-y-1 rounded-[12px] bg-surface-2 p-4 font-mono text-[13px] text-ink">
            <li>Proyeksi tengah = laju × tenor</li>
            <li>Batas bawah = max(0, (laju - ketidakpastian) × tenor)</li>
            <li>Batas atas = (laju + ketidakpastian) × tenor</li>
          </ul>
          <Kalkulator />
          <p>Selalu dibaca sebagai rentang. Tren masa lalu bisa berubah.</p>
        </Bagian>

        <Bagian id="alur" judul="Alur olah data">
          <Notice>Langkah 1 sampai 7 belum dijalankan. Peta saat ini memakai data demo ilustratif.</Notice>
          <ol className="space-y-3">
            {ALUR.map((a, i) => (
              <li key={a.judul} className="flex gap-3">
                <span className="tnum grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-[12.5px] font-bold text-ink">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold text-ink">{a.judul}</span>
                    <Pil teks={a.sudah ? 'Sudah di demo' : 'Rencana'} />
                  </div>
                  <p className="text-[13.5px]">{a.isi}</p>
                </div>
              </li>
            ))}
          </ol>
        </Bagian>

        <Bagian id="sumber" judul="Sumber data">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[13.5px]">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Data
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Dipakai untuk
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {SUMBER.map(([data, guna, st]) => (
                  <tr key={data} className="border-t border-line">
                    <th scope="row" className="py-2.5 pr-4 font-semibold text-ink">
                      {data}
                    </th>
                    <td className="py-2.5 pr-4">{guna}</td>
                    <td className="py-2.5">
                      <Pil teks={st} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13px]">Batas wilayah © OpenStreetMap contributors (ODbL). Peta dasar OpenFreeMap © OpenMapTiles, data OpenStreetMap.</p>
        </Bagian>

        <Bagian id="batasan" judul="Batasan">
          <ul className="list-disc space-y-1.5 pl-5">
            {BATASAN.map((b) => (
              <li key={b}>{b}</li>
            ))}
            <li>Bila hanya satu lintasan satelit yang dipakai, laju vertikal memakai asumsi gerak dominan vertikal.</li>
            <li>Validasi di Semarang bagian bawah masih terbatas karena stasiun GNSS acuan (CSEM) berada di area stabil.</li>
            <li>Kawasan dengan koherensi rendah ditandai data tidak memadai, bukan dianggap aman.</li>
          </ul>
          <p className="font-semibold text-ink">{PRINSIP}</p>
        </Bagian>

        <Bagian id="ganti-data" judul="Ganti data">
          <GantiData />
        </Bagian>
      </div>
    </div>
  )
}
