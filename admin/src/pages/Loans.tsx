import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchInstallmentsForLoans, fetchLoans, subscribeToTables, wibDate } from '../lib/api'
import type { Loan, LoanStatus } from '../lib/api'
import { fmtDate, fmtRp, LOAN_STATUS_CLASS, LOAN_STATUS_LABEL, errMsg } from '../lib/format'

const STATUSES: LoanStatus[] = ['disbursed', 'active', 'completed', 'rejected']

export default function Loans() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loans, setLoans] = useState<Loan[]>([])
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set())
  const [overdueLoading, setOverdueLoading] = useState(false)
  const [dueSoonIds, setDueSoonIds] = useState<Set<string>>(new Set())
  const [dueSoonLoading, setDueSoonLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<LoanStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const overdueFilter = searchParams.get('filter') === 'overdue'
  const dueSoonFilter = searchParams.get('filter') === 'due-soon'

  /* Filter rentang tanggal peminjaman (created_at, basis WIB sama seperti
     agregasi server). Dipakai lewat URL (?dari=&sampai=) supaya bisa
     deep-link dari Dashboard dan direset dari URL. */
  const dateFrom = searchParams.get('dari') ?? ''
  const dateTo = searchParams.get('sampai') ?? ''
  const hasDateFilter = Boolean(dateFrom || dateTo)

  const setDateParam = (key: 'dari' | 'sampai', value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  const clearDateFilter = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('dari')
      next.delete('sampai')
      return next
    })
  }

  const todayWIB = (): string => {
    const d = new Date()
    return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

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
    return subscribeToTables(['loans', 'installments', 'payments'], () => void load())
  }, [load])

  useEffect(() => {
    if (!overdueFilter && !dueSoonFilter) {
      setOverdueIds(new Set())
      setDueSoonIds(new Set())
      return
    }
    let cancelled = false
    const active = loans.filter((l) => l.status === 'disbursed' || l.status === 'active')
    if (overdueFilter) setOverdueLoading(true)
    if (dueSoonFilter) setDueSoonLoading(true)
    void fetchInstallmentsForLoans(active.map((l) => l.id))
      .then((byLoan) => {
        if (cancelled) return
        const today = todayWIB()
        const overdue = new Set<string>()
        const dueSoon = new Set<string>()
        for (const loan of active) {
          const insts = (byLoan.get(loan.id) ?? []).filter((i) => i.status !== 'paid')
          if (insts.some((i) => i.due_date.slice(0, 10) < today)) overdue.add(loan.id)
          // H-3 s/d Hari H — sama dengan definisi "Mendekati jatuh tempo" di Dashboard
          if (
            insts.some((i) => {
              const dl = Math.round(
                (new Date(`${i.due_date.slice(0, 10)}T00:00:00Z`).getTime() -
                  new Date(`${today}T00:00:00Z`).getTime()) /
                  86400000,
              )
              return dl >= 0 && dl <= 3
            })
          )
            dueSoon.add(loan.id)
        }
        setOverdueIds(overdue)
        setDueSoonIds(dueSoon)
      })
      .catch(() => {
        if (!cancelled) {
          setOverdueIds(new Set())
          setDueSoonIds(new Set())
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOverdueLoading(false)
          setDueSoonLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [loans, overdueFilter, dueSoonFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return loans.filter((l) => {
      if (overdueFilter && !overdueIds.has(l.id)) return false
      if (dueSoonFilter && !dueSoonIds.has(l.id)) return false
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (dateFrom && wibDate(l.created_at) < dateFrom) return false
      if (dateTo && wibDate(l.created_at) > dateTo) return false
      if (!q) return true
      const name = l.profiles?.full_name?.toLowerCase() ?? ''
      const nik = l.profiles?.nik?.toLowerCase() ?? ''
      const phone = l.profiles?.phone?.toLowerCase() ?? ''
      return name.includes(q) || nik.includes(q) || phone.includes(q)
    })
  }, [loans, statusFilter, search, overdueFilter, overdueIds, dueSoonFilter, dueSoonIds, dateFrom, dateTo])

  const statusCount = (status: LoanStatus): number => loans.filter((l) => l.status === status).length

  if (loading) {
    return (
      <div className="space-y-3" aria-live="polite">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <span className="sr-only">Memuat data pinjaman…</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Portofolio pembiayaan</p>
          <h1 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Pinjaman</h1>
          <p className="mt-1 text-sm text-slate-500">Cari, filter, dan buka detail pinjaman tanpa kehilangan konteks pembayaran.</p>
        </div>
        <Link
          to="/loans/new"
          className="hidden rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 lg:inline-block"
        >
          + Buatkan Pinjaman
        </Link>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          <span>Gagal memuat pinjaman: {error}</span>
          <button onClick={() => void load()} className="min-h-11 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800">Coba lagi</button>
        </div>
      )}

      {overdueFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3" role="status">
          <div>
            <p className="text-sm font-extrabold text-rose-900">Pinjaman dengan cicilan menunggak</p>
            <p className="mt-0.5 text-xs text-rose-800">
              {overdueLoading ? 'Memeriksa jadwal cicilan…' : `${filtered.length} pinjaman perlu ditindak.`}
            </p>
          </div>
          <button
            onClick={() => setSearchParams({})}
            className="min-h-11 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
          >
            Tampilkan semua pinjaman
          </button>
        </div>
      )}

      {dueSoonFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" role="status">
          <div>
            <p className="text-sm font-extrabold text-amber-900">Nasabah mendekati jatuh tempo</p>
            <p className="mt-0.5 text-xs text-amber-800">
              {dueSoonLoading
                ? 'Memeriksa jadwal cicilan…'
                : `${filtered.length} pinjaman jatuh tempo dalam H-3 s.d. hari H.`}
            </p>
          </div>
          <button
            onClick={() => setSearchParams({})}
            className="min-h-11 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            Tampilkan semua pinjaman
          </button>
        </div>
      )}

      {/* Search + filter status */}
      <div className="space-y-2">
        <input
          placeholder="Cari nama / NIK / telepon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cari pinjaman berdasarkan nama, NIK, atau telepon"
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none lg:w-64"
        />
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
          <button
            onClick={() => setStatusFilter('all')}
            className="fin-segment shrink-0"
            data-active={statusFilter === 'all'}
          >
            Semua <span className="ml-1 opacity-70">{loans.length}</span>
          </button>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="fin-segment shrink-0"
              data-active={statusFilter === s}
            >
              {LOAN_STATUS_LABEL[s]} <span className="ml-1 opacity-70">{statusCount(s)}</span>
            </button>
          ))}
        </div>
        {/* Filter rentang tanggal peminjaman */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
            Peminjaman
            <span className="flex items-center gap-1.5">
              dari
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateParam('dari', e.target.value)}
                aria-label="Tanggal mulai peminjaman"
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 focus:border-primary-500 focus:outline-none"
              />
            </span>
            <span className="flex items-center gap-1.5">
              sampai
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateParam('sampai', e.target.value)}
                aria-label="Tanggal akhir peminjaman"
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 focus:border-primary-500 focus:outline-none"
              />
            </span>
          </label>
          {hasDateFilter && (
            <button
              onClick={clearDateFilter}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Reset tanggal ({filtered.length} hasil)
            </button>
          )}
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
      <div className="fin-table-shell hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
              <table className="fin-table w-full text-sm">
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
                <td className="fin-number px-4 py-3 font-medium text-slate-800">
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
                <td className="fin-number px-4 py-3 text-slate-600">{fmtRp(l.monthly_payment)}</td>
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
