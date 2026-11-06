import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteNasabah, listNasabah, subscribeToTables } from '../lib/api'
import type { NasabahRow } from '../lib/api'
import { useConfirm } from '../components/ConfirmDialog'
import { errMsg, telHref } from '../lib/format'

/* ============================================================
   Menu Nasabah — tampilan KARTU (mengikuti mockup acuan)
   ------------------------------------------------------------
   Mockup menampilkan tiap nasabah sebagai kartu kaya informasi:
   foto, NIK, WA, alamat rumah + link Maps, alamat kantor + link
   Maps, agunan/jaminan yang ditahan, jumlah pinjaman aktif, dan
   badge status keandalan. Tabel lama terlalu tipis — informasi
   yang dibutuhkan kolektor (alamat & jaminan) tidak terlihat.
   ============================================================ */

const PAGE_SIZE = 12

/** Warna badge status keandalan (M23) */
const STATUS_KEANDALAN_CLASS: Record<string, string> = {
  LANCAR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PERINGATAN: 'bg-amber-50 text-amber-700 border-amber-200',
  MACET: 'bg-red-50 text-red-700 border-red-200',
}
const STATUS_KEANDALAN_LABEL: Record<string, string> = {
  LANCAR: 'Lancar',
  PERINGATAN: 'Perhatian',
  MACET: 'Macet',
}

/** Link Google Maps dari koordinat shareloc */
function mapsLink(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null
  return `https://maps.google.com/?q=${lat},${lng}`
}

/** Inisial untuk fallback avatar */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

/** Normalisasi nomor WA ke format internasional */
function waHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('62') ? digits : digits.replace(/^0/, '62')
  return `https://wa.me/${intl}`
}

/** Format rupiah ringkas: 1.500.000 → "Rp 1,5 jt" (kartu sempit) */
function rupiah(n: number): string {
  const v = Math.round(n)
  if (v === 0) return 'Rp 0'
  if (Math.abs(v) >= 1_000_000) {
    const jt = v / 1_000_000
    const s = jt >= 10 ? jt.toFixed(0) : jt.toFixed(1).replace(/\.0$/, '')
    return `Rp ${s.replace('.', ',')} jt`
  }
  if (Math.abs(v) >= 1_000) return `Rp ${Math.round(v / 1_000)} rb`
  return `Rp ${v}`
}

/** Label frekuensi cicilan */
const FREQ_LABEL: Record<string, string> = {
  weekly: 'Mingguan',
  monthly: 'Bulanan',
}

