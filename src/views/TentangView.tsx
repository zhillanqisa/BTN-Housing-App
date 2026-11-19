// Halaman Tentang kami: pengenalan produk SubTen dan, yang terpenting, cara bekerja sama.
// Isi diambil dari src/lib/tentang.ts.
import type { ReactNode } from 'react'
import {
  ArrowRight,
  ArrowSquareOut,
  Bank,
  Buildings,
  ChartLineDown,
  CheckCircle,
  Compass,
  EnvelopeSimple,
  FilePdf,
  GithubLogo,
  Handshake,
  House,
  InstagramLogo,
  MapPin,
  Mountains,
  Planet,
  Ruler,
  Timer,
  UserCircleGear,
  WhatsappLogo,
} from '@phosphor-icons/react'
import { navigasi } from '../lib/router'
import { ATRIBUSI, KONTAK, MITRA, PEMBIMBING, REPO, SINERGI_BTN, TIM, type Anggota } from '../lib/tentang'
import { mulaiTur } from '../lib/tur'
import { TombolPasang } from '../components/PasangAplikasi'
import { Button, Card, cx, Logo, Wordmark } from '../ui/primitives'

const IKON_MITRA = [House, Buildings, UserCircleGear, Bank]

const ANGKA: { nilai: string; label: string }[] = [
  { nilai: '3', label: 'kota pesisir dengan data nyata' },
  { nilai: '80 m', label: 'ukuran piksel radar' },
  { nilai: '2020–2026', label: 'rentang pengukuran Sentinel-1' },
  { nilai: '~240 m', label: 'blok yang dibaca di tiap titik' },
]

const CARA_KERJA: { Ikon: typeof Planet; judul: string; isi: string }[] = [
  { Ikon: Planet, judul: 'Satelit mengukur', isi: 'Radar Sentinel-1 merekam permukaan tanah pesisir utara Jawa setiap beberapa hari sejak 2020.' },
  { Ikon: MapPin, judul: 'SubTen membaca titik', isi: 'Laju turun dihitung di blok sekitar 240 m di titik rumah incaran, bukan rata-rata satu kelurahan.' },
  { Ikon: FilePdf, judul: 'Laporan untuk keputusan', isi: 'Hasilnya diterjemahkan ke dampak selama tenor KPR, siap dibawa ke pengembang, bank, atau saat akad.' },
]

const ISI_LAPORAN: { Ikon: typeof Planet; judul: string; isi: string }[] = [
  { Ikon: ChartLineDown, judul: 'Laju di titik', isi: 'Sentimeter per tahun, kategori, dan ketidakpastian ukurnya.' },
  { Ikon: Timer, judul: 'Riwayat 2020–2026', isi: 'Grafik turunnya tanah dari waktu ke waktu.' },
  { Ikon: Ruler, judul: 'Proyeksi tenor', isi: 'Perkiraan turun sampai cicilan lunas, terhadap tinggi rumah.' },
  { Ikon: Mountains, judul: 'Konteks lokasi', isi: 'Zona RDTR, jenis batuan, dan bahaya banjir di titik itu.' },
  { Ikon: FilePdf, judul: 'PDF dan banding', isi: 'Satu berkas untuk dibawa, dan pembanding beberapa rumah.' },
]

function inisial(nama: string): string {
  const kata = nama
    .replace(/^(Assoc\. Prof\. )?(Dr\. )?/, '')
    .split(/[\s,]+/)
    .filter((k) => /^[A-Z][a-z]/.test(k))
  return ((kata[0]?.[0] ?? '') + (kata[1]?.[0] ?? '')).toUpperCase()
}

function Judul({ eyebrow, children, isi }: { eyebrow: string; children: ReactNode; isi?: ReactNode }) {
  return (
    <div className="max-w-[68ch]">
      <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-3">{eyebrow}</div>
      <h2 className="mt-2 text-[24px] font-bold leading-tight tracking-tight text-ink md:text-[30px]">{children}</h2>
      {isi && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{isi}</p>}
    </div>
  )
}

function KartuOrang({ a, utama }: { a: Anggota; utama?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cx('grid size-11 shrink-0 place-items-center rounded-full text-[14px] font-bold tracking-tight', utama ? 'bg-ink text-surface' : 'bg-surface-2 text-ink ring-1 ring-line-2')}
      >
        {inisial(a.nama)}
      </span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-bold leading-snug text-ink">{a.nama}</span>
        <span className="block text-[12.5px] text-ink-3">{a.peran}</span>
      </span>
    </div>
  )
}

