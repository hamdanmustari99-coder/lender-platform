'use strict'
// Preload: jalur aman untuk mengambil konfigurasi Supabase dari main process.
// sendSync dipakai karena config hanya dibutuhkan sekali saat modul supabase
// client diinisialisasi (harus sinkron) — tidak ada poll/loop selepasnya.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('swf', {
  isDesktop: true,
  getSupabaseConfig: () =>
    ipcRenderer.sendSync('swf:get-supabase-config', 'supabase'),
})
