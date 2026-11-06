import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  aggregateSetoran,
  fetchInstallmentsForLoans,
  fetchLoans,
  fetchPayments,
  fetchProfiles,
  listNasabah,
  subscribeToTables,
} from '../lib/api'
import type { Installment, Loan, Profile } from '../lib/api'
import {
  STATUS_KEANDALAN_CLASS,
  fmtDate,
  fmtRp,
  LOAN_STATUS_CLASS,
  LOAN_STATUS_LABEL,
  errMsg,
  telHref,
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

/** Tombol aksi kontak: Telepon (tel:) + WA. Dipakai di list jatuh tempo & telat bayar. */
const KontakAksi = ({
  phone,
  nama,
  sisa,
  tempo,
}: {
  phone: string | null
  nama: string
  sisa: number
  tempo: string
}) => {
  const tel = telHref(phone)
  if (!tel) return null
  return (
    <div className="flex gap-1">
      <a
        href={tel}
        title={`Telepon ${nama}`}
        className="rounded bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-800 transition hover:bg-sky-200"
      >
        📞 Telpon
      </a>
      <a
        href={waLink(phone!, nama, sisa, tempo)}
        target="_blank"
        rel="noreferrer"
        className="rounded bg-primary-100 px-2 py-1 text-[10px] font-bold text-primary-800 transition hover:bg-primary-200"
      >
        💬 WA
      </a>
    </div>
  )
}

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
  const [totalNasabah, setTotalNasabah] = useState(0)
  const [setoranHariIni, setSetoranHariIni] = useState(0)
  const [dueSoon, setDueSoon] = useState<DueItem[]>([])
  const [overdue, setOverdue] = useState<OverdueItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [l, p, pay, nasabahPage] = await Promise.all([
        fetchLoans(),
        fetchProfiles(),
        fetchPayments(),
        listNasabah({ page: 1, pageSize: 1 }),
      ])
      setLoans(l)
      setProfiles(p)
      setTotalNasabah(nasabahPage.total)

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
      nasabah: totalNasabah,
      lancar,
      persenLancar: totalNasabah ? Math.round((lancar / totalNasabah) * 100) : 100,
      activeLoans: activeLoans.length,
      outstanding,
      profit,
    }
  }, [loans, profiles, totalNasabah])

  const recent = loans.slice(0, 5)

  if (loading) {
    return <div className="text-sm text-slate-500">Memuat data…</div>
  }

  return (
    <div className="space-y-6">
      {/* Page header: satu focal point untuk keputusan owner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Ringkasan operasional</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
            Pantau bisnis pinjaman
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Periksa modal berjalan, uang masuk, dan nasabah yang perlu ditindak hari ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/users/new"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-center text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg sm:flex-none sm:px-4"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25v4.5m2.25-2.25h-4.5" />
            </svg>
            <span>Registrasi Nasabah</span>
          </Link>
          <Link
            to="/loans/new"
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2.5 text-center text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-lg sm:flex-none sm:px-4"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.5A2.25 2.25 0 014.5 5.25h15A2.25 2.25 0 0121.75 7.5v9a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25v-9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12h.008v.008H15V12zM18.75 12h.008v.008h-.008V12z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4.5m2.25-2.25h-4.5" />
            </svg>
            <span>Pinjaman Baru</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal memuat data: {error}
        </div>
      )}

      {/* KPI utama: action-reveal shortcut — tiap kartu = shortcut ke halamannya,
          hover desktop memunculkan shortcut + shadow warna aksen kartu.
          Di mobile shortcut selalu tampil (bukan hover-only affordance). */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Link
          to="/loans"
          className="group block space-y-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_12px_30px_rgb(100_116_139/0.30)] focus-visible:border-slate-400 lg:p-5"
        >
          <div className="text-[10px] font-bold uppercase text-slate-400 lg:text-[11px]">
            Total Modal Dipinjamkan
          </div>
          <div className="text-lg font-black text-slate-900 sm:text-xl lg:text-2xl">
            <span data-metric>{fmtRp(stats.outstanding)}</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {stats.activeLoans} Pinjaman Berjalan
          </div>
          <div className="mt-1 flex -translate-x-1 items-center gap-1 text-[10px] font-bold text-slate-500 opacity-0 transition-[opacity,transform] duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 max-lg:translate-x-0 max-lg:opacity-100">
            Buka pinjaman <span aria-hidden>→</span>
          </div>
        </Link>
        <Link
          to="/laporan"
          className="group block space-y-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_12px_30px_rgb(22_163_74/0.28)] lg:p-5"
        >
          <div className="text-[10px] font-bold uppercase text-primary-600 lg:text-[11px]">
            Estimasi Profit Bunga (20%)
          </div>
          <div data-metric className="text-lg font-black text-primary-600 sm:text-xl lg:text-2xl">
            {fmtRp(stats.profit)}
          </div>
          <div className="text-[10px] font-medium text-primary-700">
            Bunga Flat 20% Terkunci
          </div>
          <div className="mt-1 flex -translate-x-1 items-center gap-1 text-[10px] font-bold text-primary-700 opacity-0 transition-[opacity,transform] duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 max-lg:translate-x-0 max-lg:opacity-100">
            Buka laporan <span aria-hidden>→</span>
          </div>
        </Link>
        <Link
          to="/setoran"
          className="group block space-y-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-sky-300 hover:shadow-[0_12px_30px_rgb(14_165_233/0.30)] lg:p-5"
        >
          <div className="text-[10px] font-bold uppercase text-sky-600 lg:text-[11px]">
            Kas Masuk (Pelunasan/Cicil)
          </div>
          <div data-metric className="text-lg font-black text-sky-600 sm:text-xl lg:text-2xl">
            {fmtRp(setoranHariIni)}
          </div>
          <div className="text-[10px] text-slate-400">Setoran tercatat hari ini (WIB)</div>
          <div className="mt-1 flex -translate-x-1 items-center gap-1 text-[10px] font-bold text-sky-700 opacity-0 transition-[opacity,transform] duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 max-lg:translate-x-0 max-lg:opacity-100">
            Lihat rincian harian <span aria-hidden>→</span>
          </div>
        </Link>
        <Link
          to="/users"
          className="group block space-y-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-amber-300 hover:shadow-[0_12px_30px_rgb(245_158_11/0.30)] lg:p-5"
        >
          <div className="text-[10px] font-bold uppercase text-amber-600 lg:text-[11px]">
            Total Nasabah Terdaftar
          </div>
          <div className="text-lg font-black text-slate-900 sm:text-xl lg:text-2xl">
            {stats.nasabah} Orang
          </div>
          <div className="text-[10px] font-semibold text-amber-600">
            {stats.persenLancar}% Status Lancar
          </div>
          <div className="mt-1 flex -translate-x-1 items-center gap-1 text-[10px] font-bold text-amber-700 opacity-0 transition-[opacity,transform] duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 max-lg:translate-x-0 max-lg:opacity-100">
            Lihat nasabah <span aria-hidden>→</span>
          </div>
        </Link>
      </div>

      {/* Action queue: ubah angka risiko menjadi keputusan yang bisa langsung dibuka */}
      <section className="dm-beam rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="action-queue-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="action-queue-title" className="text-base font-extrabold text-slate-900">Perlu ditindak hari ini</h3>
            <p className="mt-1 text-xs text-slate-500">Prioritas operasional berdasarkan jatuh tempo dan tunggakan aktif.</p>
          </div>
          <Link to="/loans" className="text-xs font-bold text-primary-700 hover:underline">Buka semua pinjaman →</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Link to="/loans?filter=due-soon" className="rounded-xl border border-amber-200 bg-amber-50 p-3 transition hover:border-amber-300">
            <span className="block text-2xl font-black tabular-nums text-amber-900">{dueSoon.length}</span>
            <span className="mt-1 block text-xs font-semibold text-amber-800">Mendekati jatuh tempo</span>
          </Link>
          <Link to="/loans?filter=overdue" className="rounded-xl border border-rose-200 bg-rose-50 p-3 transition hover:border-rose-300">
            <span className="block text-2xl font-black tabular-nums text-rose-900">{overdue.length}</span>
            <span className="mt-1 block text-xs font-semibold text-rose-800">Nasabah menunggak</span>
          </Link>
          <Link to="/users" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-slate-300 sm:col-span-1">
            <span className="block text-2xl font-black tabular-nums text-slate-900">{stats.nasabah}</span>
            <span className="mt-1 block text-xs font-semibold text-slate-700">Total nasabah terdaftar</span>
          </Link>
        </div>
      </section>

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
          <div className="flex-1 p-4">
            {/* MOBILE: kartu */}
            <div className="space-y-3 lg:hidden">
              {dueSoon.length === 0 && (
                <p className="py-2 text-center text-xs text-slate-400">
                  Tidak ada nasabah yang mendekati jatuh tempo (H-3 s/d Hari H).
                </p>
              )}
              {dueSoon.map((d) => {
                const rumah = mapsLink(d.nasabah.home_lat, d.nasabah.home_lng)
                const sisa = d.installment.amount - (Number(d.installment.amount_paid) || 0)
                return (
                  <div
                    key={d.installment.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/loans/${d.loan.id}`}
                        className="min-w-0 text-sm font-bold text-slate-900 hover:underline"
                      >
                        {d.nasabah.full_name}
                      </Link>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${
                          d.daysLeft === 0
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {d.daysLeft === 0 ? 'Hari H' : `H-${d.daysLeft}`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {d.loan.frequency === 'weekly' ? 'Mingguan' : 'Bulanan'} • cicilan #
                      {d.installment.seq} • {fmtDate(d.installment.due_date)}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-base font-black text-slate-900">
                        {fmtRp(sisa)}
                      </span>
                      <div className="flex gap-1">
                        <KontakAksi
                          phone={d.nasabah.phone}
                          nama={d.nasabah.full_name}
                          sisa={sisa}
                          tempo={d.installment.due_date.slice(0, 10)}
                        />
                        {rumah && (
                          <a
                            href={rumah}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded bg-sky-100 px-2.5 py-1.5 text-[10px] font-bold text-sky-800"
                          >
                            📍 Rute
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* DESKTOP: tabel */}
            <div className="hidden overflow-x-auto lg:block">
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
                            <KontakAksi
                              phone={d.nasabah.phone}
                              nama={d.nasabah.full_name}
                              sisa={sisa}
                              tempo={d.installment.due_date.slice(0, 10)}
                            />
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
          <div className="flex-1 p-4">
            {/* MOBILE: kartu */}
            <div className="space-y-3 lg:hidden">
              {overdue.length === 0 && (
                <p className="py-2 text-center text-xs text-slate-400">
                  Semua nasabah membayar tepat waktu (Tidak ada penunggak).
                </p>
              )}
              {overdue.map((o) => {
                const rumah = mapsLink(o.nasabah.home_lat, o.nasabah.home_lng)
                const kantor = mapsLink(o.nasabah.office_lat, o.nasabah.office_lng)
                return (
                  <div
                    key={o.loan.id}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/loans/${o.loan.id}`}
                        className="min-w-0 text-sm font-bold text-slate-900 hover:underline"
                      >
                        {o.nasabah.full_name}
                      </Link>
                      <span className="shrink-0 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">
                        Telat {o.lateDays} Hari
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {o.installments.length} cicilan telat
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-base font-black text-rose-600">
                        {fmtRp(o.totalTunggakan)}
                      </span>
                      <div className="flex gap-1">
                        <KontakAksi
                          phone={o.nasabah.phone}
                          nama={o.nasabah.full_name}
                          sisa={o.totalTunggakan}
                          tempo={o.installments[0].due_date.slice(0, 10)}
                        />
                        {rumah ? (
                          <a
                            href={rumah}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded bg-rose-600 px-2.5 py-1.5 text-[10px] font-bold text-white"
                          >
                            🚨 Rumah
                          </a>
                        ) : (
                          <span className="rounded bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-400">
                            Rumah —
                          </span>
                        )}
                        {kantor ? (
                          <a
                            href={kantor}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded bg-slate-800 px-2.5 py-1.5 text-[10px] font-bold text-white"
                          >
                            🏢 Kantor
                          </a>
                        ) : (
                          <span className="rounded bg-slate-100 px-2.5 py-1.5 text-[10px] text-slate-400">
                            Kantor —
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* DESKTOP: tabel */}
            <div className="hidden overflow-x-auto lg:block">
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
                            <KontakAksi
                              phone={o.nasabah.phone}
                              nama={o.nasabah.full_name}
                              sisa={o.totalTunggakan}
                              tempo={o.installments[0].due_date.slice(0, 10)}
                            />
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
      </div>

      {/* Pinjaman terbaru */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Pinjaman Terbaru
        </div>

        {/* MOBILE: kartu */}
        <div className="space-y-2.5 lg:hidden">
          {recent.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">Belum ada pinjaman</p>
          )}
          {recent.map((l) => (
            <Link
              key={l.id}
              to={`/loans/${l.id}`}
              className="block rounded-xl border border-slate-200 p-3 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-slate-800">
                  {l.profiles?.full_name || l.user_id.slice(0, 8)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LOAN_STATUS_CLASS[l.status]}`}
                >
                  {LOAN_STATUS_LABEL[l.status]}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-base font-black text-slate-900">{fmtRp(l.amount)}</span>
                <span className="text-xs text-slate-500">
                  {l.tenor_months} {l.frequency === 'weekly' ? 'mgg' : 'bln'}
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* DESKTOP: tabel */}
        <div className="hidden overflow-x-auto lg:block">
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
