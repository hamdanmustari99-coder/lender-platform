import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

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
