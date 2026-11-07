import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buatPdf } from '../lib/report-pdf'
import { saveAndShare, saveCsv, toCsv } from '../lib/export'
import {
  fetchLaporanBulanan,
  fetchLaporanRingkasan,
  subscribeToTables,
} from '../lib/api'
import type { LaporanBulanan } from '../lib/api'
import type { PiutangNasabah } from '../lib/api'
import { errMsg, fmtDate, fmtRp } from '../lib/format'

/* ============================================================
   Laporan Bulanan (M26)
   ------------------------------------------------------------
   Permintaan klien: "fungsi laporan bulanan bentuk pdf / csv bisa
   ga? dalam laporan nya yang menarik tapi jangan cuma kyc table
   list aja"

   Sebelumnya halaman ini cuma 4 kartu angka + 2 tabel daftar.
   Sekarang satu RPC (laporan_bulanan) mengembalikan 8 seksi:
   ringkasan eksekutif, tren 6 bulan, sebaran status keandalan,
   top nasabah, arus kas, metode bayar, dan kinerja admin —
   divisualkan dengan grafik, bukan tabel doang.

   Ekspor (lib/export.ts + lib/report-pdf.ts):
     * PDF  -> jsPDF merender laporan ke byte PDF asli. Dulu window.print(),
               tapi WebView Android tidak punya print sehingga tombol mati.
     * CSV  -> 3 berkas logis (ringkasan, tren, top nasabah).
     Di web: unduhan blob. Di APK: tulis ke Documents/SWFinance + share sheet.
   ============================================================ */

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]


/** Warna tiap status keandalan — dipakai grafik donat & bar */
const STATUS_WARNA: Record<string, string> = {
  LANCAR: '#16a34a',
  PERINGATAN: '#f59e0b',
  MACET: '#dc2626',
}

/** Tooltip kustom buat recharts (biar nominalnya format rupiah) */
function RpTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-bold text-slate-700">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-slate-600">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="font-semibold">{p.name}</span>
          <span className="ml-auto font-bold text-slate-800">{fmtRp(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  )
}

