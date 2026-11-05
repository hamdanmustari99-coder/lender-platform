import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  aggregateSetoran,
  fetchInstallmentsForLoans,
  fetchLoans,
  fetchPayments,
  fetchProfiles,
  subscribeToTables,
} from '../lib/api'
import type { Installment, Loan, LoanStatus, Payment, Profile } from '../lib/api'
import { fmtDate, fmtRp, LOAN_STATUS_CLASS, LOAN_STATUS_COLOR, LOAN_STATUS_LABEL, errMsg } from '../lib/format'

interface NunggakItem {
  loan: Loan
  borrowerName: string
  borrowerEmail: string
  telat: Installment[]
  totalTunggakan: number
}

export default function Dashboard() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [setoranHariIni, setSetoranHariIni] = useState(0)
  const [petugasAktif, setPetugasAktif] = useState(0)
  const [nunggak, setNunggak] = useState<NunggakItem[]>([])
  const [paymentsByNasabah, setPaymentsByNasabah] = useState<Map<string, Payment[]>>(new Map())
  const [openNunggak, setOpenNunggak] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [l, p, pay] = await Promise.all([fetchLoans(), fetchProfiles(), fetchPayments()])
      setLoans(l)
      setProfiles(p)
      const today = new Date().toISOString().slice(0, 10)
      const hariIni = aggregateSetoran(pay).filter((r) => r.tanggal === today)
      setSetoranHariIni(hariIni.reduce((s, r) => s + r.total, 0))
      setPetugasAktif(new Set(hariIni.map((r) => r.petugasId)).size)

      // Nunggak: cicilan unpaid lewat due_date.
      // Cicilan diambil sekali untuk semua pinjaman (bukan N+1 per pinjaman).
      const items: NunggakItem[] = []
      const loanAktif = l.filter(
        (loan) => loan.status === 'disbursed' || loan.status === 'active',
      )
      const instByLoan = await fetchInstallmentsForLoans(loanAktif.map((x) => x.id))
      for (const loan of loanAktif) {
        const insts = instByLoan.get(loan.id) ?? []
        const telat = insts.filter(
          (i) => i.status !== 'paid' && i.due_date.slice(0, 10) < today,
        )
        if (telat.length > 0) {
          items.push({
            loan,
            borrowerName:
              loan.profiles?.full_name || loan.profiles?.email || loan.user_id.slice(0, 8),
            borrowerEmail: loan.profiles?.email || '',
            telat: telat.sort((a, b) => a.due_date.localeCompare(b.due_date)),
            totalTunggakan: telat.reduce((s, i) => s + (i.amount - (i.amount_paid ?? 0)), 0),
          })
        }
      }
      items.sort((a, b) => b.totalTunggakan - a.totalTunggakan)
      setNunggak(items)

      // Riwayat pembayaran per nasabah (untuk cross-check)
      const byNasabah = new Map<string, Payment[]>()
      for (const pm of pay) {
        const arr = byNasabah.get(pm.nasabah_id) ?? []
        arr.push(pm)
        byNasabah.set(pm.nasabah_id, arr)
      }
      setPaymentsByNasabah(byNasabah)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTables(['loans', 'profiles', 'payments', 'installments'], () => void load())
    return unsub
  }, [load])

  const stats = useMemo(() => {
    const nasabah = profiles.filter((p) => p.role === 'nasabah').length
    const petugas = profiles.filter((p) => p.role === 'petugas').length
    const kycPending = profiles.filter((p) => p.kyc_status === 'pending').length
    const activeLoans = loans.filter(
      (l) => l.status === 'disbursed' || l.status === 'active',
    )
    const outstanding = activeLoans.reduce((s, l) => s + l.amount, 0)
    return {
      nasabah,
      petugas,
      kycPending,
      activeLoans: activeLoans.length,
      outstanding,
    }
  }, [loans, profiles])

  const monthly = useMemo(() => {
    const now = new Date()
    const months: { key: string; label: string; count: number; total: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        count: 0,
        total: 0,
      })
    }
    const idx = new Map(months.map((m, i) => [m.key, i]))
    for (const l of loans) {
      const d = new Date(l.created_at)
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`)
      if (i !== undefined) {
        months[i].count++
        months[i].total += l.amount
      }
    }
    return months
  }, [loans])

  const byStatus = useMemo(() => {
    const m = new Map<LoanStatus, number>()
    for (const l of loans) m.set(l.status, (m.get(l.status) ?? 0) + 1)
    return [...m.entries()].map(([status, value]) => ({
      name: LOAN_STATUS_LABEL[status],
      value,
      color: LOAN_STATUS_COLOR[status],
    }))
  }, [loans])

  const recent = loans.slice(0, 5)

  if (loading) {
    return <div className="text-sm text-slate-500">Memuat data…</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal memuat data: {error}
        </div>
      )}

      {/* Kartu statistik */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">
            Total Nasabah <span className="text-slate-400">({stats.petugas} petugas)</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-800">
            {stats.nasabah}
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">KYC Menunggu</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">
            {stats.kycPending}
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Pinjaman Berjalan</div>
          <div className="mt-1 text-2xl font-bold text-indigo-600">
            {stats.activeLoans}
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Total Outstanding</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">
            {fmtRp(stats.outstanding)}
          </div>
        </div>
      </div>

      {/* Setoran hari ini */}
      <Link to="/setoran" className="block">
        <div className="rounded-xl bg-emerald-700 p-5 text-white shadow-sm hover:bg-emerald-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-emerald-200">
                Setoran hari ini • {petugasAktif} petugas
              </div>
              <div className="mt-1 text-2xl font-bold">{fmtRp(setoranHariIni)}</div>
            </div>
            <div className="text-sm text-emerald-200">Lihat rincian →</div>
          </div>
        </div>
      </Link>

      {/* Nunggak — cross-check cepat */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">
            ⚠️ Nunggak ({nunggak.length} pinjaman)
          </div>
          <Link to="/laporan" className="text-xs font-medium text-emerald-600 hover:underline">
            Laporan lengkap →
          </Link>
        </div>
        {nunggak.length === 0 ? (
          <div className="text-sm text-slate-400">Tidak ada tunggakan 🎉</div>
        ) : (
          <div className="space-y-2">
            {nunggak.map((n) => {
              const open = openNunggak === n.loan.id
              const riwayat = (paymentsByNasabah.get(n.loan.user_id) ?? []).slice(0, 5)
              return (
                <div key={n.loan.id} className="rounded-lg border border-red-200">
                  <button
                    onClick={() => setOpenNunggak(open ? null : n.loan.id)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {n.borrowerName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {n.telat.length} cicilan telat • tunggakan{' '}
                        <span className="font-bold text-red-700">
                          {fmtRp(n.totalTunggakan)}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className="border-t border-red-100 px-4 py-3">
                      <div className="mb-2 text-xs font-semibold text-slate-600">
                        Cicilan telat:
                      </div>
                      {n.telat.map((t) => (
                        <div key={t.id} className="flex justify-between py-0.5 text-xs">
                          <span className="text-slate-600">
                            #{t.seq} • jatuh tempo {fmtDate(t.due_date)}
                            {Number(t.amount_paid) > 0 &&
                              ` • terbayar ${fmtRp(Number(t.amount_paid))}`}
                          </span>
                          <span className="font-medium text-red-700">
                            sisa {fmtRp(t.amount - (Number(t.amount_paid) || 0))}
                          </span>
                        </div>
                      ))}
                      <div className="mb-2 mt-3 text-xs font-semibold text-slate-600">
                        Riwayat bayar {n.borrowerName.split(' ')[0]} ({riwayat.length} terakhir):
                      </div>
                      {riwayat.length === 0 ? (
                        <div className="text-xs text-slate-400">
                          Belum pernah bayar sama sekali
                        </div>
                      ) : (
                        riwayat.map((pm) => (
                          <div key={pm.id} className="flex justify-between py-0.5 text-xs">
                            <span className="text-slate-600">
                              {fmtDate(pm.paid_at)} • via {pm.petugas?.full_name || '—'}
                              {pm.note ? ` • “${pm.note}”` : ''}
                            </span>
                            <span className="font-medium text-emerald-700">
                              {fmtRp(pm.amount)}
                            </span>
                          </div>
                        ))
                      )}
                      <div className="mt-3">
                        <Link
                          to={`/loans/${n.loan.id}`}
                          className="text-xs font-medium text-emerald-600 hover:underline"
                        >
                          Buka detail pinjaman →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            Pengajuan Pinjaman — 6 Bulan Terakhir
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" name="jumlah" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            Distribusi Status Pinjaman
          </div>
          {byStatus.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
              Belum ada data pinjaman
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(e: { name?: string; value?: number }) =>
                    `${e.name ?? ''} (${e.value ?? 0})`
                  }
                  labelLine={false}
                  fontSize={11}
                >
                  {byStatus.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Pinjaman terbaru */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Pinjaman Terbaru
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">Borrower</th>
              <th className="py-2">Jumlah</th>
              <th className="py-2">Tenor</th>
              <th className="py-2">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {recent.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 text-slate-700">
                  {l.profiles?.full_name || l.profiles?.email || l.user_id.slice(0, 8)}
                </td>
                <td className="py-2.5 font-medium text-slate-800">{fmtRp(l.amount)}</td>
                <td className="py-2.5 text-slate-600">{l.tenor_months} bln</td>
                <td className="py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${LOAN_STATUS_CLASS[l.status]}`}
                  >
                    {LOAN_STATUS_LABEL[l.status]}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <Link
                    to={`/loans/${l.id}`}
                    className="text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Detail →
                  </Link>
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Belum ada pinjaman
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
