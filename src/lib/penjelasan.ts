// Penjelasan lapis konteks untuk orang awam yang sedang menimbang membeli rumah:
// arti zona pola ruang (RTRW/RDTR) dan dampaknya ke izin bangunan dan KPR, serta arti satuan geologi
// dan dampaknya ke ambles dan pondasi. Dipakai di laporan (panel, lembar ponsel) dan PDF.
//
// Isi ini panduan umum, bukan pengganti KKPR (Kesesuaian Kegiatan Pemanfaatan Ruang), PBG, atau
// penyelidikan tanah. Teks laporan selalu menyebut ke mana kepastian harus dicek.

export type StatusHunian = 'sesuai' | 'terbatas' | 'tidak'

export const LABEL_HUNIAN: Record<StatusHunian, string> = {
  sesuai: 'Peruntukan hunian',
  terbatas: 'Hunian terbatas',
  tidak: 'Bukan untuk hunian',
}

export interface PenjelasanPolaRuang {
  /** Kawasan lindung atau budi daya (pembagian dasar dalam rencana tata ruang). */
  golongan: 'Lindung' | 'Budi daya'
  arti: string
  hunian: StatusHunian
  /** Dampak ke rencana membeli atau membangun rumah. */
  untukRumah: string
  /** Kaitan dengan ambles atau rob, bila ada. */
  catatan?: string
}

const TIDAK_HUNIAN =
  'Rumah tinggal di zona ini umumnya tidak sesuai rencana tata ruang. Persetujuan Bangunan Gedung (PBG) bisa sulit terbit, dan bank biasanya meminta legalitas bangunan sebelum menyetujui KPR.'

