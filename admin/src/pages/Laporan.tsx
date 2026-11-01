import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildPiutang,
  fetchInstallments,
  fetchLoans,
  subscribeToTables,
  totalLaba,
} from '../lib/api'
import type { Installment, Loan, PiutangNasabah } from '../lib/api'
import { errMsg, fmtRp } from '../lib/format'

/**
 * M7 FR-A6c — Laporan: sisa piutang per nasabah (urut terbesar),
 * daftar nunggak, total outstanding & laba kotor periode.
 */
export default function Laporan() {
  const [rows, setRows] = useState<PiutangNasabah[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const ls = await fetchLoans()
      setLoans(ls)
      // installments per loan (data MVP kecil — N+1 query masih wajar)
      const byLoan = new Map<string, Installment[]>()
      for (const l of ls) {
        if (l.status === 'rejected') continue
        try {
          byLoan.set(l.id, await fetchInstallments(l.id))
        } catch {
          byLoan.set(l.id, [])
        }
      }
      setRows(buildPiutang(ls, byLoan))
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

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  const totalSisa = rows.reduce((s, r) => s + r.sisa, 0)
  const totalBayar = rows.reduce((s, r) => s + r.totalBayar, 0)
  const totalTagihan = rows.reduce((s, r) => s + r.totalTagihan, 0)
  const nunggakRows = rows.filter((r) => r.nunggak > 0)
  const laba = totalLaba(loans)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Laporan</h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Total Tagihan</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{fmtRp(totalTagihan)}</div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Sudah Masuk</div>
          <div className="mt-1 text-xl font-bold text-emerald-600">{fmtRp(totalBayar)}</div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Sisa Piutang</div>
          <div className="mt-1 text-xl font-bold text-amber-600">{fmtRp(totalSisa)}</div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Laba Kotor (bunga)</div>
          <div className="mt-1 text-xl font-bold text-indigo-600">{fmtRp(laba)}</div>
        </div>
      </div>

      {/* Nunggak */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          ⚠️ Nunggak ({nunggakRows.length} nasabah)
        </div>
        {nunggakRows.length === 0 ? (
          <div className="text-sm text-slate-400">Tidak ada tunggakan 🎉</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2">Nasabah</th>
                <th className="py-2">Cicilan Telat</th>
                <th className="py-2">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {nunggakRows.map((r) => (
                <tr key={r.nasabahId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">
                    {r.nama}
                    <div className="text-xs font-normal text-slate-500">{r.email}</div>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      {r.nunggak} cicilan
                    </span>
                  </td>
                  <td className="py-2.5 font-medium text-slate-800">{fmtRp(r.sisa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Piutang per nasabah */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Sisa Piutang per Nasabah
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">Nasabah</th>
              <th className="py-2">Tagihan</th>
              <th className="py-2">Bayar</th>
              <th className="py-2">Sisa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nasabahId} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 font-medium text-slate-800">
                  <Link
                    to={`/users/${r.nasabahId}`}
                    className="hover:text-emerald-700 hover:underline"
                  >
                    {r.nama}
                  </Link>
                  <div className="text-xs font-normal text-slate-500">{r.email}</div>
                </td>
                <td className="py-2.5 text-slate-600">{fmtRp(r.totalTagihan)}</td>
                <td className="py-2.5 text-emerald-700">{fmtRp(r.totalBayar)}</td>
                <td className="py-2.5 font-bold text-slate-800">{fmtRp(r.sisa)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  Belum ada pinjaman berjalan
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
