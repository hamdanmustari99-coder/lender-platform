import { createClient } from '@supabase/supabase-js'

// Desktop (Electron): konfigurasi dikirim main process via preload
// (window.swf) — sinkron, sekali saat modul ini dievaluasi. Web: tetap
// pakai import.meta.env seperti sebelumnya (path web tidak berubah).
type SwfConfig = { url: string; anonKey: string }
type SwfBridge = { swf?: { getSupabaseConfig: () => SwfConfig } }
const bridge = (typeof window !== 'undefined' ? window : {}) as unknown as SwfBridge & {
  swf?: { getSupabaseConfig: () => SwfConfig }
}
const desktopCfg: SwfConfig | null = bridge.swf ? bridge.swf.getSupabaseConfig() : null

const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
const url = desktopCfg?.url || envUrl
const anonKey = desktopCfg?.anonKey || envKey

/** true kalau .env sudah diisi kredensial Supabase yang valid */
export const isConfigured =
  url.startsWith('https://') &&
  !url.includes('YOUR-PROJECT') &&
  anonKey.length > 20 &&
  !anonKey.includes('YOUR-ANON-KEY')

/**
 * Client selalu dibuat supaya modul lain bisa diimpor tanpa crash;
 * saat belum dikonfigurasi, request akan gagal dengan error jaringan
 * dan UI menampilkan banner konfigurasi.
 */
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key-not-configured',
)
