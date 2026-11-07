import { useEffect, useState, type FormEvent } from 'react'
import { supabase, isConfigured } from '../lib/supabase'

function useWibClock() {
  const [wib, setWib] = useState('--:--')
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const tick = () => setWib(fmt.format(new Date()))
    tick()
    const id = setInterval(tick, 15000)
    return () => clearInterval(id)
  }, [])
  return wib
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wib = useWibClock()

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

  return (
    <div className="vault vault-screen">
      <div className="vault-silk" aria-hidden="true">
        <i />
        <i />
      </div>

      <header className="vault-bar vault-bar--top">
        <span>
          SWFinance <b>·</b> Panel Operasional
        </span>
        <span className="hidden sm:inline">
          Akses Level <b>Admin / Owner</b>
        </span>
      </header>

      <main className="vault-main">
        <div className="vault-monogram" aria-hidden="true">
          SW
        </div>
        <p className="vault-eyebrow">SW Finance Digital — Sejak 2026</p>
        <h1 className="vault-title">
          Modal kerja,
          <br />
          dikelola <em>dengan presisi.</em>
        </h1>
        <p className="vault-ided">
          Panel tunggal untuk setoran harian, arus kas, piutang, dan kelayakan
          nasabah — angka dihitung server-side, tercatat penuh.
        </p>

        <form className="vault-form" onSubmit={submit} noValidate>
          {!isConfigured && (
            <p className="vault-alert vault-alert--warn">
              Supabase belum dikonfigurasi — isi <code>admin/.env</code> terlebih
              dahulu.
            </p>
          )}
          {error && (
            <p className="vault-alert vault-alert--err" role="alert">
              {error}
            </p>
          )}

          <div className="vault-field">
            <label htmlFor="loginEmail">Email Admin / Owner</label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="email"
              placeholder="admin@swfinance.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="vault-field">
            <label htmlFor="loginPassword">Password</label>
            <input
              id="loginPassword"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="vault-cta" disabled={busy}>
            <span>{busy ? 'Memproses…' : 'Masuk ke Dashboard'}</span>
            <svg
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 12h15m0 0l-6-6m6 6l-6 6"
              />
            </svg>
          </button>
          <p className="vault-fine">
            Username/password hilang? Hubungi pemegang akun utama. Setiap sesi
            tercatat dalam audit trail sistem.
          </p>
        </form>
      </main>

      <footer className="vault-bar vault-bar--bottom">
        <span>© 2026 SWFinance Core System</span>
        <span className="vault-clock">
          Jakarta — <b>{wib}</b> WIB
        </span>
      </footer>
    </div>
  )
}
