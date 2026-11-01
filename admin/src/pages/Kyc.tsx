import { useCallback, useEffect, useState } from 'react'
import { kycDocSignedUrl, setKycStatus, fetchPendingKyc, subscribeToTables } from '../lib/api'
import type { PendingKycProfile } from '../lib/api'
import { fmtDate, KYC_STATUS_CLASS, KYC_STATUS_LABEL, errMsg } from '../lib/format'

export default function Kyc() {
  const [items, setItems] = useState<PendingKycProfile[]>([])
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await fetchPendingKyc()
      setItems(list)
      setError(null)
      // generate signed URL untuk semua dokumen
      const next: Record<string, string> = {}
      for (const p of list) {
        for (const d of p.kyc_documents ?? []) {
          try {
            next[d.storage_path] = await kycDocSignedUrl(d.storage_path)
          } catch {
            /* biarkan dokumen tanpa URL */
          }
        }
      }
      setSigned(next)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeToTables(['profiles', 'kyc_documents', 'emergency_contacts'], () => void load())
  }, [load])

  const act = async (userId: string, status: 'verified' | 'rejected') => {
    setActionErr(null)
    setBusyId(userId)
    try {
      await setKycStatus(userId, status)
      await load()
    } catch (e) {
      setActionErr(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Memuat data…</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Verifikasi KYC</h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {actionErr && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Gagal: {actionErr}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          🎉 Tidak ada KYC yang menunggu verifikasi
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((p) => (
            <div key={p.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-800">
                    {p.full_name || '(tanpa nama)'}
                  </div>
                  <div className="text-xs text-slate-500">{p.email}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${KYC_STATUS_CLASS[p.kyc_status]}`}>
                  {KYC_STATUS_LABEL[p.kyc_status]}
                </span>
              </div>

              <dl className="mt-3 space-y-1 text-sm">
                <KycRow label="NIK" value={p.nik || '—'} />
                <KycRow
                  label="Tempat/Tgl Lahir"
                  value={`${p.tempat_lahir || '—'}, ${fmtDate(p.birth_date)}`}
                />
                <KycRow
                  label="Jenis Kelamin"
                  value={p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : '—'}
                />
                <KycRow label="Alamat" value={p.address || '—'} />
                <KycRow label="RT/RW" value={p.rt_rw || '—'} />
                <KycRow label="Kel/Desa" value={p.kelurahan || '—'} />
                <KycRow label="Kecamatan" value={p.kecamatan || '—'} />
                <KycRow label="Kota/Kab" value={p.kota || '—'} />
                <KycRow label="Provinsi" value={p.provinsi || '—'} />
                <KycRow label="Agama" value={p.agama || '—'} />
                <KycRow label="Status Kawin" value={p.status_kawin || '—'} />
                <KycRow label="Pekerjaan" value={p.pekerjaan || '—'} />
                <KycRow label="Kewarganegaraan" value={p.kewarganegaraan || '—'} />
                <KycRow label="No. HP Utama" value={p.phone || '—'} />
              </dl>

              {/* Kontak darurat */}
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <div className="mb-2 text-xs font-semibold text-slate-600">
                  📞 Kontak Darurat
                </div>
                {(p.emergency_contacts ?? []).length === 0 && (
                  <div className="text-xs text-slate-400">Belum ada kontak darurat</div>
                )}
                {(p.emergency_contacts ?? [])
                  .slice()
                  .sort((a, b) => a.seq - b.seq)
                  .map((c) => (
                    <div key={c.id} className="flex justify-between text-xs">
                      <span className="text-slate-500">
                        #{c.seq} {c.nama} ({c.hubungan})
                      </span>
                      <span className="font-medium text-slate-800">{c.nomor}</span>
                    </div>
                  ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {(p.kyc_documents ?? []).map((d) => (
                  <a
                    key={d.id}
                    href={signed[d.storage_path] ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                  >
                    {d.doc_type === 'ktp' ? '🪪 Lihat KTP' : '🤳 Lihat Selfie'}
                  </a>
                ))}
                {(p.kyc_documents ?? []).length === 0 && (
                  <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-400">
                    Belum ada dokumen
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                <button
                  disabled={busyId === p.id}
                  onClick={() => void act(p.id, 'verified')}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  ✔ Verifikasi
                </button>
                <button
                  disabled={busyId === p.id}
                  onClick={() => void act(p.id, 'rejected')}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  ✖ Tolak
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KycRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{value}</dd>
    </div>
  )
}