const POLA: { cocok: (kode: string, nama: string) => boolean; isi: PenjelasanPolaRuang }[] = [
  {
    cocok: (k, n) => k === '32100000' || k === '32103000' || /permukiman|perumahan/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona yang memang direncanakan untuk tempat tinggal beserta fasilitas pendukungnya.',
      hunian: 'sesuai',
      untukRumah:
        'Rumah tinggal sesuai peruntukan. Tetap cocokkan dengan RDTR dan KKPR untuk persil yang dituju, karena di dalam zona permukiman masih ada aturan intensitas (KDB, KLB, ketinggian) dan sempadan.',
    },
  },
  {
    cocok: (k, n) => k === '32112000' || /perdagangan/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk toko, pasar, ruko, dan jasa.',
      hunian: 'terbatas',
      untukRumah: 'Hunian biasanya boleh sebagai bagian bangunan campuran (mis. ruko), tidak selalu sebagai rumah tinggal murni. Pastikan lewat KKPR.',
    },
  },
  {
    cocok: (k, n) => k === '32113000' || /perkantoran/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk gedung kantor pemerintah dan swasta.',
      hunian: 'terbatas',
      untukRumah: 'Rumah tinggal bukan peruntukan utama. Pastikan lewat KKPR sebelum membeli.',
    },
  },
  {
    cocok: (k, n) => k === '32104000' || /pelayanan umum/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk sekolah, rumah sakit, tempat ibadah, dan fasilitas umum lain.',
      hunian: 'terbatas',
      untukRumah: 'Rumah tinggal bukan peruntukan utama. Pastikan lewat KKPR sebelum membeli.',
    },
  },
  {
    cocok: (k, n) => k === '32090000' || /pariwisata/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk kegiatan wisata dan penunjangnya.',
      hunian: 'terbatas',
      untukRumah: 'Hunian hanya sebagai penunjang wisata, bukan perumahan umum. Pastikan lewat KKPR.',
    },
  },
  {
    cocok: (k, n) => k === '32080000' || /industri/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk pabrik dan kawasan industri.',
      hunian: 'tidak',
      untukRumah: TIDAK_HUNIAN,
      catatan:
        'Kawasan industri di pesisir sering memakai air tanah dalam jumlah besar. Penyedotan air tanah adalah salah satu pemicu utama ambles di pesisir utara Jawa.',
    },
  },
  {
    cocok: (k, n) => k === '32040000' || /pertanian/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk sawah, ladang, dan kebun.',
      hunian: 'tidak',
      untukRumah:
        'Perumahan baru di zona pertanian umumnya tidak diizinkan, terutama di lahan sawah yang dilindungi. Rumah yang sudah ada belum tentu berizin. ' +
        'Cek KKPR dan PBG sebelum membeli.',
    },
  },
  {
    cocok: (k, n) => k === '32050000' || /perikanan/i.test(n),
    isi: {
      golongan: 'Budi daya',
      arti: 'Zona untuk tambak dan budi daya ikan.',
      hunian: 'tidak',
      untukRumah: TIDAK_HUNIAN,
      catatan: 'Zona tambak biasanya berada di dataran pantai paling rendah, yang paling sering terkena rob bila tanahnya terus turun.',
    },
  },
  {
    cocok: (k, n) => k === '32020000' || /hutan produksi/i.test(n),
    isi: { golongan: 'Budi daya', arti: 'Kawasan hutan yang hasil kayunya dimanfaatkan.', hunian: 'tidak', untukRumah: TIDAK_HUNIAN },
  },
  {
    cocok: (k, n) => k === '32070000' || k === '32075000' || /pertambangan|energi|listrik/i.test(n),
    isi: { golongan: 'Budi daya', arti: 'Zona untuk tambang, pembangkit, dan jaringan energi.', hunian: 'tidak', untukRumah: TIDAK_HUNIAN },
  },
  {
    cocok: (k, n) => k === '32120000' || /transportasi/i.test(n),
    isi: { golongan: 'Budi daya', arti: 'Zona untuk jalan, terminal, stasiun, pelabuhan, dan bandara.', hunian: 'tidak', untukRumah: TIDAK_HUNIAN },
  },
  {
    cocok: (k, n) => k === '32130000' || /pertahanan/i.test(n),
    isi: { golongan: 'Budi daya', arti: 'Zona untuk kepentingan pertahanan dan keamanan negara.', hunian: 'tidak', untukRumah: TIDAK_HUNIAN },
  },
  {
    cocok: (k, n) => k === '31090000' || /mangrove/i.test(n),
    isi: {
      golongan: 'Lindung',
      arti: 'Hutan bakau yang dilindungi.',
      hunian: 'tidak',
      untukRumah: 'Tidak boleh dibangun rumah.',
      catatan: 'Mangrove meredam gelombang dan abrasi. Di pantai yang tanahnya turun, sabuk mangrove ikut menahan rob ke permukiman di belakangnya.',
    },
  },
  {
    cocok: (k, n) => k === '31030000' || /perlindungan setempat|sempadan/i.test(n),
    isi: {
      golongan: 'Lindung',
      arti: 'Sempadan pantai, sungai, waduk, atau situ yang dilindungi.',
      hunian: 'tidak',
      untukRumah: 'Tidak boleh dibangun rumah. Bangunan yang sudah ada di sempadan berisiko tidak bisa memperoleh izin.',
      catatan: 'Sempadan pantai dan sungai di dataran rendah adalah bagian yang paling dulu tergenang ketika tanah turun dan muka air naik.',
    },
  },
  {
    cocok: (k, n) => k === '31031000' || /ruang terbuka hijau/i.test(n),
    isi: { golongan: 'Lindung', arti: 'Taman, hutan kota, dan jalur hijau.', hunian: 'tidak', untukRumah: 'Tidak boleh dibangun rumah.' },
  },
  {
    cocok: (k, n) => k === '31010000' || /badan air/i.test(n),
    isi: { golongan: 'Lindung', arti: 'Sungai, kanal, waduk, danau, dan laut.', hunian: 'tidak', untukRumah: 'Tidak boleh dibangun rumah.' },
  },
  {
    cocok: (k, n) => k === '31021000' || k === '31040000' || /hutan lindung|konservasi/i.test(n),
    isi: { golongan: 'Lindung', arti: 'Kawasan yang fungsinya menjaga lingkungan dan tidak untuk dibangun.', hunian: 'tidak', untukRumah: 'Tidak boleh dibangun rumah.' },
  },
]

