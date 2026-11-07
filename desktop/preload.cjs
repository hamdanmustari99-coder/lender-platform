'use strict'
// Preload: jembatan konfigurasi Supabase renderer <-> main.
// getSupabaseConfig: sendSync (dipasangkan ipcMain.on di main) — dipakai sekali
// saat modul supabase client pertama dievaluasi.
// saveSupabaseConfig: invoke (dipasangkan ipcMain.handle) — dipakai layar Setup.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('swf', {
  isDesktop: true,
  getSupabaseConfig: () =>
    ipcRenderer.sendSync('swf:get-supabase-config', 'supabase'),
  saveSupabaseConfig: (cfg) => ipcRenderer.invoke('swf:set-supabase-config', cfg),
})
