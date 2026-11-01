import { useCallback, useEffect, useState } from 'react'
import {
  fetchCalonNasabah,
  kycDocSignedUrl,
  setCalonStatus,
  subscribeToTables,
} from '../lib/api'
import type { CalonNasabah } from '../lib/api'
import { errMsg, fmtDate } from '../lib/format'

const STATUS_CLASS: Record<string, string> = {
  baru: 'bg-amber-100 text-amber-800',
  diproses: 'bg-sky-100 text-sky-800',
  jadi_nasabah: 'bg-emerald-100 text-emerald-800',
  ditolak: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<string, string> = {
  baru: 'Baru',
  diproses: 'Diproses',
  jadi_nasabah: 'Jadi Nasabah ✅',
  ditolak: 'Ditolak',
}

/**
 * M6b — Antrean calon nasabah dari petugas.
 * Owner: verifikasi → buatkan akun (via tool/GoTrue Admin, di luar web ini),
 * lalu tandai jadi_nasabah + isi converted_user_id, atau tolak dengan catatan.
 */
export default function CalonNasabah() {
  const [items, setItems] = useState<CalonNasabah[]>([])
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [converted, setConverted] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const list = await fetchCalonNasabah()
      setItems(list)
      setError(null)
      const next: Record<string, string> = {}
      for (const c of list) {
        if (c.ktp_path) {
          try {
            next[c.ktp_path] = await kycDocSignedUrl(c.ktp_path)
          } catch {
            /* biarkan tanpa URL */
          }
        }
      }
      setSigned(next)
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

  const act = async (
    c: CalonNasabah,
    status: CalonNasabah['status'],
  ) => {
    setActionErr(null)
    setBusyId(c.id)
    try {
      await setCalonStatus(
        c.id,
        status,
        notes[c.id] ?? '',
        status === 'jadi_nasabah' ? converted[c.id]?.trim() || null : null,
      )
      await load()
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Calon Nasabah</h1>
      <p className="-mt-2 text-sm text-slate-500">
        Dari petugas lapangan. Buatkan akun via{' '}
        <code>Authentication → Add user</code> di dashboard Supabase, lalu tandai{' '}
        <b>Jadi Nasabah</b> + tempel User ID-nya di bawah.
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {actionErr && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal: {actionErr}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Belum ada calon nasabah dari petugas
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{c.nama}</div>
                  <div className="text-xs text-slate-500">
                    dari {c.petugas?.full_name || c.petugas_id.slice(0, 8)} •{' '}
                    {fmtDate(c.created_at)}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[c.status]}`}
                >
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>

              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">NIK</dt>
                  <dd className="text-slate-800">{c.nik || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">No. HP</dt>
                  <dd className="text-slate-800">{c.phone || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Alamat</dt>
                  <dd className="text-right text-slate-800">{c.alamat || '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Wilayah</dt>
                  <dd className="text-slate-800">{c.wilayah || '—'}</dd>
                </div>
              </dl>

              {c.ktp_path && (
                <a
                  href={signed[c.ktp_path] ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block rounded-lg border border-slate-200 px-3 py-2 text-center text-xs text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                >
                  🪪 Lihat foto KTP
                </a>
              )}

              {(c.status === 'baru' || c.status === 'diproses') && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <input
                    placeholder="Catatan owner (opsional)…"
                    value={notes[c.id] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [c.id]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <input
                    placeholder="User ID hasil convert (UUID akun baru)…"
                    value={converted[c.id] ?? ''}
                    onChange={(e) =>
                      setConverted((n) => ({ ...n, [c.id]: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === c.id}
                      onClick={() => void act(c, 'diproses')}
                      className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      Proses
                    </button>
                    <button
                      disabled={busyId === c.id || !converted[c.id]?.trim()}
                      title="Isi User ID dulu"
                      onClick={() => void act(c, 'jadi_nasabah')}
                      className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Jadi Nasabah
                    </button>
                    <button
                      disabled={busyId === c.id}
                      onClick={() => void act(c, 'ditolak')}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              )}
              {c.converted_user_id && (
                <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 font-mono text-xs text-emerald-800">
                  → {c.converted_user_id}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
