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
import type { Installment, Loan, LoanStatus, Profile } from '../lib/api'
import {
  STATUS_KEANDALAN_CLASS,
  fmtDate,
  fmtRp,
  LOAN_STATUS_CLASS,
  LOAN_STATUS_COLOR,
  LOAN_STATUS_LABEL,
  errMsg,
} from '../lib/format'

/** Tanggal lokal (WIB) dalam format YYYY-MM-DD — hindari geser UTC. */
const todayWIB = (): string => {
  const d = new Date()
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000)
  return wib.toISOString().slice(0, 10)
}

const daysBetween = (from: string, to: string): number =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86400000,
  )

const waLink = (phone: string | null, nama: string, total: number, tempo: string) => {
  const num = (phone ?? '').replace(/^0/, '62').replace(/[^0-9]/g, '')
  const text = `Halo Bpk/Ibu ${nama}, mengingatkan jadwal jatuh tempo pinjaman sebesar ${fmtRp(
    total,
  )} pada ${tempo}.`
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}

const mapsLink = (lat: number | null, lng: number | null): string | null =>
  lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null

interface DueItem {
  loan: Loan
  nasabah: Profile
  installment: Installment
  daysLeft: number
}

interface OverdueItem {
  loan: Loan
  nasabah: Profile
  installments: Installment[]
  totalTunggakan: number
  lateDays: number
}

