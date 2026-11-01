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
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none'

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          <div className="text-4xl">💵</div>
          <h1 className="mt-2 text-xl font-bold text-slate-800">Danaku Admin</h1>
          <p className="mt-1 text-sm text-slate-500">Masuk untuk memantau platform</p>
        </div>

        {!isConfigured && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800">
            ⚠️ Supabase belum dikonfigurasi — isi <code>admin/.env</code> terlebih
            dahulu.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />

        <label className="mb-1 mt-4 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
      </form>
    </div>
  )
}
