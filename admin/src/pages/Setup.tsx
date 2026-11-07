import { useState, type FormEvent } from 'react'

type Props = { onSaved: () => void }

/**
 * Layar Setup first-run (desktop saja): laptop klien mengisi URL + anon key
 * Supabase sekali; nilai disimpan di userData (per-mesin, survive update).
 * Kedua nilai bersifat publik — anon key memang dipakai oleh semua client.
 */
export default function Setup({ onSaved }: Props) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const swf = (window as unknown as {
      swf?: { saveSupabaseConfig: (cfg: { url: string; anonKey: string }) => Promise<{ ok: boolean; error?: string }> }
    }).swf
    if (!swf?.saveSupabaseConfig) {
      setError('Fitur ini hanya tersedia di aplikasi desktop.')
      return
    }
    setBusy(true)
    try {
      const res = await swf.saveSupabaseConfig({ url: url.trim(), anonKey: key.trim() })
      if (!res.ok) {
        setError(res.error || 'Konfigurasi tidak valid.')
        return
      }
      onSaved()
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
          SWFinance <b>·</b> Penyiapan Awal
        </span>
        <span className="hidden sm:inline">
          Sekali saja di komputer ini
        </span>
      </header>

      <main className="vault-main">
        <div className="vault-monogram" aria-hidden="true">
          SW
        </div>
        <p className="vault-eyebrow">Penyiapan Koneksi</p>
        <h1 className="vault-title">
          Hubungkan ke <em>server data.</em>
        </h1>
        <p className="vault-ided">
          Masukkan alamat proyek Supabase dan anon key yang diberikan
          administrator. Nilai ini disimpan di komputer ini saja dan tidak
          perlu diisi ulang.
        </p>

        <form
          className="vault-form"
          onSubmit={submit}
          noValidate
        >
          {error && (
            <p className="vault-alert vault-alert--err" role="alert">
              {error}
            </p>
          )}

          <div className="vault-field">
            <label htmlFor="setupUrl">Project URL</label>
            <input
              id="setupUrl"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://xxxxx.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="vault-field">
            <label htmlFor="setupKey">Anon Key (publishable)</label>
            <input
              id="setupKey"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="eyJhbGciOi..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </div>

          <button type="submit" className="vault-cta" disabled={busy}>
            <span>{busy ? 'Menyimpan…' : 'Simpan dan Lanjut'}</span>
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
            Anon key bukan kunci rahasia — aman dipakai di sisi aplikasi. Akses
            data tetap dikendalikan login dan kebijakan keamanan server.
          </p>
        </form>
      </main>

      <footer className="vault-bar vault-bar--bottom">
        <span>© 2026 SWFinance Core System</span>
        <span className="vault-clock">Penyiapan Awal</span>
      </footer>
    </div>
  )
}
