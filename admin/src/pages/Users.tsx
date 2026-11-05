import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteNasabah, listNasabah, subscribeToTables } from '../lib/api'
import type { NasabahRow } from '../lib/api'
import { useConfirm } from '../components/ConfirmDialog'
import { fmtDate, KYC_STATUS_CLASS, KYC_STATUS_LABEL, errMsg } from '../lib/format'

const PAGE_SIZE = 50

export default function Users() {
  const confirm = useConfirm()
  const [rows, setRows] = useState<NasabahRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async (p: number, q: string) => {
    try {
      const r = await listNasabah({ page: p, pageSize: PAGE_SIZE, search: q.trim() || undefined })
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
    void load(page, search)
  }, [load, page, search])

  // Realtime: balik ke halaman 1 biar urutan tidak melompat saat data berubah
  useEffect(() => {
    return subscribeToTables(['profiles', 'loans', 'installments'], () => {
      void load(1, search)
      setPage(1)
    })
  }, [load, search])

  // Debounce search supaya tidak request tiap ketikan
  useEffect(() => {
    const t = setTimeout(() => setPage(1), 300)
    return () => clearTimeout(t)
  }, [search])

  const doDelete = async (p: NasabahRow) => {
    const nama = p.full_name || '(tanpa nama)'
    const ok = await confirm({
      title: `Hapus nasabah ${nama}?`,
      message:
        'Semua datanya ikut terhapus: profil, pinjaman yang sudah lunas, cicilan, ' +
        'foto KTP/foto/jaminan, kontak darurat, rute, dan notifikasi.\n\n' +
        'Tindakan ini TIDAK bisa dibatalkan.',
      confirmText: 'Hapus',
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(p.id)
    setError(null)
    try {
      await deleteNasabah(p.id)
      await load(page, search)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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

      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Cari nama / email / telepon / NIK…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        />
        <span className="text-xs text-slate-500">
          {total} user{total === 1 ? '' : 's'}
          {totalPages > 1 && ` · halaman ${page}/${totalPages}`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Telepon</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">KYC</th>
              <th className="px-4 py-3">Telat</th>
              <th className="px-4 py-3">Terdaftar</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
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
                  <span className={`rounded-full px-2 py-0.5 text-xs ${KYC_STATUS_CLASS[p.kyc_status] ?? ''}`}>
                    {KYC_STATUS_LABEL[p.kyc_status] ?? p.kyc_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.telat ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Telat
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      Lancar
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(p.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      to={`/users/${p.id}`}
                      className="text-xs font-medium text-emerald-600 hover:underline"
                    >
                      Detail →
                    </Link>
                    <button
                      onClick={() => void doDelete(p)}
                      disabled={deleting === p.id}
                      title={`Hapus ${p.full_name || 'nasabah'}`}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting === p.id ? '…' : 'Hapus'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  Tidak ada user yang cocok
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((v) => Math.max(1, v - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-xs text-slate-500">
            Halaman {page} dari {totalPages}
          </span>
          <button
            onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Berikutnya →
          </button>
        </div>
      )}
    </div>
  )
}
