'use strict'
// SWFinance desktop shell — Electron main process. ( Versi hardened QA )
// Membungkus build web admin (desktop/dist) dalam jendela branded.
// Nilai Supabase dibaca dari ../admin/.env (read-only) saat startup,
// lalu dikirim ke renderer lewat IPC — tidak di-hardcode, tidak di-bundle.

const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')

// ---- Baca ../admin/.env (read-only) ----
function readAdminEnv() {
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
    // .env tidak ada — biarkan kosong; UI sudah punya layar "belum dikonfigurasi"
  }
  return out
}

const ADMIN_ENV = readAdminEnv()
const SUPA = {
  url: ADMIN_ENV.VITE_SUPABASE_URL || '',
  anonKey: ADMIN_ENV.VITE_SUPABASE_ANON_KEY || '',
}

// PENTING: preload memakai ipcRenderer.sendSync — pasangan yang benar di sini
// adalah ipcMain.on + event.returnValue. (ipcMain.handle hanya merespons
// ipcRenderer.invoke; salah pairing membuat renderer thread membeku.)
ipcMain.on('swf:get-supabase-config', (event) => {
  event.returnValue = SUPA
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

  // Link eksternal (wa.me, maps, docs) terbuka di browser default — bukan di app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Hardening: tolak semua permission request (kamera/lokasi/notifikasi) —
  // aplikasi ini tidak membutuhkannya; izinkan eksplisit jika suatu hari perlu.
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
