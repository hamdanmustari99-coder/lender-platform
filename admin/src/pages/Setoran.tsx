import { useCallback, useEffect, useState } from 'react'
import {
  fetchPaymentsForDay,
  fetchSetoranHarian,
  subscribeToTables,
  voidAndRepay,
  voidPayment,
} from '../lib/api'
import type { Payment, SetoranHarianRow } from '../lib/api'
import { errMsg, fmtDate, fmtRp } from '../lib/format'

const PAGE_SIZE = 50

/**
 * M7 FR-A6b — Rekonsiliasi setoran: agregasi tunai tercatat per admin per hari
 * + rincian transaksi. Owner mencocokkan dengan uang fisik yang disetor.
 *
 * Agregasi dilakukan Postgres (RPC setoran_harian, tanggal WIB). Rincian
 * transaksi hanya di-fetch saat baris di-expand, jadi halaman tetap ringan
 * walau payment sudah puluhan ribu.
 */
export default function Setoran() {
  const [rows, setRows] = useState<SetoranHarianRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('') // yyyy-mm-dd, kosongkan = semua
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [detail, setDetail] = useState<Payment[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [voiding, setVoiding] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const load = useCallback(async (p: number, f: string) => {
    try {
      const r = await fetchSetoranHarian({
        page: p,
        pageSize: PAGE_SIZE,
        dari: f || undefined,
        sampai: f || undefined,
      })
      setRows(r.rows)
      setTotal(r.total)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page, filter)
  }, [load, page, filter])

  useEffect(() => {
    return subscribeToTables(['payments'], () => void load(page, filter))
  }, [load, page, filter])

  const toggleDay = async (r: SetoranHarianRow) => {
    const key = `${r.tanggal}|${r.pencatatId}`
    if (openDay === key) {
      setOpenDay(null)
      setDetail([])
      return
    }
    setOpenDay(key)
    setDetailLoading(true)
    try {
      setDetail(await fetchPaymentsForDay(r.tanggal, r.pencatatId))
    } catch (e) {
      setActionErr(errMsg(e))
      setDetail([])
    } finally {
      setDetailLoading(false)
    }
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
      await load(page, filter)
      // segarkan rincian yang sedang terbuka
      const cur = rows.find((r) => `${r.tanggal}|${r.pencatatId}` === openDay)
      if (cur) setDetail(await fetchPaymentsForDay(cur.tanggal, cur.pencatatId))
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setVoiding(null)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Setoran Harian</h1>
      <p className="-mt-2 text-sm text-slate-500">
        Tunai tercatat per admin per hari.
        Cocokkan dengan uang fisik — kalau beda, tanyakan selisihnya. 🤝
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
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
            setOpenDay(null)
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        {filter && (
          <button
            onClick={() => {
              setFilter('')
              setPage(1)
              setOpenDay(null)
            }}
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
                <th className="px-4 py-3">Pencatat</th>
                <th className="px-4 py-3">Transaksi</th>
                <th className="px-4 py-3">Total Tunai</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.tanggal}|${r.pencatatId}`
                const open = openDay === key
                return (
                  <>
                    <tr key={key} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{fmtDate(r.tanggal)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{r.pencatatNama}</td>
                      <td className="px-4 py-3 text-slate-600">{r.jumlah}x</td>
                      <td className="px-4 py-3 font-bold text-emerald-700">{fmtRp(r.total)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => void toggleDay(r)}
                          className="text-xs font-medium text-emerald-600 hover:underline"
                        >
                          {open ? 'Tutup ▲' : 'Rincian ▼'}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${key}-d`} className="bg-slate-50">
                        <td colSpan={5} className="px-6 py-3">
                          {detailLoading ? (
                            <div className="text-xs text-slate-400">Memuat rincian…</div>
                          ) : detail.length === 0 ? (
                            <div className="text-xs text-slate-400">Tidak ada transaksi</div>
                          ) : (
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
                          )}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setPage((v) => Math.max(1, v - 1))
              setOpenDay(null)
            }}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-xs text-slate-500">
            Halaman {page} dari {totalPages}
          </span>
          <button
            onClick={() => {
              setPage((v) => Math.min(totalPages, v + 1))
              setOpenDay(null)
            }}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Berikutnya →
          </button>
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
