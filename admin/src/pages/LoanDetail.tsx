import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  approveLoan,
  fetchInstallments,
  fetchLoan,
  fetchLoanDocuments,
  kycDocSignedUrl,
  recordCashPayment,
  rejectLoan,
  subscribeToTables,
} from '../lib/api'
import type { Installment, Loan, LoanDocument } from '../lib/api'
import BorrowerEmergencyContacts from '../components/EmergencyContacts'
import { fmtDate, fmtRp, LOAN_STATUS_CLASS, LOAN_STATUS_LABEL, errMsg } from '../lib/format'

const INST_CLASS: Record<string, string> = {
  unpaid: 'bg-slate-100 text-slate-700',
  paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-100 text-red-700',
}
const INST_LABEL: Record<string, string> = {
  unpaid: 'Belum Bayar',
  paid: 'Lunas',
  overdue: 'Terlambat',
}

const tenorLabel = (loan: Loan): string =>
  loan.frequency === 'weekly' ? `${loan.tenor_months} minggu` : `${loan.tenor_months} bulan`

const freqLabel = (loan: Loan): string =>
  loan.frequency === 'weekly' ? 'Mingguan' : 'Bulanan'

const cicilanLabel = (loan: Loan): string =>
  loan.frequency === 'weekly' ? 'Cicilan / minggu' : 'Cicilan / bulan'

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [finalAmount, setFinalAmount] = useState('')
  const [docs, setDocs] = useState<LoanDocument[]>([])
  const [docUrls, setDocUrls] = useState<Record<string, string>>({})
  // v3.1: catat bayar tunai per cicilan (admin, tanpa petugas)
  const [payTarget, setPayTarget] = useState<Installment | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')

  const doPay = async () => {
    if (!payTarget) return
    const v = Number(payAmount.replace(/[^0-9]/g, ''))
    if (!Number.isFinite(v) || v <= 0) {
      setActionErr('Nominal bayar harus angka lebih dari 0.')
      return
    }
    setActionErr(null)
    setBusy(true)
    try {
      await recordCashPayment(payTarget.id, Math.round(v), payNote.trim())
      setPayTarget(null)
      setPayAmount('')
      setPayNote('')
      await load()
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [l, inst] = await Promise.all([fetchLoan(id), fetchInstallments(id)])
      setLoan(l)
      setInstallments(inst)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [id])

  useEffect(() => {
    setFinalAmount('')
    void load()
    return subscribeToTables(['loans', 'installments'], () => void load())
  }, [load])

  // Prefill nominal final saat loan dimuat / berganti
  useEffect(() => {
    if (loan && finalAmount === '') {
      setFinalAmount(String(loan.requested_amount ?? loan.amount))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id])

  // Dokumen jaminan per pinjaman (thumbnail via signed URL)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!id) return
      try {
        const list = await fetchLoanDocuments(id)
        if (cancelled) return
        setDocs(list)
        const entries = await Promise.all(
          list.map(async (d) => {
            try {
              const url = await kycDocSignedUrl(d.storage_path)
              return [d.id, url] as const
            } catch {
              return [d.id, ''] as const
            }
          }),
        )
        if (!cancelled) setDocUrls(Object.fromEntries(entries.filter(([, u]) => u)))
      } catch {
        if (!cancelled) setDocs([])
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [id])

  const act = async (fn: () => Promise<void>) => {
    setActionErr(null)
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    )
  }
  if (!loan) return <div className="text-sm text-slate-500">Memuat…</div>

  const decidable = loan.status === 'submitted' || loan.status === 'under_review'
  const paidCount = installments.filter((i) => i.status === 'paid').length
  // Ringkasan bayar: total tagihan = pokok + bunga + denda; bayar = sum amount_paid
  const totalTagihan =
    loan.amount +
    Math.round((loan.amount * Number(loan.interest_rate)) / 100) +
    (Number(loan.late_fee ?? 0) || 0)
  const totalBayar = installments.reduce(
    (s, i) => s + (Number(i.amount_paid) || 0),
    0,
  )
  const sisaHutang = Math.max(0, totalTagihan - totalBayar)
  const showUsulan = loan.requested_amount != null && loan.requested_amount !== loan.amount
  const jaminan =
    [loan.collateral_type, loan.collateral_detail].filter(Boolean).join(' — ') || '—'

  return (
    <div className="space-y-4">
      <Link to="/loans" className="text-sm text-emerald-600 hover:underline">
        ← Kembali ke daftar pinjaman
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">
          Pinjaman {fmtRp(loan.amount)}
        </h1>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${LOAN_STATUS_CLASS[loan.status]}`}>
          {LOAN_STATUS_LABEL[loan.status]}
        </span>
      </div>

      {actionErr && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal: {actionErr}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Detail pinjaman */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Detail Pinjaman</div>
          <dl className="space-y-2 text-sm">
            <Row label="Jumlah pokok" value={fmtRp(loan.amount)} />
            {showUsulan && (
              <Row label="Usulan nasabah" value={fmtRp(loan.requested_amount as number)} />
            )}
            <Row label="Jaminan" value={jaminan} />
            <Row label="Frekuensi" value={freqLabel(loan)} />
            <Row label="Tenor" value={tenorLabel(loan)} />
            <Row label="Bunga" value={`${loan.interest_rate}% flat / tahun`} />
            <Row label={cicilanLabel(loan)} value={fmtRp(loan.monthly_payment)} strong />
            <Row label="Total tagihan" value={fmtRp(totalTagihan)} />
            <Row label="Sudah dibayar" value={fmtRp(totalBayar)} />
            <Row label="Sisa hutang" value={fmtRp(sisaHutang)} strong />
            <Row label="Tujuan" value={loan.purpose || '—'} />
            <Row label="Diajukan" value={fmtDate(loan.created_at)} />
            <Row label="Diputuskan" value={fmtDate(loan.decided_at)} />
            {loan.reject_reason && (
              <Row label="Alasan penolakan" value={loan.reject_reason} />
            )}
          </dl>
          {decidable && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div>
                <label
                  htmlFor="final-amount"
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  Nominal final (Rp)
                </label>
                <input
                  id="final-amount"
                  type="number"
                  min={50000}
                  max={20000000}
                  step={50000}
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  placeholder={String(loan.requested_amount ?? loan.amount)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Prefill usulan nasabah; boleh diubah sebelum dicairkan.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const v = Number(finalAmount)
                      if (!Number.isFinite(v) || v < 50000 || v > 20000000) {
                        throw new Error(
                          'Nominal final harus antara Rp50.000–Rp20.000.000',
                        )
                      }
                      await approveLoan(loan.id, Math.round(v))
                    })
                  }
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  ✅ Setujui &amp; Cairkan
                </button>
                <button
                  disabled={busy}
                  onClick={() => setShowReject((v) => !v)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  ✖ Tolak
                </button>
              </div>
            </div>
          )}
          {showReject && decidable && (
            <div className="mt-3 space-y-2">
              <textarea
                placeholder="Alasan penolakan (dikirim sebagai notifikasi ke borrower)…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await rejectLoan(loan.id, reason.trim() || 'Tidak memenuhi kriteria')
                    setShowReject(false)
                    setReason('')
                  })
                }
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                Kirim Penolakan
              </button>
            </div>
          )}
        </div>

        {/* Data borrower */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Data Borrower (KTP)</div>
          <dl className="space-y-2 text-sm">
            <Row label="Nama" value={loan.profiles?.full_name || '(tanpa nama)'} />
            <Row label="NIK" value={loan.profiles?.nik || '—'} />
            <Row
              label="Tempat/Tgl Lahir"
              value={`${loan.profiles?.tempat_lahir || '—'}, ${fmtDate(loan.profiles?.birth_date)}`}
            />
            <Row
              label="Jenis Kelamin"
              value={
                loan.profiles?.jenis_kelamin === 'L'
                  ? 'Laki-laki'
                  : loan.profiles?.jenis_kelamin === 'P'
                    ? 'Perempuan'
                    : '—'
              }
            />
            <Row label="Alamat" value={loan.profiles?.address || '—'} />
            <Row label="RT/RW" value={loan.profiles?.rt_rw || '—'} />
            <Row label="Kel/Desa" value={loan.profiles?.kelurahan || '—'} />
            <Row label="Kecamatan" value={loan.profiles?.kecamatan || '—'} />
            <Row label="Kota/Kab" value={loan.profiles?.kota || '—'} />
            <Row label="Provinsi" value={loan.profiles?.provinsi || '—'} />
            <Row label="Agama" value={loan.profiles?.agama || '—'} />
            <Row label="Status Kawin" value={loan.profiles?.status_kawin || '—'} />
            <Row label="Pekerjaan" value={loan.profiles?.pekerjaan || '—'} />
            <Row label="Kewarganegaraan" value={loan.profiles?.kewarganegaraan || '—'} />
            <Row label="Email" value={loan.profiles?.email || '—'} />
            <Row label="No. HP Utama" value={loan.profiles?.phone || '—'} />
            <Row
              label="Status KYC"
              value={loan.profiles?.kyc_status ?? '—'}
            />
          </dl>
          <BorrowerEmergencyContacts userId={loan.user_id} />
        </div>
      </div>

      {/* Dokumen Jaminan */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Dokumen Jaminan ({docs.length})
        </div>
        {docs.length === 0 ? (
          <div className="text-sm text-slate-400">Belum ada dokumen jaminan.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-3">
                {docUrls[d.id] ? (
                  <img
                    src={docUrls[d.id]}
                    alt={d.doc_type}
                    width={200}
                    className="h-auto w-[200px] rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-[200px] items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">
                    Memuat…
                  </div>
                )}
                <div className="mt-2 text-xs font-medium text-slate-700">{d.doc_type}</div>
                <div className="text-xs text-slate-500">{fmtDate(d.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Jadwal cicilan */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">
            Jadwal Cicilan ({paidCount}/{installments.length} lunas)
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-2">#</th>
              <th className="py-2">Jatuh Tempo</th>
              <th className="py-2">Jumlah</th>
              <th className="py-2">Terkumpul</th>
              <th className="py-2">Status</th>
              <th className="py-2">Dibayar</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {installments.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 text-slate-600">{i.seq}</td>
                <td className="py-2.5 text-slate-700">{fmtDate(i.due_date)}</td>
                <td className="py-2.5 font-medium text-slate-800">{fmtRp(i.amount)}</td>
                <td className="py-2.5 text-slate-600">
                  {fmtRp(Number(i.amount_paid) || 0)}
                  {i.status !== 'paid' && Number(i.amount_paid) > 0 && (
                    <span className="text-xs text-slate-400">
                      {' '}
                      (sisa {fmtRp(i.amount - (Number(i.amount_paid) || 0))})
                    </span>
                  )}
                </td>
                <td className="py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${INST_CLASS[i.status]}`}>
                    {INST_LABEL[i.status] ?? i.status}
                  </span>
                </td>
                <td className="py-2.5 text-xs text-slate-500">{fmtDate(i.paid_at)}</td>
                <td className="py-2.5 text-right">
                  {i.status !== 'paid' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setPayTarget(i)
                        setPayAmount(String(i.amount - (Number(i.amount_paid) || 0)))
                        setPayNote('')
                      }}
                      className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                    >
                      💵 Catat Bayar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {installments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  Jadwal cicilan akan muncul setelah pinjaman disetujui
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal catat bayar tunai (v3.1: admin terima langsung, tanpa petugas) */}
      {payTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPayTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-800">💵 Catat Bayar Tunai</h2>
            <p className="mt-1 text-sm text-slate-600">
              Cicilan #{payTarget.seq} • tagihan {fmtRp(payTarget.amount)} •
              sudah masuk {fmtRp(Number(payTarget.amount_paid) || 0)} • sisa{' '}
              {fmtRp(payTarget.amount - (Number(payTarget.amount_paid) || 0))}
            </p>
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Kelebihan otomatis diteruskan ke cicilan berikutnya. Total melebihi
              sisa hutang akan ditolak.
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Nominal diterima (Rp)
            </label>
            <input
              autoFocus
              inputMode="numeric"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="cth: 120000"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Catatan (opsional)
            </label>
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="cth: bayar di rumah, via transfer"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPayTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                disabled={busy || !payAmount.trim()}
                onClick={() => void doPay()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Menyimpan…' : 'Simpan Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? 'font-bold text-emerald-700' : 'text-right text-slate-800'}>
        {value}
      </dd>
    </div>
  )
}
