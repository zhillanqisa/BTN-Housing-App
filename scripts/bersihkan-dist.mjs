// Kosongkan dist/ sebelum vite build.
// Di Windows, berkas di dist/ kadang masih dipegang sesaat oleh proses lain (server pratinjau, pemindai
// antivirus), sehingga pengosongan bawaan Vite gagal dengan ENOTEMPTY atau EBUSY. rmSync dengan
// coba ulang menunggu sebentar sampai berkasnya dilepas.
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
rmSync(dist, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
