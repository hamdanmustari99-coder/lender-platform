import { useState, type FormEvent } from 'react'
import { supabase, isConfigured } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isConfigured) {
      setError('Konfigurasi Supabase belum diisi. Isi admin/.env terlebih dahulu.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) setError(err.message)
    } catch {
      setError('Tidak dapat menghubungi Supabase. Periksa koneksi dan konfigurasi.')
    } finally {
      setBusy(false)
    }
  }

  const inputClass =
    'w-full rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-primary-500 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800/20 bg-white p-8 shadow-2xl"
      >
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-2xl font-black text-white shadow-lg shadow-emerald-500/30">
            SW
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            SW<span className="text-primary-600">Finance</span>
          </h1>
          <p className="text-xs font-medium text-slate-500">
            Sistem Manajemen Pinjaman Dana &amp; Modal Usaha
          </p>
          <div className="inline-block rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
            🔒 Akses Terbatas Khusus Admin &amp; Owner
          </div>
        </div>

        {!isConfigured && (
          <div className="rounded-2xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800">
            ⚠️ Supabase belum dikonfigurasi — isi <code>admin/.env</code>{' '}
            terlebih dahulu.
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="loginEmail"
              className="mb-1 block text-xs font-bold text-slate-700"
            >
              Email Admin / Owner
            </label>
            <input
              id="loginEmail"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="loginPassword"
              className="mb-1 block text-xs font-bold text-slate-700"
            >
              Password
            </label>
            <input
              id="loginPassword"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3 text-sm font-bold text-white shadow-lg shadow-primary-600/30 transition transform active:scale-[0.99] hover:bg-primary-700 disabled:opacity-50"
          >
            <span>{busy ? 'Memproses…' : 'Masuk ke Dashboard'}</span>
            {!busy && (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            )}
          </button>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          &copy; 2026 SWFinance Core System. Sesuai Dokumen PRD.
        </p>
      </form>
    </div>
  )
}
