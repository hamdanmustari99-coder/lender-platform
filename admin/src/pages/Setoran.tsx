import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  aggregateSetoran,
  fetchPayments,
  subscribeToTables,
  voidAndRepay,
  voidPayment,
} from '../lib/api'
import type { Payment } from '../lib/api'
import { errMsg, fmtDate, fmtRp } from '../lib/format'

/**
 * M7 FR-A6b — Rekonsiliasi setoran: agregasi tunai tercatat per petugas per hari
 * + rincian transaksi. Owner mencocokkan dengan uang fisik yang disetor.
 */
export default function Setoran() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('') // yyyy-mm-dd, kosongkan = semua
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPayments(await fetchPayments())
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeToTables(['payments'], () => void load())
  }, [load])

  const rows = useMemo(() => {
    const all = aggregateSetoran(payments)
    return filter ? all.filter((r) => r.tanggal === filter) : all
  }, [payments, filter])

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  const detailFor = (tanggal: string, petugasId: string) =>
    payments.filter(
      (p) => p.paid_at.slice(0, 10) === tanggal && (p.petugas_id ?? '-') === petugasId,
    )

  const [voidTarget, setVoidTarget] = useState<Payment | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidCorrect, setVoidCorrect] = useState('')

  const doVoid = async () => {
    if (!voidTarget) return
    if (!voidReason.trim()) {
      setActionErr('Alasan koreksi wajib diisi.')
      return
    }
    const correct = voidCorrect.trim() === '' ? 0 : Number(voidCorrect.replace(/[^0-9]/g, ''))
    if (voidCorrect.trim() !== '' && (!Number.isFinite(correct) || correct <= 0)) {
      setActionErr('Nominal yang benar harus angka lebih dari 0.')
      return
    }
    setActionErr(null)
    setVoiding(voidTarget.id)
    try {
      if (correct > 0) {
        await voidAndRepay(voidTarget.id, voidReason.trim(), correct, 'koreksi + input benar')
      } else {
        await voidPayment(voidTarget.id, voidReason.trim())
      }
      setVoidTarget(null)
      setVoidReason('')
      setVoidCorrect('')
      await load()
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setVoiding(null)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Setoran Petugas</h1>
      <p className="-mt-2 text-sm text-slate-500">
        Tunai tercatat per petugas per hari. Cocokkan dengan uang fisik saat petugas
        setor ke Anda — kalau beda, tanyakan selisihnya. 🤝
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {actionErr && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal koreksi: {actionErr}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Tampilkan semua
          </button>
        )}
        <div className="ml-auto text-sm text-slate-600">
          Total tampil: <span className="font-bold text-emerald-700">{fmtRp(grandTotal)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          Belum ada setoran tercatat
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Petugas</th>
                <th className="px-4 py-3">Transaksi</th>
                <th className="px-4 py-3">Total Tunai</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.tanggal}|${r.petugasId}`
                const open = openDay === key
                const detail = open ? detailFor(r.tanggal, r.petugasId) : []
                return (
                  <>
                    <tr key={key} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{fmtDate(r.tanggal)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {r.petugasNama}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{r.count}x</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">
                        {fmtRp(r.total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setOpenDay(open ? null : key)}
                          className="text-xs font-medium text-emerald-600 hover:underline"
                        >
                          {open ? 'Tutup ▲' : 'Rincian ▼'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${key}-d`} className="bg-slate-50">
                        <td colSpan={5} className="px-6 py-3">
                          <div className="space-y-1">
                            {detail.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span
                                  className={
                                    p.amount < 0 ? 'text-red-600' : 'text-slate-600'
                                  }
                                >
                                  {new Date(p.paid_at).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}{' '}
                                  • {p.nasabah?.full_name || '—'}
                                  {p.note ? ` • “${p.note}”` : ''}
                                </span>
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`font-medium ${p.amount < 0 ? 'text-red-600' : 'text-slate-800'}`}
                                  >
                                    {fmtRp(p.amount)}
                                  </span>
                                  {p.amount > 0 && (
                                    <button
                                      disabled={voiding === p.id}
                                      onClick={() => {
                                        setActionErr(null)
                                        setVoidReason('')
                                        setVoidCorrect('')
                                        setVoidTarget(p)
                                      }}
                                      className="font-medium text-amber-600 hover:underline disabled:opacity-50"
                                      title="Koreksi (reversal beraudit)"
                                    >
                                      Koreksi
                                    </button>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal koreksi (pengganti window.prompt) */}
      {voidTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setVoidTarget(null)
            setVoidReason('')
            setVoidCorrect('')
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-800">Koreksi Transaksi</h2>
            <p className="mt-1 text-sm text-slate-600">
              {fmtRp(voidTarget.amount)} • {voidTarget.nasabah?.full_name || '—'}
              {voidTarget.note ? ` • “${voidTarget.note}”` : ''}
            </p>
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Transaksi TIDAK dihapus — sistem mencatat koreksi lawan supaya jejak
              audit utuh. Baris merah −nominal akan muncul di bawahnya.
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Alasan koreksi (wajib)
            </label>
            <textarea
              autoFocus
              rows={2}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="cth: salah input, harusnya 50rb"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Nominal yang benar (opsional)
            </label>
            <input
              inputMode="numeric"
              value={voidCorrect}
              onChange={(e) => setVoidCorrect(e.target.value)}
              placeholder="cth: 50000 — kosongkan jika hanya batalkan"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Diisi = koreksi + langsung catat bayar yang benar (sekali klik).
              Dikosongkan = hanya batalkan transaksi salah.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setVoidTarget(null)
                  setVoidReason('')
                  setVoidCorrect('')
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                disabled={voiding === voidTarget.id || !voidReason.trim()}
                onClick={() => void doVoid()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {voiding === voidTarget.id
                  ? 'Memproses…'
                  : voidCorrect.trim() === ''
                    ? 'Simpan Koreksi'
                    : 'Koreksi + Catat Benar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