function TombolKontak() {
  const ada = KONTAK.email || KONTAK.whatsapp || KONTAK.instagram
  if (!ada) {
    return (
      <p className="rounded-[14px] border border-dashed border-white/25 px-4 py-3 text-[13.5px] text-white/80">
        Email dan WhatsApp tim akan dicantumkan di sini. Sementara itu, hubungi kami lewat halaman proyek di GitHub.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {KONTAK.email && (
        <a href={`mailto:${KONTAK.email}?subject=${encodeURIComponent('Kerja sama SubTen')}`} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-accent px-4 text-sm font-bold text-accent-ink hover:brightness-95">
          <EnvelopeSimple size={18} weight="bold" aria-hidden="true" /> {KONTAK.email}
        </a>
      )}
      {KONTAK.whatsapp && (
        <a href={`https://wa.me/${KONTAK.whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10">
          <WhatsappLogo size={18} aria-hidden="true" /> WhatsApp
        </a>
      )}
      {KONTAK.instagram && (
        <a href={`https://instagram.com/${KONTAK.instagram}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10">
          <InstagramLogo size={18} aria-hidden="true" /> @{KONTAK.instagram}
        </a>
      )}
    </div>
  )
}

const keKerjaSama = () => document.getElementById('kerja-sama')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function TentangView() {
  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4 px-4 pb-24 pt-2 md:px-8">
      {/* pembuka: logo, janji produk, angka */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Card className="p-6 md:p-10">
          <div className="flex items-center gap-3">
            <Logo size={56} />
            <div>
              <Wordmark className="block text-[30px] leading-none md:text-[34px]" />
              <span className="mt-1.5 block text-[12.5px] font-semibold tracking-[0.14em] text-ink-3">CEK TANAH SEBELUM KPR</span>
            </div>
          </div>
          <h1 className="mt-7 max-w-[17ch] text-[32px] font-bold leading-[1.06] tracking-tight text-ink md:text-[46px]">Tanah turun pelan. Cicilan berjalan lama.</h1>
          <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed text-ink-2">
            SubTen, singkatan dari <span className="font-semibold text-ink">Subsidence</span> dan <span className="font-semibold text-ink">Tenor</span>, membaca laju penurunan tanah di titik rumah incaran dari
            radar satelit, lalu menerjemahkannya ke dampak selama masa cicilan KPR. Dibuat untuk BTN Housingpreneur 2026, kategori Housing Innovation.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Button varian="primary" onClick={keKerjaSama} ikon={<Handshake size={18} />}>
              Ajak kerja sama
            </Button>
            <Button onClick={() => navigasi('peta')} ikon={<ArrowRight size={17} />}>
              Cek lokasi
            </Button>
            <TombolPasang bentuk="tombol" />
            <Button varian="ghost" onClick={mulaiTur} ikon={<Compass size={17} />}>
              Tur aplikasi
            </Button>
          </div>
        </Card>
        <Card className="grid grid-cols-2 overflow-hidden p-0">
          {ANGKA.map((a, i) => (
            <div key={a.label} className={cx('flex flex-col justify-end p-5 md:p-6', i % 2 === 0 && 'border-r border-line', i < 2 && 'border-b border-line')}>
              <span className="tnum text-[28px] font-bold leading-none tracking-tight text-ink md:text-[34px]">{a.nilai}</span>
              <span className="mt-2 text-[13px] leading-snug text-ink-3">{a.label}</span>
            </div>
          ))}
        </Card>
      </section>

      {/* pengenalan produk */}
      <Card className="p-6 md:p-9">
        <Judul eyebrow="Mengenal SubTen" isi="Pembeli, pengembang, dan bank menanggung risiko yang sama di kota pesisir, tanpa alat baca yang sama. SubTen menyatukan bacaannya dalam satu laporan per titik.">
          Dari radar satelit ke keputusan membeli rumah
        </Judul>
        <ol className="mt-7 grid gap-3 md:grid-cols-3">
          {CARA_KERJA.map(({ Ikon, judul, isi }, i) => (
            <li key={judul} className="relative rounded-[18px] bg-surface-2 p-5">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-[12px] bg-surface text-accent ring-1 ring-line">
                  <Ikon size={21} weight="duotone" aria-hidden="true" />
                </span>
                <span className="tnum text-[13px] font-bold text-ink-3">0{i + 1}</span>
              </div>
              <div className="mt-4 text-[16px] font-bold text-ink">{judul}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{isi}</p>
            </li>
          ))}
        </ol>

        <div className="mt-8 border-t border-line pt-7">
          <h3 className="text-[17px] font-bold text-ink">Isi Laporan Ambles</h3>
          <ul className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
            {ISI_LAPORAN.map(({ Ikon, judul, isi }) => (
              <li key={judul} className="flex gap-3 lg:flex-col lg:gap-2">
                <Ikon size={22} weight="duotone" className="shrink-0 text-accent" aria-hidden="true" />
                <span>
                  <span className="block text-[14.5px] font-bold text-ink">{judul}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{isi}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* kerja sama: bagian utama halaman */}
      <section id="kerja-sama" className="scroll-mt-28 overflow-hidden rounded-[22px] border border-line bg-surface">
        <div className="p-6 md:p-9">
          <Judul eyebrow="Kerja sama" isi="Laporan dasar gratis untuk calon pembeli. Mitra profesional mendapat laporan yang lebih rinci, dashboard, dan akses data.">
            Satu data, empat cara memakainya
          </Judul>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MITRA.map((m, i) => {
              const Ikon = IKON_MITRA[i] ?? House
              const gratis = i === 0
              return (
                <div key={m.siapa} className={cx('flex flex-col rounded-[18px] p-5', gratis ? 'bg-surface-2' : 'border border-line-2')}>
                  <div className="flex items-center justify-between">
                    <Ikon size={26} weight="duotone" className="text-accent" aria-hidden="true" />
                    <span className={cx('rounded-full px-2.5 py-1 text-[12px] font-bold', gratis ? 'bg-accent text-accent-ink' : 'bg-ink text-surface')}>{m.tarif}</span>
                  </div>
                  <div className="mt-4 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{m.siapa}</div>
                  <div className="mt-0.5 text-[17px] font-bold leading-snug text-ink">{m.produk}</div>
                  <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-ink-2">{m.isi}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">Tarif adalah rencana tim untuk tahap pilot, belum harga final.</p>

          <div className="mt-8 grid gap-6 rounded-[18px] bg-surface-2 p-5 md:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
            <div>
              <h3 className="text-[18px] font-bold text-ink">Sinergi dengan BTN</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">Target pilot: satu cabang BTN di Semarang, dengan Laporan Ambles masuk ke proses KPR dan appraisal.</p>
            </div>
            <ul className="space-y-3">
              {SINERGI_BTN.map((s) => (
                <li key={s} className="flex gap-2.5 text-[14px] leading-relaxed text-ink">
                  <CheckCircle size={19} weight="fill" className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div id="kontak" className="bg-[#0f1d33] p-6 text-white md:p-9">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-white/60">Hubungi kami</div>
              <h2 className="mt-2 max-w-[20ch] text-[26px] font-bold leading-tight tracking-tight md:text-[34px]">Ajak kami bekerja sama</h2>
              <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-white/75">
                Untuk uji coba di cabang bank, kemitraan data dengan pengembang atau penilai, maupun riset bersama tentang penurunan tanah di pesisir utara Jawa.
              </p>
            </div>
            <div className="space-y-3">
              <TombolKontak />
              <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-white/85 underline-offset-4 hover:underline">
                <GithubLogo size={17} aria-hidden="true" /> Kode sumber dan dokumentasi <ArrowSquareOut size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* tim dan sumber data */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-6 md:p-8">
          <h2 className="text-[17px] font-bold text-ink">Tim SubTen</h2>
          <div className="mt-5 space-y-4">
            {TIM.map((a, i) => (
              <KartuOrang key={a.nama} a={a} utama={i === 0} />
            ))}
            <div className="border-t border-line pt-4">
              <KartuOrang a={PEMBIMBING} />
            </div>
          </div>
        </Card>
        <Card className="p-6 md:p-8">
          <h2 className="text-[17px] font-bold text-ink">Data yang kami pakai</h2>
          <ul className="mt-4 space-y-2 text-[13.5px] leading-relaxed text-ink-2">
            {ATRIBUSI.map((a) => (
              <li key={a} className="flex gap-2">
                <span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-3" />
                {a}
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => navigasi('metode')} className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink underline underline-offset-2">
            Rincian sumber dan cara olah di Data & metode <ArrowRight size={14} aria-hidden="true" />
          </button>
        </Card>
      </section>
    </div>
  )
}