/** Penjelasan zona pola ruang. Kode mengikuti klasifikasi Permen ATR/BPN (31 = lindung, 32 = budi daya). */
export function penjelasanPolaRuang(kode: string, nama: string): PenjelasanPolaRuang | null {
  const k = String(kode ?? '')
  return POLA.find((p) => p.cocok(k, nama))?.isi ?? null
}

// ---------------------------------------------------------------- geologi

export type DayaTanah = 'lunak' | 'sedang' | 'padat'

export const LABEL_DAYA: Record<DayaTanah, string> = {
  lunak: 'Tanah lunak, mudah memadat',
  sedang: 'Pasir, cukup padat',
  padat: 'Batuan padat',
}

export interface PenjelasanGeologi {
  daya: DayaTanah
  umur: string
  /** Mengapa satuan ini penting untuk ambles. */
  ambles: string
  /** Dampak ke bangunan dan pondasi. */
  bangunan: string
  /** Yang perlu ditanyakan ke penjual atau pengembang. */
  tanyakan: string[]
}

const TANYA_DASAR = ['Apakah ada hasil sondir atau boring di sekitar lokasi?', 'Berapa tahun umur bangunan, dan sudah berapa kali lantainya ditinggikan?']

const ENDAPAN_LUNAK: PenjelasanGeologi = {
  daya: 'lunak',
  umur: 'Kuarter muda (Holosen), kurang dari sekitar 10.000 tahun',
  ambles:
    'Lapisan lempung dan lanau muda masih jenuh air dan belum padat. Beban urukan dan bangunan, ditambah penyedotan air tanah yang menurunkan tekanan air di pori, membuat lapisan ini terus memadat. ' +
    'Inilah sebab utama ambles cepat di pesisir utara Jawa. Endapan seperti ini bisa setebal puluhan meter di dekat pantai.',
  bangunan:
    'Pondasi dangkal mudah turun tidak seragam sehingga dinding retak dan pintu macet. Bangunan bertingkat biasanya memakai pondasi tiang sampai lapisan keras. ' +
    'Rumah sering perlu ditinggikan berkala mengikuti jalan dan saluran yang juga ditinggikan.',
  tanyakan: [
    'Jenis pondasi apa yang dipakai (tapak, cerucuk, atau tiang) dan sampai kedalaman berapa?',
    'Berapa tebal urukan di bawah rumah, dan kapan terakhir diuruk?',
    ...TANYA_DASAR,
  ],
}

const ENDAPAN_PANTAI: PenjelasanGeologi = {
  daya: 'sedang',
  umur: 'Kuarter muda',
  ambles:
    'Pematang pasir pantai lama lebih padat dan lebih mudah meloloskan air daripada lempung rawa, jadi biasanya lebih tahan ambles. ' +
    'Tetapi di bawah atau di sebelahnya bisa ada lempung lunak, sehingga laju di titik ini tetap perlu dilihat.',
  bangunan: 'Pondasi dangkal umumnya cukup untuk rumah satu sampai dua lantai, selama tidak ada lempung lunak tebal di bawahnya.',
  tanyakan: TANYA_DASAR,
}

