import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchLoansByUser,
  fetchProfile,
  subscribeToTables,
} from '../lib/api'
import type { Loan, Profile } from '../lib/api'
import BorrowerEmergencyContacts from '../components/EmergencyContacts'
import { fmtDate, fmtRp, KYC_STATUS_CLASS, KYC_STATUS_LABEL, LOAN_STATUS_CLASS, LOAN_STATUS_LABEL, errMsg } from '../lib/format'

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [p, l] = await Promise.all([fetchProfile(id), fetchLoansByUser(id)])
      setProfile(p)
      setLoans(l)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [id])

  useEffect(() => {
    void load()
    return subscribeToTables(['profiles', 'loans'], () => void load())
  }, [load])

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    )
  }
  if (!profile) return <div className="text-sm text-slate-500">Memuat…</div>

  const totalLoan = loans.reduce((s, l) => s + l.amount, 0)

  return (
    <div className="space-y-4">
      <Link to="/users" className="text-sm text-emerald-600 hover:underline">
        ← Kembali ke daftar user
      </Link>

      <h1 className="text-2xl font-bold text-slate-800">
        {profile.full_name || '(tanpa nama)'}
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Profil (KTP)</div>
          <dl className="space-y-2 text-sm">
            <Row label="Email" value={profile.email} />
            <Row label="No. HP Utama" value={profile.phone || '—'} />
            <Row label="NIK" value={profile.nik || '—'} />
            <Row
              label="Tempat/Tgl Lahir"
              value={`${profile.tempat_lahir || '—'}, ${fmtDate(profile.birth_date)}`}
            />
            <Row
              label="Jenis Kelamin"
              value={
                profile.jenis_kelamin === 'L'
                  ? 'Laki-laki'
                  : profile.jenis_kelamin === 'P'
                    ? 'Perempuan'
                    : '—'
              }
            />
            <Row label="Alamat" value={profile.address || '—'} />
            <Row label="RT/RW" value={profile.rt_rw || '—'} />
            <Row label="Kel/Desa" value={profile.kelurahan || '—'} />
            <Row label="Kecamatan" value={profile.kecamatan || '—'} />
            <Row label="Kota/Kab" value={profile.kota || '—'} />
            <Row label="Provinsi" value={profile.provinsi || '—'} />
            <Row label="Agama" value={profile.agama || '—'} />
            <Row label="Status Kawin" value={profile.status_kawin || '—'} />
            <Row label="Pekerjaan" value={profile.pekerjaan || '—'} />
            <Row label="Kewarganegaraan" value={profile.kewarganegaraan || '—'} />
            <Row label="Role" value={profile.role} />
            <Row label="Terdaftar" value={fmtDate(profile.created_at)} />
          </dl>
          {profile.id && <BorrowerEmergencyContacts userId={profile.id} />}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <span className={`rounded-full px-2 py-0.5 text-xs ${KYC_STATUS_CLASS[profile.kyc_status]}`}>
              KYC: {KYC_STATUS_LABEL[profile.kyc_status]}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              Riwayat Pinjaman ({loans.length})
            </div>
            <div className="text-xs text-slate-500">
              Total: <span className="font-semibold text-slate-700">{fmtRp(totalLoan)}</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2">Jumlah</th>
                <th className="py-2">Tenor</th>
                <th className="py-2">Status</th>
                <th className="py-2">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{fmtRp(l.amount)}</td>
                  <td className="py-2.5 text-slate-600">{l.tenor_months} bln</td>
                  <td className="py-2.5">
                    <Link
                      to={`/loans/${l.id}`}
                      className={`rounded-full px-2 py-0.5 text-xs ${LOAN_STATUS_CLASS[l.status]} hover:opacity-80`}
                    >
                      {LOAN_STATUS_LABEL[l.status]}
                    </Link>
                  </td>
                  <td className="py-2.5 text-xs text-slate-500">
                    {fmtDate(l.created_at)}
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Belum ada pinjaman
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  )
}