/** Kartu satu nasabah */
function NasabahCard({
  row,
  onDelete,
  deleting,
}: {
  row: NasabahRow
  onDelete: (row: NasabahRow) => void
  deleting: boolean
}) {
  const mapsRumah = mapsLink(row.home_lat, row.home_lng)
  const mapsKantor = mapsLink(row.office_lat, row.office_lng)
  const pinjaman = row.pinjaman_detail ?? []
  const aktif = row.pinjaman_aktif ?? 0
  const status = row.status_keandalan ?? 'LANCAR'
  const dipinjam = row.total_dipinjam ?? 0
  const tagihan = row.total_tagihan ?? 0
  const sisa = row.total_sisa ?? 0
  const dibayar = row.total_dibayar ?? 0

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all overflow-hidden flex flex-col">
      {/* ---------- Header: avatar + identitas + badge ---------- */}
      <div className="p-5 pb-4 flex items-start gap-4">
        {row.foto_path ? (
          <img
            src={row.foto_path}
            alt={row.full_name}
            className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-sm">
            {initials(row.full_name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-slate-900 truncate">
              {row.full_name || '(tanpa nama)'}
            </h3>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                STATUS_KEANDALAN_CLASS[status] ?? STATUS_KEANDALAN_CLASS.LANCAR
              }`}
            >
              {STATUS_KEANDALAN_LABEL[status] ?? status}
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5">NIK: {row.nik || '—'}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {row.telat && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                Telat Bayar
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                aktif > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {aktif} Pinjaman Aktif
            </span>
          </div>
        </div>
      </div>

      {/* ---------- Kontak ---------- */}
      <div className="px-5 pb-3 flex items-center gap-2 text-xs">
        <span className="text-slate-400">📱</span>
        {telHref(row.phone) ? (
          <a
            href={telHref(row.phone)!}
            title={`Telepon ${row.full_name || 'nasabah'}`}
            className="font-semibold text-slate-700 hover:text-sky-700 hover:underline"
          >
            {row.phone}
          </a>
        ) : (
          <span className="font-semibold text-slate-700">{row.phone || '—'}</span>
        )}
      </div>

      {/* ---------- Nominal pinjaman ke owner (M25) ---------- */}
      {aktif > 0 && (
        <div className="mx-5 mb-4 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-admin-dark text-white">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
              Pinjaman ke Owner
            </p>
            <p className="text-lg font-black tracking-tight leading-tight">{rupiah(dipinjam)}</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200">
            <div className="px-3 py-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Tagihan</p>
              <p className="text-xs font-bold text-slate-800">{rupiah(tagihan)}</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Sisa</p>
              <p className={`text-xs font-bold ${sisa > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {rupiah(sisa)}
              </p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Dibayar</p>
              <p className="text-xs font-bold text-emerald-600">{rupiah(dibayar)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Alamat rumah & kantor ---------- */}
      <div className="px-5 pb-4 space-y-3 border-t border-slate-100 pt-4 flex-1">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            Alamat Rumah
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {row.alamat_rumah || <span className="text-slate-400 italic">Belum diisi</span>}
          </p>
          {mapsRumah && (
            <a
              href={mapsRumah}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
            >
              📍 Lihat di Maps
            </a>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
            Alamat Kantor
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            {row.alamat_kantor || <span className="text-slate-400 italic">Belum diisi</span>}
          </p>
          {mapsKantor && (
            <a
              href={mapsKantor}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
            >
              📍 Lihat di Maps
            </a>
          )}
        </div>

        {/* ---------- Rincian pinjaman + agunan (M25) ---------- */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
            Rincian Pinjaman &amp; Agunan
          </p>
          {pinjaman.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Tidak ada pinjaman berjalan</p>
          ) : (
            <ul className="space-y-2">
              {pinjaman.map((p) => (
                <li
                  key={p.id}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-slate-800">{rupiah(p.pokok)}</span>
                    <span className="text-[10px] font-bold text-slate-500 shrink-0">
                      {FREQ_LABEL[p.frekuensi] ?? p.frekuensi} × {p.tenor}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-500">
                      Sisa <span className={`font-bold ${p.sisa > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{rupiah(p.sisa)}</span>
                    </span>
                    <span className="text-[10px] text-slate-400">
                      lunas {rupiah(p.dibayar)}
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-slate-200">
                    <span className="shrink-0">🔒</span>
                    <p className="text-[11px] text-slate-600 leading-snug capitalize">
                      {p.tipe}
                      {p.detail && <span className="text-slate-400"> — {p.detail}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------- Footer aksi ---------- */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
        <Link
          to={`/users/${row.id}`}
          className="flex-1 text-center py-2 rounded-xl bg-admin-dark text-white text-xs font-bold hover:bg-slate-800 transition active:scale-[0.99]"
        >
          Detail &amp; Riwayat
        </Link>
        {row.phone && (
          <a
            href={waHref(row.phone)}
            target="_blank"
            rel="noreferrer"
            title="Chat WhatsApp"
            className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xs font-bold hover:bg-emerald-700 transition active:scale-[0.99]"
          >
            WA
          </a>
        )}
        {telHref(row.phone) && (
          <a
            href={telHref(row.phone)!}
            title={`Telepon ${row.full_name || 'nasabah'}`}
            className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center text-sm hover:bg-sky-700 transition active:scale-[0.99]"
          >
            📞
          </a>
        )}
        <button
          onClick={() => onDelete(row)}
          disabled={deleting}
          title={`Hapus ${row.full_name || 'nasabah'}`}
          className="w-10 h-10 rounded-xl bg-white border border-red-200 text-red-600 flex items-center justify-center text-xs font-bold hover:bg-red-50 transition disabled:opacity-50"
        >
          {deleting ? '…' : '🗑'}
        </button>
      </div>
    </div>
  )
}

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Daftar Nasabah</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} nasabah terdaftar — alamat, kontak, dan jaminan dalam satu kartu
          </p>
        </div>
        <Link
          to="/users/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition active:scale-[0.99]"
        >
          ➕ Daftarkan Nasabah
        </Link>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* ---------- Pencarian ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          placeholder="Cari nama / telepon / NIK…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-96 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
        />
        <span className="text-xs text-slate-500">
          {total} nasabah{totalPages > 1 && ` · halaman ${page}/${totalPages}`}
        </span>
      </div>

      {/* ---------- Grid kartu ---------- */}
      {loading && rows.length === 0 ? (
        <div className="text-sm text-slate-500">Memuat data…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-sm font-bold text-slate-600">Tidak ada nasabah yang cocok</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {rows.map((p) => (
            <NasabahCard
              key={p.id}
              row={p}
              onDelete={(r) => void doDelete(r)}
              deleting={deleting === p.id}
            />
          ))}
        </div>
      )}

      {/* ---------- Paginasi ---------- */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 px-5 py-3">
          <button
            onClick={() => setPage((v) => Math.max(1, v - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-sm font-bold text-slate-600">
            Halaman {page} dari {totalPages}
          </span>
          <button
            onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Berikutnya →
          </button>
        </div>
      )}

      {/* ---------- Legenda status keandalan ---------- */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
        <span className="font-bold text-slate-600">Status Keandalan:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Lancar — bayar tepat waktu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Perhatian — pernah telat ringan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Macet — tunggakan berat
        </span>
      </div>
    </div>
  )
}
