// Isi halaman Tentang kami. Diambil dari pitch deck SubTen (BTN Housingpreneur 2026, kategori
// Housing Innovation). Ubah di sini bila tim, tarif, atau kontak berganti.

export interface Anggota {
  nama: string
  peran: string
}

export const TIM: Anggota[] = [
  { nama: 'Zhillan Qisa Zhahiran', peran: 'Ketua tim' },
  { nama: 'M. Amri Amiruddin', peran: 'Anggota' },
  { nama: 'Muhammad Daffa Fahreza', peran: 'Anggota' },
]

export const PEMBIMBING: Anggota = { nama: 'Assoc. Prof. Dr. Anang Wahyu Sejati, S.T., M.T.', peran: 'Dosen pembimbing' }

/** Kontak kerja sama. null = belum diisi; halaman menampilkan penanda, bukan alamat palsu. */
export const KONTAK: { email: string | null; whatsapp: string | null; instagram: string | null } = {
  email: null,
  /** nomor internasional tanpa tanda plus, mis. 6281234567890 */
  whatsapp: null,
  /** nama akun tanpa @ */
  instagram: null,
}

export const REPO = 'https://github.com/zhillanqisa/BTN-Housing-App'

export interface Mitra {
  siapa: string
  produk: string
  isi: string
  tarif: string
}

/** Model kerja sama dari pitch deck. Tarif adalah rencana tim yang diuji saat pilot. */
export const MITRA: Mitra[] = [
  { siapa: 'Calon pembeli', produk: 'Laporan Ambles dasar', isi: 'Laju di titik rumah, proyeksi selama tenor, dan daftar periksa sebelum akad.', tarif: 'Gratis' },
  { siapa: 'Pengembang', produk: 'Laporan Tapak', isi: 'Analisis blok proyek, konteks lahan, dan saran desain seperti peninggian lantai dan jenis pondasi.', tarif: 'Rp2,5 jt per lokasi' },
  { siapa: 'Appraiser, KJPP, agen', produk: 'Langganan dashboard', isi: 'Laporan tanpa batas, pra-skrining banyak lokasi, dan ekspor data.', tarif: 'Rp1,5 jt per bulan' },
  { siapa: 'Bank', produk: 'Lisensi data dan API', isi: 'Data risiko fisik agunan per titik untuk penilaian agunan dan Climate Risk Stress Test.', tarif: 'Rp100 jt per wilayah per tahun' },
]

export const SINERGI_BTN: string[] = [
  'Data risiko fisik agunan per titik untuk Climate Risk Stress Test.',
  'Laporan Ambles sebagai lampiran pengajuan KPR dan appraisal di kota pesisir.',
  'Lencana "Cek Ambles" pada listing proyek pengembang mitra di BTN Properti.',
  'Rujukan kredit renovasi atau peninggian rumah bagi debitur di zona tinggi.',
]

export const ATRIBUSI: string[] = [
  'Citra radar Sentinel-1, Copernicus/ESA, diproses lewat ASF HyP3 dan MintPy',
  'GNSS CORS Pantura (Susilo dkk. 2023)',
  'Tata ruang dari geoportal pemerintah daerah dan RTRW Provinsi Jawa Tengah',
  'Peta geologi Pusat Survei Geologi, Badan Geologi',
  'Indeks bahaya banjir dan abrasi InaRISK BNPB',
  'Peta dasar OpenFreeMap, OpenMapTiles, data OpenStreetMap; relief Mapzen Terrain Tiles',
]
