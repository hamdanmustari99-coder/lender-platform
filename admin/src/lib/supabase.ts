import { createClient } from '@supabase/supabase-js'

// Sumber konfigurasi (urut):
//   1) window.swf (Electron): main process, userData > .env repo + baked
//   2) import.meta.env (web/Vite)
// Desktop menyimpan override per-mesin di userData/swf-config.json (layar
// Setup first-run); nilai baked dari installer ada di main process.

type SwfConfig = { url: string; anonKey: string }
type SwfBridge = {
  swf?: {
    getSupabaseConfig: () => SwfConfig
    saveSupabaseConfig?: (cfg: SwfConfig) => Promise<{ ok: boolean; error?: string }>
  }
}

export const isDesktop =
  typeof window !== 'undefined' && Boolean((window as unknown as SwfBridge).swf)

const bridge = (typeof window !== 'undefined' ? (window as unknown as SwfBridge) : {})
const desktopCfg: SwfConfig | null = bridge.swf ? bridge.swf.getSupabaseConfig() : null

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
const url = desktopCfg?.url || envUrl
const anonKey = desktopCfg?.anonKey || envKey

/** true kalau kredensial Supabase tersedia dan berbentuk valid */
export const isConfigured =
  url.startsWith('https://') &&
  !url.includes('YOUR-PROJECT') &&
  anonKey.length > 20 &&
  !anonKey.includes('YOUR-ANON-KEY')

/**
 * Client selalu dibuat supaya modul lain bisa diimpor tanpa crash;
 * saat belum dikonfigurasi, request akan gagal dengan error jaringan
 * dan UI menampilkan layar/kesalahan konfigurasi (bukan diam).
 */
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key-not-configured',
)
