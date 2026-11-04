import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  convertCalon,
  fetchCalonNasabah,
  kycDocSignedUrl,
  setCalonStatus,
  subscribeToTables,
} from '../lib/api'
import type { CalonNasabah as Calon } from '../lib/api'
import { errMsg, fmtDate } from '../lib/format'

/**
 * M13 — Daftar calon nasabah dari petugas lapangan.
 * Convert 1-klik: buat akun (service_role) + isi profil + auto-assign rute
 * + tutup baris calon, semuanya dalam satu tombol.
 */

const STATUS_CLASS: Record<Calon['status'], string> = {
  baru: 'bg-amber-100 text-amber-800',
  diproses: 'bg-sky-100 text-sky-800',
  jadi_nasabah: 'bg-emerald-100 text-emerald-800',
  ditolak: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<Calon['status'], string> = {
  baru: 'Baru',
  diproses: 'Diproses',
  jadi_nasabah: 'Jadi nasabah',
  ditolak: 'Ditolak',
}

export default function CalonNasabah() {
  const [rows, setRows] = useState<Calon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [hasil, setHasil] = useState<string | null>(null)
  const [filter, setFilter] = useState<'semua' | Calon['status']>('semua')
  const [ktpOpen, setKtpOpen] = useState<string | null>(null)
  const [ktpUrl, setKtpUrl] = useState<string | null>(null)
  const [ktpErr, setKtpErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await fetchCalonNasabah())
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeToTables(['calon_nasabah'], () => void load())
  }, [load])

  const shown = useMemo(
    () => (filter === 'semua' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  )
  const belum = rows.filter((r) => r.status === 'baru' || r.status === 'diproses').length

  const doConvert = async (c: Calon) => {
    setBusy(c.id)
    setError(null)
    setHasil(null)
    try {
      const r = await convertCalon(c.id, true)
      setHasil(
        `${c.nama} jadi nasabah — akun ${r.email}${r.route_assigned ? ', otomatis masuk rute petugas' : ''}.`,
      )
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const doTolak = async (c: Calon) => {
    const note = window.prompt(`Alasan menolak ${c.nama}?`, 'Data tidak lengkap')
    if (note === null) return
    setBusy(c.id)
    setError(null)
    try {
      await setCalonStatus(c.id, 'ditolak', note)
      await load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  const lihatKtp = async (c: Calon) => {
    if (ktpOpen === c.id) {
      setKtpOpen(null)
      return
    }
    setKtpOpen(c.id)
    setKtpUrl(null)
    setKtpErr(null)
    if (!c.ktp_path) {
      setKtpErr('Calon ini tidak menyertakan foto KTP.')
      return
    }
    try {
      setKtpUrl(await kycDocSignedUrl(c.ktp_path))
    } catch (e) {
      setKtpErr(errMsg(e))
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Calon Nasabah</h1>
          <p className="-mt-1 text-sm text-slate-500">
            Didaftarkan petugas di lapangan. Convert 1 klik = akun + profil + rute tagihan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {belum > 0 && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              {belum} menunggu diproses
            </span>
          )}
          <Link
            to="/users/new"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Daftarkan langsung
          </Link>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {hasil && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{hasil}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['semua', 'baru', 'diproses', 'jadi_nasabah', 'ditolak'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              filter === s
                ? 'bg-slate-800 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s === 'semua' ? 'Semua' : STATUS_LABEL[s]}
            <span className="ml-1 text-slate-400">
              ({s === 'semua' ? rows.length : rows.filter((r) => r.status === s).length})
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((c) => (
          <div key={c.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{c.nama || '(tanpa nama)'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  {c.converted_user_id && (
                    <Link
                      to={`/users/${c.converted_user_id}`}
                      className="text-xs font-medium text-emerald-600 hover:underline"
                    >
                      buka nasabah →
                    </Link>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  NIK {c.nik || '—'} • HP {c.phone || '—'} • {c.wilayah || 'tanpa wilayah'}
                </div>
                <div className="text-xs text-slate-500">{c.alamat || 'alamat belum diisi'}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Petugas: {c.petugas?.full_name || c.petugas?.email || '—'} • {fmtDate(c.created_at)}
                  {c.owner_note ? ` • “${c.owner_note}”` : ''}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  onClick={() => void lihatKtp(c)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {ktpOpen === c.id ? 'Tutup KTP' : 'Lihat KTP'}
                </button>
                {(c.status === 'baru' || c.status === 'diproses') && (
                  <>
                    <button
                      onClick={() => void doConvert(c)}
                      disabled={busy === c.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === c.id ? 'Memproses…' : 'Convert 1-klik'}
                    </button>
                    <button
                      onClick={() => void doTolak(c)}
                      disabled={busy === c.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Tolak
                    </button>
                  </>
                )}
              </div>
            </div>

            {ktpOpen === c.id && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                {ktpErr && <div className="text-xs text-red-600">{ktpErr}</div>}
                {!ktpErr && !ktpUrl && <div className="text-xs text-slate-400">Memuat foto…</div>}
                {ktpUrl && (
                  <a href={ktpUrl} target="_blank" rel="noreferrer">
                    <img
                      src={ktpUrl}
                      alt={`KTP ${c.nama}`}
                      className="max-h-64 rounded-lg border border-slate-200"
                    />
                  </a>
                )}
              </div>
            )}
          </div>
        ))}

        {shown.length === 0 && (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            Belum ada calon nasabah di filter ini.
          </div>
        )}
      </div>
    </div>
  )
}
