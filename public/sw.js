// Service worker SubTen: aplikasi tetap terbuka tanpa sinyal, dan data yang pernah dibuka tetap terbaca.
// - Halaman dan data (data/*.geojson, *.json, *.bin): jaringan dulu, supaya deploy baru langsung terpakai;
//   salinan di cache hanya dipakai bila jaringan gagal.
// - Aset ber-hash (assets/): cache dulu. Isinya tidak pernah berubah; yang lama dipangkas.
// - Ubin peta, pencarian alamat, dan layanan luar lain tidak disentuh.
const HALAMAN = 'subten-halaman-v1'
const ASET = 'subten-aset-v1'
const MAKS_ASET = 80

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(HALAMAN)
      .then((c) => c.addAll(['./', './manifest.webmanifest', './favicon.svg', './ikon/ikon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== HALAMAN && k !== ASET).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return
  if (url.pathname.includes('/assets/')) e.respondWith(cacheDulu(req))
  else e.respondWith(jaringanDulu(req))
})

async function cacheDulu(req) {
  const c = await caches.open(ASET)
  const ada = await c.match(req)
  if (ada) return ada
  const res = await fetch(req)
  if (res.ok) {
    await c.put(req, res.clone())
    const kunci = await c.keys()
    // urutan keys() mengikuti urutan simpan: yang paling lama dibuang lebih dulu
    for (const k of kunci.slice(0, Math.max(0, kunci.length - MAKS_ASET))) await c.delete(k)
  }
  return res
}

async function jaringanDulu(req) {
  const c = await caches.open(HALAMAN)
  try {
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') await c.put(req, res.clone())
    return res
  } catch (galat) {
    const ada = await c.match(req, { ignoreSearch: req.mode === 'navigate' })
    if (ada) return ada
    if (req.mode === 'navigate') {
      const awal = await c.match('./')
      if (awal) return awal
    }
    throw galat
  }
}