const GUNUNGAPI: PenjelasanGeologi = {
  daya: 'padat',
  umur: 'Kuarter sampai Tersier akhir',
  ambles:
    'Tuf, breksi, dan rombakan gunungapi sudah jauh lebih padat daripada endapan pantai, jadi hampir tidak ambles karena pemadatan. ' +
    'Bila satelit tetap mencatat penurunan di sini, kemungkinan karena tanah urukan, gerakan lereng, atau galat ukur.',
  bangunan: 'Daya dukung tanah umumnya baik. Di lereng, perhatikan gerakan tanah dan aliran air permukaan.',
  tanyakan: ['Apakah lokasi berada di lereng, dan apakah pernah ada retakan tanah atau longsor di sekitar?', 'Apakah tapak rumah berdiri di atas tanah urukan?'],
}

const LEMPUNG_TUA: PenjelasanGeologi = {
  daya: 'padat',
  umur: 'Tersier (jutaan tahun)',
  ambles:
    'Batulempung, napal, dan batupasir tua sudah memadat sehingga hampir tidak ambles. Risiko yang lebih penting adalah lempung yang mengembang saat basah dan menyusut saat kering, serta gerakan lereng.',
  bangunan: 'Perhatikan retak akibat kembang-susut tanah dan kestabilan lereng. Saluran air di sekitar rumah ikut menentukan.',
  tanyakan: ['Apakah lantai atau dinding sering retak bergantian musim?', 'Apakah lokasi berada di lereng, dan apakah pernah ada longsor di sekitar?'],
}

const GEOLOGI: Record<string, PenjelasanGeologi> = {
  Qa: ENDAPAN_LUNAK,
  Qbr: ENDAPAN_PANTAI,
  Qav: GUNUNGAPI,
  Qf: GUNUNGAPI,
  QTvb: GUNUNGAPI,
  Qvtm: GUNUNGAPI,
  QTd: GUNUNGAPI,
  Qhg: GUNUNGAPI,
  Qpj: GUNUNGAPI,
  Qpkg: GUNUNGAPI,
  Tmk: LEMPUNG_TUA,
  Tmkl: LEMPUNG_TUA,
  Tmpk: LEMPUNG_TUA,
  Tmkk: LEMPUNG_TUA,
  Tmkd: LEMPUNG_TUA,
  Tmkb: LEMPUNG_TUA,
}

/** Penjelasan satuan geologi menurut kode peta PSG. Kode tak dikenal: menurut huruf awal (Q muda, T tua). */
export function penjelasanGeologi(kode: string): PenjelasanGeologi | null {
  if (!kode) return null
  if (GEOLOGI[kode]) return GEOLOGI[kode]
  if (kode.startsWith('T')) return LEMPUNG_TUA
  return null
}

// ---------------------------------------------------------------- persil

/** BHUMI ATR/BPN: peta bidang tanah terdaftar. Tidak punya layanan peta terbuka untuk aplikasi lain,
 *  jadi laporan menautkan ke sana dan menyalin koordinat titik. */
export const BHUMI = {
  nama: 'BHUMI ATR/BPN',
  url: 'https://bhumi.atrbpn.go.id/peta',
} as const

export const PERSIL_RINGKAS = 'Batas bidang tanah dan Nomor Identifikasi Bidang (NIB) tercatat di peta BHUMI milik Kementerian ATR/BPN.'
export const PERSIL_CATATAN =
  'Bila bidang atau NIB berbeda dari sertifikat, tanyakan ke Kantor Pertanahan setempat. BHUMI tidak menyediakan layanan peta terbuka untuk aplikasi lain, jadi batas persil tidak ditampilkan langsung di peta ini.'

export const TEKS_PERSIL =
  'Batas bidang tanah dan Nomor Identifikasi Bidang (NIB) ada di peta BHUMI milik Kementerian ATR/BPN. Cari lokasi ini di BHUMI, lalu cocokkan bidang dan NIB-nya dengan sertifikat dari penjual. ' +
  'Bila berbeda, tanyakan ke Kantor Pertanahan setempat. BHUMI tidak menyediakan layanan peta terbuka untuk aplikasi lain, jadi batas persil tidak ditampilkan langsung di peta ini.'
