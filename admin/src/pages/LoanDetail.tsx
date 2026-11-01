import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  approveLoan,
  fetchInstallments,
  fetchLoan,
  payInstallment,
  rejectLoan,
  subscribeToTables,
} from '../lib/api'
import type { Installment, Loan } from '../lib/api'
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

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')

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
    void load()
    return subscribeToTables(['loans', 'installments'], () => void load())
  }, [load])

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
            <Row label="Tenor" value={`${loan.tenor_months} bulan`} />
            <Row label="Bunga" value={`${loan.interest_rate}% flat / tahun`} />
            <Row label="Cicilan / bulan" value={fmtRp(loan.monthly_payment)} strong />
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
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button
                disabled={busy}
                onClick={() => void act(() => approveLoan(loan.id))}
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
                      onClick={() => void act(() => payInstallment(i.id))}
                      className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                    >
                      Tandai Lunas
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
