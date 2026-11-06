'use strict'
// Sinkron build web admin -> desktop/dist.
// - `vite build --base=./` supaya asset jalan di protocol file:// (Electron)
// - Konfigurasi Supabase TIDAK di-bundle: main process baca ../admin/.env
//   saat runtime, renderer ambil lewat preload (window.swf).
// Script ini tidak menulis/menyalin secret ke mana pun.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const ADMIN = path.join(ROOT, 'admin')
const DEST = path.join(__dirname, '..', 'dist')

console.log('[sync-web] build admin (base ./) ...')
execSync('npx vite build --base=./', { cwd: ADMIN, stdio: 'inherit' })

console.log('[sync-web] copy dist -> desktop/dist ...')
fs.rmSync(DEST, { recursive: true, force: true })
fs.cpSync(path.join(ADMIN, 'dist'), DEST, { recursive: true })

console.log('[sync-web] OK ->', DEST)
