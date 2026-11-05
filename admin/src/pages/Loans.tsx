import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLoans, subscribeToTables } from '../lib/api'
import type { Loan, LoanStatus } from '../lib/api'
import { fmtDate, fmtRp, LOAN_STATUS_CLASS, LOAN_STATUS_LABEL, errMsg } from '../lib/format'

const STATUSES: LoanStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'disbursed',
  'active',
  'completed',
]

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
      const email = l.profiles?.email?.toLowerCase() ?? ''
      return name.includes(q) || email.includes(q)
    })
  }, [loans, statusFilter, search])

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Pinjaman</h1>
        <Link
          to="/loans/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + Buatkan Pinjaman
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Cari nama / email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            statusFilter === 'all'
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          } border border-slate-200`}
        >
          Semua
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
              statusFilter === s
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {LOAN_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
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
                  <div className="text-xs text-slate-500">{l.profiles?.email}</div>
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
                  Tidak ada pinjaman yang cocok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