export default function Dashboard() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [setoranHariIni, setSetoranHariIni] = useState(0)
  const [dueSoon, setDueSoon] = useState<DueItem[]>([])
  const [overdue, setOverdue] = useState<OverdueItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [l, p, pay] = await Promise.all([
        fetchLoans(),
        fetchProfiles(),
        fetchPayments(),
      ])
      setLoans(l)
      setProfiles(p)

      const today = todayWIB()
      const hariIni = aggregateSetoran(pay).filter((r) => r.tanggal === today)
      setSetoranHariIni(hariIni.reduce((s, r) => s + r.total, 0))

      const byId = new Map(p.map((x) => [x.id, x]))
      const loanAktif = l.filter(
        (loan) => loan.status === 'disbursed' || loan.status === 'active',
      )
      const instByLoan = await fetchInstallmentsForLoans(loanAktif.map((x) => x.id))

      const due: DueItem[] = []
      const late: OverdueItem[] = []

      for (const loan of loanAktif) {
        const nasabah = byId.get(loan.user_id)
        if (!nasabah) continue
        const insts = (instByLoan.get(loan.id) ?? []).filter((i) => i.status !== 'paid')

        // Mendekati jatuh tempo: H-3 s/d hari H
        for (const inst of insts) {
          const dl = daysBetween(today, inst.due_date.slice(0, 10))
          if (dl >= 0 && dl <= 3) {
            due.push({ loan, nasabah, installment: inst, daysLeft: dl })
          }
        }

        // Telat bayar
        const telat = insts.filter((i) => i.due_date.slice(0, 10) < today)
        if (telat.length > 0) {
          const sorted = [...telat].sort((a, b) => a.due_date.localeCompare(b.due_date))
          late.push({
            loan,
            nasabah,
            installments: sorted,
            totalTunggakan: telat.reduce(
              (s, i) => s + (i.amount - (Number(i.amount_paid) || 0)),
              0,
            ),
            lateDays: daysBetween(sorted[0].due_date.slice(0, 10), today),
          })
        }
      }

      due.sort((a, b) => a.daysLeft - b.daysLeft)
      late.sort((a, b) => b.totalTunggakan - a.totalTunggakan)
      setDueSoon(due)
      setOverdue(late)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsub = subscribeToTables(
      ['loans', 'profiles', 'payments', 'installments'],
      () => void load(),
    )
    return unsub
  }, [load])

  const stats = useMemo(() => {
    const nasabah = profiles.filter((p) => p.role === 'nasabah')
    const activeLoans = loans.filter(
      (l) => l.status === 'disbursed' || l.status === 'active',
    )
    const outstanding = activeLoans.reduce((s, l) => s + l.amount, 0)
    const profit = activeLoans.reduce(
      (s, l) => s + Math.round((l.amount * Number(l.interest_rate)) / 100),
      0,
    )
    const lancar = nasabah.filter((n) => n.status_keandalan === 'LANCAR').length
    return {
      nasabah: nasabah.length,
      lancar,
      persenLancar: nasabah.length ? Math.round((lancar / nasabah.length) * 100) : 100,
      activeLoans: activeLoans.length,
      outstanding,
      profit,
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
      {/* Welcome banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
            Dashboard Manajemen Pinjaman
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Pantau peredaran modal, tagihan jatuh tempo, dan arus kas harian secara
            real-time.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/users/new"
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            + Registrasi Nasabah
          </Link>
          <Link
            to="/loans"
            className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
          >
            + Pinjaman Baru
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal memuat data: {error}
        </div>
      )}

      {/* 4 Key Executive Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-400">
            Total Modal Dipinjamkan
          </div>
          <div className="text-xl font-black text-slate-900 sm:text-2xl">
            {fmtRp(stats.outstanding)}
          </div>
          <div className="text-[10px] text-slate-500">
            {stats.activeLoans} Pinjaman Berjalan
          </div>
        </div>
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-primary-600">
            Estimasi Profit Bunga (20%)
          </div>
          <div className="text-xl font-black text-primary-600 sm:text-2xl">
            {fmtRp(stats.profit)}
          </div>
          <div className="text-[10px] font-medium text-primary-700">
            Bunga Flat 20% Terkunci
          </div>
        </div>
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-sky-600">
            Kas Masuk (Pelunasan/Cicil)
          </div>
          <div className="text-xl font-black text-sky-600 sm:text-2xl">
            {fmtRp(setoranHariIni)}
          </div>
          <div className="text-[10px] text-slate-400">Total Realisasi Pelunasan</div>
        </div>
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-amber-600">
            Total Nasabah Terdaftar
          </div>
          <div className="text-xl font-black text-slate-900 sm:text-2xl">
            {stats.nasabah} Orang
          </div>
          <div className="text-[10px] font-semibold text-amber-600">
            {stats.persenLancar}% Status Lancar
          </div>
        </div>
      </div>

      {/* TWO URGENT TABLES */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* TABLE 1: MENDekati JATUH TEMPO */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-amber-200/60 bg-amber-50/70 p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-amber-500" />
              <h3 className="text-sm font-extrabold text-amber-900">
                List Nasabah Mendekati Jatuh Tempo
              </h3>
            </div>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              {dueSoon.length} Nasabah
            </span>
          </div>
          <div className="flex-1 overflow-x-auto p-4">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 font-bold text-slate-400">
                <tr>
                  <th className="pb-2">Nasabah</th>
                  <th className="pb-2">Tempo</th>
                  <th className="pb-2 text-right">Tagihan</th>
                  <th className="pb-2 text-center">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dueSoon.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      Tidak ada nasabah yang mendekati jatuh tempo (H-3 s/d Hari H).
                    </td>
                  </tr>
                )}
                {dueSoon.map((d) => {
                  const rumah = mapsLink(d.nasabah.home_lat, d.nasabah.home_lng)
                  const sisa = d.installment.amount - (Number(d.installment.amount_paid) || 0)
                  return (
                    <tr key={d.installment.id}>
                      <td className="py-3 font-semibold text-slate-900">
                        <Link to={`/loans/${d.loan.id}`} className="hover:underline">
                          {d.nasabah.full_name}
                        </Link>
                        <br />
                        <span className="text-[10px] text-slate-400">
                          {d.loan.frequency === 'weekly' ? 'Mingguan' : 'Bulanan'} • cicilan #
                          {d.installment.seq}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            d.daysLeft === 0
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {d.daysLeft === 0 ? 'Hari Ini (Hari H)' : `H-${d.daysLeft}`}
                        </span>
                        <br />
                        <span className="text-[10px] text-slate-400">
                          {fmtDate(d.installment.due_date)}
                        </span>
                      </td>
                      <td className="py-3 text-right font-black text-slate-900">
                        {fmtRp(sisa)}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-center gap-1">
                          <a
                            href={waLink(
                              d.nasabah.phone,
                              d.nasabah.full_name,
                              sisa,
                              d.installment.due_date.slice(0, 10),
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded bg-primary-100 px-2 py-1 text-[10px] font-bold text-primary-800 transition hover:bg-primary-200"
                          >
                            💬 WA
                          </a>
                          {rumah && (
                            <a
                              href={rumah}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800 transition hover:bg-sky-200"
                            >
                              📍 Rute
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TABLE 2: TELAT BAYAR */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-200/60 bg-rose-50/70 p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-ping rounded-full bg-rose-600" />
              <h3 className="text-sm font-extrabold text-rose-900">
                List Nasabah Telat Bayar (Overdue)
              </h3>
            </div>
            <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-900">
              {overdue.length} Nasabah
            </span>
          </div>
          <div className="flex-1 overflow-x-auto p-4">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 font-bold text-slate-400">
                <tr>
                  <th className="pb-2">Nasabah</th>
                  <th className="pb-2">Keterlambatan</th>
                  <th className="pb-2 text-right">Tunggakan</th>
                  <th className="pb-2 text-center">Aksi Lapangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdue.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      Semua nasabah membayar tepat waktu (Tidak ada penunggak).
                    </td>
                  </tr>
                )}
                {overdue.map((o) => {
                  const rumah = mapsLink(o.nasabah.home_lat, o.nasabah.home_lng)
                  const kantor = mapsLink(o.nasabah.office_lat, o.nasabah.office_lng)
                  return (
                    <tr key={o.loan.id}>
                      <td className="py-3 font-semibold text-slate-900">
                        <Link to={`/loans/${o.loan.id}`} className="hover:underline">
                          {o.nasabah.full_name}
                        </Link>
                        <br />
                        <span className="text-[10px] text-slate-400">
                          {o.installments.length} cicilan telat
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">
                          Telat {o.lateDays} Hari
                        </span>
                      </td>
                      <td className="py-3 text-right font-black text-rose-600">
                        {fmtRp(o.totalTunggakan)}
                      </td>
                      <td className="py-3">
                        <div className="flex justify-center gap-1">
                          {rumah ? (
                            <a
                              href={rumah}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-rose-600 px-2 py-1 text-[10px] font-bold text-white shadow-sm transition hover:bg-rose-700"
                            >
                              🚨 Rumah
                            </a>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-400">
                              Rumah —
                            </span>
                          )}
                          {kantor ? (
                            <a
                              href={kantor}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-slate-900"
                            >
                              🏢 Kantor
                            </a>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-400">
                              Kantor —
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            Pencairan Pinjaman — 6 Bulan Terakhir
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" name="jumlah" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Pinjaman Terbaru
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">Nasabah</th>
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
                  {l.profiles?.full_name || l.user_id.slice(0, 8)}
                </td>
                <td className="py-2.5 font-medium text-slate-800">{fmtRp(l.amount)}</td>
                <td className="py-2.5 text-slate-600">
                  {l.tenor_months} {l.frequency === 'weekly' ? 'mgg' : 'bln'}
                </td>
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
                    className="text-xs font-medium text-primary-600 hover:underline"
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

      {/* Legenda status keandalan */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
        <span className="font-bold text-slate-500">Status Keandalan:</span>
        <span className={`rounded px-2 py-0.5 font-bold ${STATUS_KEANDALAN_CLASS.LANCAR}`}>
          LANCAR
        </span>
        <span className="text-slate-400">bayar tepat waktu</span>
        <span className={`rounded px-2 py-0.5 font-bold ${STATUS_KEANDALAN_CLASS.PERINGATAN}`}>
          PERINGATAN
        </span>
        <span className="text-slate-400">pernah telat, kini lunas</span>
        <span className={`rounded px-2 py-0.5 font-bold ${STATUS_KEANDALAN_CLASS.MACET}`}>
          MACET
        </span>
        <span className="text-slate-400">ada tunggakan aktif</span>
      </div>
    </div>
  )
}
