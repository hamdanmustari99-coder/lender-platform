'use strict'
// SWFinance desktop shell — Electron main process. (v2: config layer)
// Urutan sumber konfigurasi Supabase:
//   1) userData/swf-config.json  -> diisi lewat layar Setup first-run
//      (per-mesin, survive update app)
//   2) ../admin/.env             -> fallback mode dev (jalannya di dalam repo)
// Renderer mengambil nilai lewat IPC; tidak ada yang di-hardcode.

const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// Wajib sebelum app ready: paksa software rendering. GPU client laptop
// bermacam-macam (VM/Intel lama) — compositing layer besar (gradien
// full-screen) di GPU lemah bikin layar putih + teks hilang + glitch klik.
// Admin CRUD ini tidak butuh GPU; software render = identik di semua mesin.
app.disableHardwareAcceleration()

const ROOT = path.join(__dirname, '..')
const CONFIG_FILE = () => path.join(app.getPath('userData'), 'swf-config.json')

function readRepoEnv() {
  const out = {}
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'admin', '.env'), 'utf8')
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
    // repo .env tidak ada (laptop klien) — biarkan kosong
  }
  return out
}

function fileConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), 'utf8')
    const j = JSON.parse(raw)
    if (j && typeof j.url === 'string' && typeof j.anonKey === 'string') return j
  } catch {
    // belum di-setup
  }
  return null
}

function bakedConfig() {
  try {
    const raw = fs.readFileSync(
      path.join(__dirname, 'dist', 'swf-config.json'),
      'utf8',
    )
    const j = JSON.parse(raw)
    if (j && typeof j.url === 'string' && typeof j.anonKey === 'string') return j
  } catch {
    // dist lama tanpa baked config
  }
  return null
}

function currentConfig() {
  return (
    fileConfig() ||
    bakedConfig() || {
      url: readRepoEnv().VITE_SUPABASE_URL || '',
      anonKey: readRepoEnv().VITE_SUPABASE_ANON_KEY || '',
    }
  )
}

function validConfig(cfg) {
  if (
    !cfg ||
    typeof cfg.url !== 'string' ||
    !cfg.url.startsWith('https://') ||
    typeof cfg.anonKey !== 'string' ||
    cfg.anonKey.length <= 20
  ) {
    return false
  }
  // Pengaman: anon/publishable key BOLEH, secret/service_role TIDAK BOLEH.
  // Jika service_role keselip di isi, semua kebijakan RLS bisa dilewati.
  const k = cfg.anonKey.toLowerCase()
  if (k.includes('sb_secret_') || k.includes('service_role')) {
    return false
  }
  return true
}

// sendSync (baca) dipasangkan ipcMain.on + event.returnValue — JANGAN diganti
// ipcMain.handle; salah pairing membekukan renderer thread.
ipcMain.on('swf:get-supabase-config', (event) => {
  event.returnValue = currentConfig()
})

ipcMain.handle('swf:set-supabase-config', (_event, cfg) => {
  if (!validConfig(cfg)) {
    return { ok: false, error: 'URL harus https:// dan anon key minimal 20 karakter.' }
  }
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true })
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify({ url: cfg.url.trim(), anonKey: cfg.anonKey.trim() }, null, 2))
  return { ok: true }
})

// Simpan laporan (PDF/CSV) dari renderer.
// Renderer memuat app lewat file:// tanpa handler will-download, jadi <a download>
// dan blob: TIDAK menghasilkan berkas apa pun — itulah sebabnya ekspor laporan
// tampak mati di desktop. Semua berkas ditulis di sini ke SATU folder, dengan
// nama + isi yang sama persis seperti yang ditulis APK.
//
// Sengaja TIDAK memakai dialog "simpan sebagai" per berkas: laporan CSV terdiri
// dari 3 berkas, jadi dialog berulang menyiksa. Satu folder, satu lokasi.
ipcMain.handle('swf:save-files', async (_event, files) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Tidak ada berkas untuk disimpan.')
  }
  const folder = path.join(app.getPath('downloads'), 'SWFinance')
  fs.mkdirSync(folder, { recursive: true })

  let saved = 0
  for (const f of files) {
    const name = String(f?.name || '').trim()
    // Tolak nama yang mencoba keluar folder (path traversal).
    if (!name || name.includes('..') || /[\\/]/.test(name)) {
      throw new Error(`Nama berkas tidak valid: ${name || '(kosong)'}`)
    }
    const buf = Buffer.from(String(f.base64 || ''), 'base64')
    if (buf.length === 0) throw new Error(`Berkas kosong: ${name}`)
    fs.writeFileSync(path.join(folder, name), buf)
    saved += 1
  }
  return { folder, count: saved }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    title: 'SWFinance — Panel Operasional',
    backgroundColor: '#04150f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.loadFile(path.join(__dirname, 'dist', 'index.html'))

  // Hardening: renderer hanya boleh di file:// lokal (dist app). Navigasi ke
  // origin lain dibatalkan; link https tetap dibuka di browser eksternal.
  win.webContents.on('will-navigate', (event, url) => {
    const ok = url.startsWith('file://') || url.startsWith('devtools://')
    if (!ok) {
      event.preventDefault()
      if (url.startsWith('https://')) shell.openExternal(url)
    }
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
