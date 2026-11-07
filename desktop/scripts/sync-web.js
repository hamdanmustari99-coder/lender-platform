'use strict'
// Sinkron build web admin -> desktop/dist + bake kredensial PUBLIK.
// - `vite build --base=./` supaya asset jalan di protocol file:// (Electron)
// - URL + anon key Supabase adalah nilai publik (sama yang kebawa di bundle
//   web) — di-bake ke dist/swf-config.json supaya laptop klien langsung
//   terhubung tanpa setup. Kredensial RAHASIA (service_role, Cloudinary)
//   TIDAK PERNAH disentuh script ini.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const ADMIN = path.join(ROOT, 'admin')
const DEST = path.join(__dirname, '..', 'dist')

function readAdminEnv() {
  const out = {}
  try {
    const raw = fs.readFileSync(path.join(ADMIN, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      out[m[1]] = v
    }
  } catch {
    // biarkan kosong
  }
  return out
}

console.log('[sync-web] build admin (base ./) ...')
execSync('npx vite build --base=./', { cwd: ADMIN, stdio: 'inherit' })

console.log('[sync-web] copy dist -> desktop/dist ...')
fs.rmSync(DEST, { recursive: true, force: true })
fs.cpSync(path.join(ADMIN, 'dist'), DEST, { recursive: true })

const env = readAdminEnv()
fs.writeFileSync(
  path.join(DEST, 'swf-config.json'),
  JSON.stringify(
    { url: env.VITE_SUPABASE_URL || '', anonKey: env.VITE_SUPABASE_ANON_KEY || '' },
    null,
    2,
  ),
)
console.log('[sync-web] baked swf-config.json (publik) OK ->', DEST)