export default function Laporan() {
  const [bulan, setBulan] = useState<number>(new Date().getMonth() + 1)
  const [tahun, setTahun] = useState<number>(new Date().getFullYear())
  const [lap, setLap] = useState<LaporanBulanan | null>(null)
  const [ringkasan, setRingkasan] = useState<{
    totalTagihan: number
    totalBayar: number
    totalSisa: number
    laba: number
    jumlahNunggak: number
    perNasabah: PiutangNasabah[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** null = idle, 'pdf' / 'csv' = ekspor sedang jalan */
  const [eksporBusy, setEksporBusy] = useState<'pdf' | 'csv' | null>(null)
  const [eksporInfo, setEksporInfo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, r] = await Promise.all([
        fetchLaporanBulanan(bulan, tahun),
        fetchLaporanRingkasan(),
      ])
      setLap(l)
      setRingkasan(r)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [bulan, tahun])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime: data berubah -> angka laporan ikut segar
  useEffect(() => {
    return subscribeToTables(['loans', 'installments', 'payments', 'cash_transactions'], () => {
      void load()
    })
  }, [load])

  const rk = lap?.ringkasan
  const periode = lap?.periode

  /** Kolektibilitas = terkumpul bersih / jatuh tempo */
  const kolektibilitas = useMemo(() => {
    if (!rk || !rk.jatuh_tempo) return 0
    return Math.round((rk.terkumpul_bersih / rk.jatuh_tempo) * 1000) / 10
  }, [rk])

  /** Data grafik tren (recharts butuh bentuk array of object) */
  const trenData = useMemo(
    () =>
      (lap?.tren ?? []).map((t) => ({
        nama: t.label_panjang.replace(/ \d{4}$/, ''),
        label: t.label_panjang,
        Pencairan: t.pencairan,
        Terkumpul: t.terkumpul,
        'Jatuh Tempo': t.jatuh_tempo,
      })),
    [lap],
  )

  /** Data donat status keandalan (hanya yang jumlahnya > 0) */
  const statusData = useMemo(
    () =>
      (lap?.status ?? [])
        .filter((s) => s.jumlah > 0)
        .map((s) => ({ name: s.label, value: s.jumlah, sisa: s.sisa, kode: s.kode })),
    [lap],
  )

  const trenKosong = trenData.every(
    (t) => !t.Pencairan && !t.Terkumpul && !t['Jatuh Tempo'],
  )

  const eksporCSV = async () => {
    if (!lap || !rk || !periode) return
    const p = `${periode.tahun}-${String(periode.bulan).padStart(2, '0')}`
    const pre = `laporan_${p}`
    setEksporBusy('csv')
    setEksporInfo('')
    try {
      // 1. Ringkasan + arus kas
      await saveCsv(
        `${pre}_ringkasan.csv`,
        toCsv([
          ['Laporan Bulanan SWFinance'],
          ['Periode', `${periode.nama_bulan} ${periode.tahun}`],
          ['Rentang', `${periode.dari} s/d ${periode.sampai}`],
          [],
          ['Metrik', 'Nilai (Rp)'],
          ['Modal dipinjamkan (pencairan)', rk.pencairan],
          ['Pinjaman baru', rk.pinjaman_baru],
          ['Nasabah baru', rk.nasabah_baru],
          ['Tagihan jatuh tempo', rk.jatuh_tempo],
          ['Terkumpul (bruto)', rk.terkumpul],
          ['Koreksi pembayaran', rk.koreksi],
          ['Terkumpul bersih', rk.terkumpul_bersih],
          ['Kolektibilitas (%)', kolektibilitas],
          ['Laba bunga', rk.laba_bunga],
          ['Sisa piutang', rk.sisa_piutang],
          ['Total modal berjalan', rk.total_modal],
          ['Pinjaman berjalan', rk.pinjaman_berjalan],
          ['Nasabah aktif (bayar bulan ini)', rk.nasabah_aktif],
          [],
          ['Arus Kas', 'Nilai (Rp)'],
          ['Kas masuk - pembayaran', lap.arus_kas.masuk_pembayaran],
          ['Kas masuk - lainnya', lap.arus_kas.masuk_lain],
          ['Kas keluar - pencairan', lap.arus_kas.keluar_pencairan],
          ['Kas keluar - lainnya', lap.arus_kas.keluar_lain],
          [
            'Kas bersih',
            lap.arus_kas.masuk_pembayaran +
              lap.arus_kas.masuk_lain -
              lap.arus_kas.keluar_pencairan -
              lap.arus_kas.keluar_lain,
          ],
        ]),
      )

      // 2. Tren 6 bulan
      await saveCsv(
        `${pre}_tren.csv`,
        toCsv([
          ['Bulan', 'Pencairan', 'Terkumpul', 'Jatuh Tempo'],
          ...(lap.tren ?? []).map((t) => [t.label_panjang, t.pencairan, t.terkumpul, t.jatuh_tempo]),
        ]),
      )

      // 3. Top nasabah
      await saveCsv(
        `${pre}_top_nasabah.csv`,
        toCsv([
          ['Peringkat', 'Nasabah', 'NIK', 'Status Keandalan', 'Pinjaman', 'Sisa Piutang'],
          ...(lap.top_nasabah ?? []).map((t, i) => [i + 1, t.nama, t.nik, t.status, t.pinjaman, t.sisa]),
        ]),
      )

      setEksporInfo('3 berkas CSV tersimpan — cek Documents/SWFinance atau menu berbagi.')
    } catch (e) {
      setError(`Ekspor CSV gagal: ${errMsg(e)}`)
    } finally {
      setEksporBusy(null)
    }
  }

  const eksporPDF = async () => {
    if (!lap || !rk || !periode) return
    setEksporBusy('pdf')
    setEksporInfo('')
    try {
      const p = `${periode.tahun}-${String(periode.bulan).padStart(2, '0')}`
      const buf = buatPdf(lap, {
        kolektibilitas,
        kasMasuk: (lap.arus_kas.masuk_pembayaran ?? 0) + (lap.arus_kas.masuk_lain ?? 0),
        kasKeluar: (lap.arus_kas.keluar_pencairan ?? 0) + (lap.arus_kas.keluar_lain ?? 0),
      })
      await saveAndShare(`laporan_${p}.pdf`, buf, 'application/pdf')
      setEksporInfo('PDF tersimpan — cek Documents/SWFinance atau menu berbagi.')
    } catch (e) {
      setError(`Ekspor PDF gagal: ${errMsg(e)}`)
    } finally {
      setEksporBusy(null)
    }
  }

  if (loading && !lap) return <div className="text-sm text-slate-500">Memuat laporan…</div>

  const nunggakRows = (ringkasan?.perNasabah ?? []).filter((r) => r.nunggak > 0)
  const kasMasuk = (lap?.arus_kas.masuk_pembayaran ?? 0) + (lap?.arus_kas.masuk_lain ?? 0)
  const kasKeluar = (lap?.arus_kas.keluar_pencairan ?? 0) + (lap?.arus_kas.keluar_lain ?? 0)
  const maksSisa = Math.max(...(lap?.top_nasabah ?? []).map((x) => x.sisa), 1)

  return (
    <div className="space-y-6">
      {/* ---------- Kontrol periode + tombol ekspor (tidak ikut tercetak) ---------- */}
      <div className="no-print flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Laporan Bulanan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan eksekutif, tren, dan arus kas per periode
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Bulan
            </label>
            <select
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {NAMA_BULAN.map((n, i) => (
                <option key={i} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Tahun
            </label>
            <select
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => void eksporPDF()}
            disabled={eksporBusy !== null}
            className="min-h-11 rounded-xl bg-admin-dark px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-55"
          >
            {eksporBusy === 'pdf' ? 'Membuat PDF…' : '📄 Unduh PDF'}
          </button>
          <button
            onClick={() => void eksporCSV()}
            disabled={eksporBusy !== null}
            className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-55"
          >
            {eksporBusy === 'csv' ? 'Menyiapkan CSV…' : '📊 Unduh CSV'}
          </button>
        </div>
      </div>

      {eksporInfo && (
        <div className="no-print rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
          ✓ {eksporInfo}
        </div>
      )}

      {error && (
        <div className="no-print rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* ============ ISI LAPORAN (yang ikut tercetak) ============ */}
      <div id="laporan-cetak" className="space-y-6">
        {/* ---------- Kop laporan (khusus tampil saat dicetak) ---------- */}
        <div className="hidden print:block">
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                SW<span className="text-emerald-600">Finance</span>
              </h2>
              <p className="text-xs text-slate-500">
                Laporan Manajemen Peminjaman Dana &amp; Modal Usaha
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p className="font-bold">Laporan Bulanan</p>
              <p>
                {periode?.nama_bulan} {periode?.tahun}
              </p>
              <p>
                {periode?.dari && fmtDate(periode.dari)} —{' '}
                {periode?.sampai && fmtDate(periode.sampai)}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Dicetak {fmtDate(new Date().toISOString())}
              </p>
            </div>
          </div>
        </div>

        {/* ---------- 1. Metrik eksekutif ---------- */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Modal Dipinjamkan
            </p>
            <p className="mt-1 text-xl font-black tracking-tight text-slate-900">
              {fmtRp(rk?.pencairan ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {rk?.pinjaman_baru ?? 0} pinjaman baru · {rk?.nasabah_baru ?? 0} nasabah baru
            </p>
          </div>

          <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Tagihan Jatuh Tempo
            </p>
            <p className="mt-1 text-xl font-black tracking-tight text-slate-900">
              {fmtRp(rk?.jatuh_tempo ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {periode?.hari_berjalan ?? 0} dari {periode?.jumlah_hari ?? 0} hari berjalan
            </p>
          </div>

          <div className="print-block rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Terkumpul Bersih
            </p>
            <p className="mt-1 text-xl font-black tracking-tight text-emerald-700">
              {fmtRp(rk?.terkumpul_bersih ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-emerald-600">
              dari {rk?.nasabah_aktif ?? 0} nasabah aktif bayar
              {(rk?.koreksi ?? 0) > 0 && ` · koreksi ${fmtRp(rk?.koreksi ?? 0)}`}
            </p>
          </div>

          <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Laba Bunga
            </p>
            <p className="mt-1 text-xl font-black tracking-tight text-indigo-600">
              {fmtRp(rk?.laba_bunga ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">flat 20% per periode</p>
          </div>
        </div>

        {/* ---------- 2. Kolektibilitas + arus kas + donat status ---------- */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-slate-700">Kolektibilitas Periode Ini</h2>
              <span className="text-2xl font-black tracking-tight text-slate-900">
                {kolektibilitas}%
              </span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(kolektibilitas, 100)}%`,
                  background:
                    kolektibilitas >= 80 ? '#16a34a' : kolektibilitas >= 50 ? '#f59e0b' : '#dc2626',
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {fmtRp(rk?.terkumpul_bersih ?? 0)} terkumpul dari {fmtRp(rk?.jatuh_tempo ?? 0)} jatuh
              tempo
              {(rk?.koreksi ?? 0) > 0 && ` (setelah koreksi ${fmtRp(rk?.koreksi ?? 0)})`}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Kas Masuk
                </p>
                <p className="text-sm font-bold text-emerald-600">{fmtRp(kasMasuk)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Kas Keluar
                </p>
                <p className="text-sm font-bold text-red-600">{fmtRp(kasKeluar)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Kas Bersih
                </p>
                <p
                  className={`text-sm font-bold ${kasMasuk - kasKeluar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {fmtRp(kasMasuk - kasKeluar)}
                </p>
              </div>
            </div>
          </div>

          <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-slate-700">Status Keandalan</h2>
            {statusData.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400">Belum ada data</p>
            ) : (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={38}
                        outerRadius={62}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {statusData.map((s) => (
                          <Cell key={s.kode} fill={STATUS_WARNA[s.kode] ?? '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip content={<RpTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {(lap?.status ?? []).map((s) => (
                    <li key={s.kode} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: STATUS_WARNA[s.kode] ?? '#94a3b8' }}
                      />
                      <span className="font-semibold text-slate-700">{s.label}</span>
                      <span className="ml-auto font-bold text-slate-900">{s.jumlah}</span>
                      <span className="w-20 text-right text-[10px] text-slate-400">
                        {fmtRp(s.sisa)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* ---------- 3. Tren 6 bulan ---------- */}
        <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-700">Tren 6 Bulan Terakhir</h2>
          {trenKosong ? (
            <p className="py-8 text-center text-xs text-slate-400">
              Belum ada aktivitas pada 6 bulan terakhir
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trenData} barGap={4}>
                  <XAxis
                    dataKey="nama"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1_000_000 ? `${v / 1_000_000}jt` : v >= 1_000 ? `${v / 1_000}rb` : '0'
                    }
                  />
                  <Tooltip content={<RpTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="Pencairan" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Terkumpul" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Jatuh Tempo" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ---------- 4. Top nasabah + metode bayar + kinerja ---------- */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-sm font-bold text-slate-700">5 Piutang Terbesar</h2>
            {(lap?.top_nasabah ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Belum ada piutang</p>
            ) : (
              <ul className="space-y-2.5">
                {(lap?.top_nasabah ?? []).map((t, i) => (
                  <li key={`${t.nik}-${i}`} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-center text-xs font-black text-slate-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{t.nama}</span>
                        <span className="shrink-0 text-sm font-bold text-slate-900">
                          {fmtRp(t.sisa)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(t.sisa / maksSisa) * 100}%`,
                            background: STATUS_WARNA[t.status] ?? '#94a3b8',
                          }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {t.pinjaman} pinjaman · {t.status}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-slate-700">Metode Pembayaran</h2>
              {(lap?.metode ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Belum ada pembayaran</p>
              ) : (
                <ul className="space-y-2">
                  {(lap?.metode ?? []).map((m) => (
                    <li key={m.metode} className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-700">{m.metode}</span>
                      <span className="text-slate-400">{m.jumlah}x</span>
                      <span className="ml-auto font-bold text-slate-900">{fmtRp(m.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="print-block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-bold text-slate-700">Kinerja Pencatat</h2>
              {(lap?.kinerja ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-400">Belum ada aktivitas</p>
              ) : (
                <ul className="space-y-2">
                  {(lap?.kinerja ?? []).map((k) => (
                    <li key={k.nama} className="flex items-center gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-700">{k.nama}</span>
                      <span className="text-slate-400">{k.transaksi}x</span>
                      <span className="ml-auto font-bold text-slate-900">{fmtRp(k.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ---------- 5. Daftar nunggak (tetap berguna, tapi ringkas) ---------- */}
        {nunggakRows.length > 0 && (
          <div className="print-block rounded-2xl border border-red-200 bg-red-50/50 p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-red-800">
              ⚠️ Perlu Tindakan — {nunggakRows.length} Nasabah Nunggak
            </h2>
            <ul className="space-y-1.5">
              {nunggakRows.map((r) => (
                <li
                  key={r.nasabahId}
                  className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-xs"
                >
                  <span className="font-bold text-slate-800">{r.nama}</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {r.nunggak} cicilan
                  </span>
                  <span className="ml-auto font-bold text-slate-900">{fmtRp(r.sisa)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---------- Footer laporan (khusus tampil saat dicetak) ---------- */}
        <div className="hidden border-t border-slate-200 pt-3 text-[10px] text-slate-400 print:block">
          <p>
            SWFinance — Laporan Bulanan {periode?.nama_bulan} {periode?.tahun}. Angka dihitung
            server-side (RPC laporan_bulanan); terkumpul bersih sudah memperhitungkan koreksi
            pembayaran.
          </p>
        </div>
      </div>
    </div>
  )
}
