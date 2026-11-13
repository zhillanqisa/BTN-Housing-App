// Terbitkan dist/ ke cabang gh-pages (GitHub Pages).
// Jalankan: npm run deploy   (otomatis build dulu)
//
// Cabang gh-pages hanya berisi hasil build, jadi tiap deploy menimpa isinya
// (push paksa ke gh-pages saja; cabang main tidak disentuh).

import { execFileSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()

if (!existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ belum ada. Jalankan "npm run build" dulu.')

const remote = git(['remote', 'get-url', 'origin'], root)
const sumber = git(['rev-parse', '--short', 'HEAD'], root)

// .nojekyll: GitHub Pages menyajikan file apa adanya, tanpa proses Jekyll.
writeFileSync(path.join(dist, '.nojekyll'), '')
rmSync(path.join(dist, '.git'), { recursive: true, force: true })
try {
  git(['init', '-q', '-b', 'gh-pages'], dist)
  // autocrlf dimatikan supaya isi file terbit persis seperti hasil build
  git(['-c', 'core.autocrlf=false', 'add', '-A'], dist)
  git(['commit', '-q', '-m', `Deploy dari ${sumber}`], dist)
  git(['push', '-f', remote, 'gh-pages'], dist)
} finally {
  rmSync(path.join(dist, '.git'), { recursive: true, force: true })
}
console.log(`Terbit ke cabang gh-pages dari commit ${sumber}.`)
