import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNasabahTelatFlag, fetchProfiles, subscribeToTables } from '../lib/api'
import type { Profile } from '../lib/api'
import { fmtDate, KYC_STATUS_CLASS, KYC_STATUS_LABEL, errMsg } from '../lib/format'

export default function Users() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [telatMap, setTelatMap] = useState<Map<string, boolean>>(new Map())

  const load = useCallback(async () => {
    try {
      const list = await fetchProfiles()
      setProfiles(list)
      setError(null)
      // Badge Telat: 50 user pertama saja, cache di Map state
      const first50 = list.slice(0, 50)
      const entries = await Promise.all(
        first50.map(async (p) => {
          try {
            return [p.id, await fetchNasabahTelatFlag(p.id)] as const
          } catch {
            return null
          }
        }),
      )
      setTelatMap((prev) => {
        const next = new Map(prev)
        for (const e of entries) if (e) next.set(e[0], e[1])
        return next
      })
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeToTables(['profiles'], () => void load())
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(
      (p) => p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q),
    )
  }, [profiles, search])

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Users</h1>
        <Link
          to="/users/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          ➕ Daftarkan Nasabah
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <input
        placeholder="Cari nama / email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Telepon</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">KYC</th>
              <th className="px-4 py-3">Telat</th>
              <th className="px-4 py-3">Domisili</th>
              <th className="px-4 py-3">Terdaftar</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {p.full_name || '(tanpa nama)'}
                </td>
                <td className="px-4 py-3 text-slate-600">{p.phone || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      p.role === 'admin'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${KYC_STATUS_CLASS[p.kyc_status]}`}>
                    {KYC_STATUS_LABEL[p.kyc_status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {telatMap.get(p.id) === true ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Telat
                    </span>
                  ) : telatMap.get(p.id) === false ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      Lancar
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-500" title={p.current_address || ''}>
                  {p.current_address
                    ? p.current_address.length > 30
                      ? `${p.current_address.slice(0, 30)}…`
                      : p.current_address
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {fmtDate(p.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/users/${p.id}`}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Detail →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Tidak ada user yang cocok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
