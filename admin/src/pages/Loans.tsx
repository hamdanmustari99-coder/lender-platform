import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLoans, subscribeToTables } from '../lib/api'
import type { Loan, LoanStatus } from '../lib/api'
import { fmtDate, fmtRp, LOAN_STATUS_CLASS, LOAN_STATUS_LABEL, errMsg } from '../lib/format'

const STATUSES: LoanStatus[] = ['disbursed', 'active', 'completed', 'rejected']

export default function Loans() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<LoanStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      setLoans(await fetchLoans())
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeToTables(['loans'], () => void load())
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return loans.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (!q) return true
      const name = l.profiles?.full_name?.toLowerCase() ?? ''
      const nik = l.profiles?.nik?.toLowerCase() ?? ''
      const phone = l.profiles?.phone?.toLowerCase() ?? ''
      return name.includes(q) || nik.includes(q) || phone.includes(q)
    })
  }, [loans, statusFilter, search])

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Pinjaman
        </h1>
        <Link
          to="/loans/new"
          className="hidden rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 lg:inline-block"
        >
          + Buatkan Pinjaman
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Search + filter status */}
      <div className="space-y-2">
        <input
          placeholder="Cari nama / NIK / telepon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none lg:w-64"
        />
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
          <button
            onClick={() => setStatusFilter('all')}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
              statusFilter === 'all'
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Semua
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                statusFilter === s
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {LOAN_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Tidak ada pinjaman yang cocok
        </div>
      )}

      {/* ---------- MOBILE: kartu per pinjaman ---------- */}
      <div className="space-y-3 lg:hidden">
        {filtered.map((l) => (
          <Link
            key={l.id}
            to={`/loans/${l.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-800">
                  {l.profiles?.full_name || '(tanpa nama)'}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {l.profiles?.nik || '—'}
                  {l.profiles?.phone ? ` • ${l.profiles.phone}` : ''}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LOAN_STATUS_CLASS[l.status]}`}
              >
                {LOAN_STATUS_LABEL[l.status]}
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className="text-lg font-black tracking-tight text-slate-900">
                {fmtRp(l.amount)}
              </span>
              <span className="text-xs text-slate-500">
                {l.frequency === 'weekly' ? 'Mingguan' : 'Bulanan'} •{' '}
                {l.frequency === 'weekly'
                  ? `${l.tenor_months} minggu`
                  : `${l.tenor_months} bln`}
              </span>
            </div>

            {l.requested_amount != null && l.requested_amount !== l.amount && (
              <div className="mt-1 text-[11px] text-amber-700">
                diusulkan {fmtRp(l.requested_amount)}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
              <span className="text-slate-500">
                Cicilan <span className="font-bold text-slate-700">{fmtRp(l.monthly_payment)}</span>
              </span>
              <span className="text-slate-400">{fmtDate(l.created_at)}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* ---------- DESKTOP: tabel ---------- */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3">Nasabah</th>
              <th className="px-4 py-3">Jumlah</th>
              <th className="px-4 py-3">Frekuensi</th>
              <th className="px-4 py-3">Tenor</th>
              <th className="px-4 py-3">Cicilan/Bln</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">
                    {l.profiles?.full_name || '(tanpa nama)'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {l.profiles?.nik || '—'}
                    {l.profiles?.phone ? ` • ${l.profiles.phone}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {fmtRp(l.amount)}
                  {l.requested_amount != null && l.requested_amount !== l.amount && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      diusulkan {fmtRp(l.requested_amount)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {l.frequency === 'weekly' ? 'Mingguan' : 'Bulanan'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {l.frequency === 'weekly'
                    ? `${l.tenor_months} minggu`
                    : `${l.tenor_months} bln`}
                </td>
                <td className="px-4 py-3 text-slate-600">{fmtRp(l.monthly_payment)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${LOAN_STATUS_CLASS[l.status]}`}
                  >
                    {LOAN_STATUS_LABEL[l.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {fmtDate(l.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/loans/${l.id}`}
                    className="text-xs font-medium text-primary-600 hover:underline"
                  >
                    Detail →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
