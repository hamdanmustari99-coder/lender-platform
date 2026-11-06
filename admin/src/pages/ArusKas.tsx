import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CASH_KATEGORI_KELUAR,
  CASH_KATEGORI_MASUK,
  createCashTransaction,
  fetchKasHarian,
  fetchCashByDate,
  subscribeToTables,
} from '../lib/api'
import type { CashTransaction, CashTipe, KasHarianRow } from '../lib/api'
import { useToast } from '../components/Toast'
import { fmtRp, errMsg } from '../lib/format'

const fmtTanggal = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

export default function ArusKas() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<KasHarianRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CashTransaction[]>([])
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // form
  const [fTipe, setFTipe] = useState<CashTipe>('KELUAR')
  const [fKategori, setFKategori] = useState<string>(CASH_KATEGORI_KELUAR[0])
  const [fNominal, setFNominal] = useState('')
  const [fPihak, setFPihak] = useState('')
  const [fMetode, setFMetode] = useState('Tunai')
  const [fCatatan, setFCatatan] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetchKasHarian({
        page,
        pageSize: 31,
        dari: dari || undefined,
        sampai: sampai || undefined,
      })
      setRows(r.rows)
      setTotal(r.total)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [page, dari, sampai])

  useEffect(() => {
    void load()
    const unsub = subscribeToTables(['cash_transactions'], () => void load())
    return unsub
  }, [load])

  // detail tanggal terpilih
  useEffect(() => {
    if (!selected) {
      setDetail([])
      return
    }
    let cancelled = false
    void fetchCashByDate(selected)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => !cancelled && setError(errMsg(e)))
    return () => {
      cancelled = true
    }
  }, [selected, rows])

  const totals = useMemo(() => {
    const masuk = rows.reduce((s, r) => s + r.masuk, 0)
    const keluar = rows.reduce((s, r) => s + r.keluar, 0)
    return { masuk, keluar, net: masuk - keluar }
  }, [rows])

  const submit = async () => {
    const nominal = Number(fNominal.replace(/[^0-9]/g, ''))
    if (!Number.isFinite(nominal) || nominal <= 0) {
      setError('Nominal harus angka lebih dari 0.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createCashTransaction({
        tipe: fTipe,
        kategori: fKategori,
        nominal,
        pihak: fPihak.trim(),
        metode: fMetode,
        catatan: fCatatan.trim(),
      })
      setShowModal(false)
      setFNominal('')
      setFPihak('')
      setFCatatan('')
      await load()
      if (selected) {
        setDetail(await fetchCashByDate(selected))
      }
      showToast('Transaksi kas berhasil dicatat.', 'success')
    } catch (e) {
      const message = errMsg(e)
      setError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const kategoriOptions = fTipe === 'MASUK' ? CASH_KATEGORI_MASUK : CASH_KATEGORI_KELUAR

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-primary-700">Keuangan · arus dana</p>
          <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">
            Arus Kas
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Jawab pertanyaan: uang bisnis bergerak ke mana? Pembayaran nasabah dan pencairan otomatis ikut tercatat.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="min-h-11 rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary-700"
        >
          + Catat Transaksi Kas
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal: {error}
        </div>
      )}

      {/* Ringkasan periode */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-primary-600">
            Total Uang Masuk
          </div>
          <div className="mt-1 text-2xl font-black text-primary-600">
            {fmtRp(totals.masuk)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-rose-600">
            Total Uang Keluar
          </div>
          <div className="mt-1 text-2xl font-black text-rose-600">
            {fmtRp(totals.keluar)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-400">
            Net Kas (Periode)
          </div>
          <div
            className={`mt-1 text-2xl font-black ${
              totals.net >= 0 ? 'text-primary-700' : 'text-rose-700'
            }`}
          >
            {totals.net >= 0 ? '+' : ''}
            {fmtRp(totals.net)}
          </div>
        </div>
      </div>

      {/* Filter tanggal */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">Dari</label>
          <input
            type="date"
            value={dari}
            onChange={(e) => {
              setDari(e.target.value)
              setPage(1)
            }}
            className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">Sampai</label>
          <input
            type="date"
            value={sampai}
            onChange={(e) => {
              setSampai(e.target.value)
              setPage(1)
            }}
            className="rounded-2xl border border-slate-300 px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </div>
        {(dari || sampai) && (
          <button
            onClick={() => {
              setDari('')
              setSampai('')
              setPage(1)
            }}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
          >
            Reset
          </button>
        )}
        <div className="ml-auto text-xs font-semibold text-slate-500">
          {total} hari dengan transaksi
        </div>
      </div>

      {/* Kalender ringkas: pilih tanggal */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Pilih Tanggal untuk Inspeksi
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.length === 0 && (
            <div className="text-sm text-slate-400">Belum ada transaksi kas.</div>
          )}
          {rows.map((r) => {
            const active = selected === r.tanggal
            return (
              <button
                key={r.tanggal}
                onClick={() => setSelected(active ? null : r.tanggal)}
                className={`rounded-2xl border px-3 py-2 text-left text-xs transition ${
                  active
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500'
                    : 'border-slate-200 bg-white hover:border-primary-400'
                }`}
              >
                <div className="font-bold text-slate-800">{fmtTanggal(r.tanggal)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary-500" />
                    <span className="text-[10px] font-bold text-primary-700">
                      {fmtRp(r.masuk)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-[10px] font-bold text-rose-700">
                      {fmtRp(r.keluar)}
                    </span>
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {r.jumlah} transaksi
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Detail tanggal terpilih */}
      {selected && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="text-sm font-extrabold text-slate-900">
              Rincian {fmtTanggal(selected)}
            </div>
            <div className="text-xs font-bold text-slate-500">
              {detail.length} transaksi
            </div>
          </div>
          {detail.length === 0 ? (
            <div className="text-sm text-slate-400">Tidak ada transaksi.</div>
          ) : (
            <div className="space-y-2">
              {detail.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800">{t.kategori}</div>
                    <div className="text-slate-500">
                      {t.pihak || '—'} • {t.metode}
                      {t.catatan ? ` • ${t.catatan}` : ''}
                    </div>
                  </div>
                  <div
                    className={`font-black ${
                      t.tipe === 'MASUK' ? 'text-primary-600' : 'text-rose-600'
                    }`}
                  >
                    {t.tipe === 'MASUK' ? '+' : '-'} {fmtRp(t.nominal)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {total > 31 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          >
            ← Sebelumnya
          </button>
          <span className="text-xs font-semibold text-slate-500">
            Halaman {page} dari {Math.ceil(total / 31)}
          </span>
          <button
            disabled={page >= Math.ceil(total / 31)}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          >
            Berikutnya →
          </button>
        </div>
      )}

      {/* MODAL: catat transaksi kas */}
      {showModal && (
        <div
          className="dm-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="dm-modal w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-extrabold text-slate-900">
                Catat Transaksi Kas Baru
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-bold text-slate-700">Tipe Mutasi</label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`cursor-pointer rounded-2xl border p-2.5 text-center transition ${
                      fTipe === 'MASUK'
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-slate-300 hover:border-primary-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cashTipe"
                      checked={fTipe === 'MASUK'}
                      onChange={() => {
                        setFTipe('MASUK')
                        setFKategori(CASH_KATEGORI_MASUK[0])
                      }}
                      className="text-primary-600"
                    />
                    <span className="mt-0.5 block font-bold text-primary-700">
                      Uang Masuk (In)
                    </span>
                  </label>
                  <label
                    className={`cursor-pointer rounded-2xl border p-2.5 text-center transition ${
                      fTipe === 'KELUAR'
                        ? 'border-rose-500 bg-rose-50'
                        : 'border-slate-300 hover:border-rose-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cashTipe"
                      checked={fTipe === 'KELUAR'}
                      onChange={() => {
                        setFTipe('KELUAR')
                        setFKategori(CASH_KATEGORI_KELUAR[0])
                      }}
                      className="text-rose-600"
                    />
                    <span className="mt-0.5 block font-bold text-rose-700">
                      Uang Keluar (Out)
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  Kategori Transaksi
                </label>
                <select
                  value={fKategori}
                  onChange={(e) => setFKategori(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white p-2.5 font-bold text-slate-800"
                >
                  {kategoriOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">Nominal (Rp)</label>
                <input
                  type="number"
                  min={1}
                  step={50000}
                  value={fNominal}
                  onChange={(e) => setFNominal(e.target.value)}
                  placeholder="500000"
                  className="w-full rounded-2xl border border-slate-300 p-2.5 text-sm font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Pihak Terkait
                  </label>
                  <input
                    type="text"
                    value={fPihak}
                    onChange={(e) => setFPihak(e.target.value)}
                    placeholder="Opsional"
                    className="w-full rounded-2xl border border-slate-300 p-2.5"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-bold text-slate-700">Metode</label>
                  <select
                    value={fMetode}
                    onChange={(e) => setFMetode(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white p-2.5 font-bold"
                  >
                    <option value="Tunai">Tunai</option>
                    <option value="Transfer BCA">Transfer BCA</option>
                    <option value="Transfer BRI">Transfer BRI</option>
                    <option value="Transfer Mandiri">Transfer Mandiri</option>
                    <option value="E-Wallet">E-Wallet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  Keterangan / Catatan
                </label>
                <input
                  type="text"
                  value={fCatatan}
                  onChange={(e) => setFCatatan(e.target.value)}
                  placeholder="Misal: Bensin survei lapangan"
                  className="w-full rounded-2xl border border-slate-300 p-2.5"
                />
              </div>

              <button
                onClick={() => void submit()}
                disabled={busy}
                className="w-full rounded-xl bg-primary-600 py-3 font-bold text-white shadow-md transition hover:bg-primary-700 disabled:opacity-50"
              >
                {busy ? 'Menyimpan…' : 'Simpan Transaksi Kas'}
              </button>
              <p className="text-center text-[10px] text-slate-400">
                Pembayaran cicilan &amp; pencairan pinjaman tercatat otomatis oleh sistem.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-slate-500" aria-live="polite">Memperbarui arus kas…</div>}
    </div>
  )
}
