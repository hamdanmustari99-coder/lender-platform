import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  adminUpdateNasabah,
  compressImage,
  fetchInstallmentsForLoans,
  fetchLoansByUser,
  fetchNasabahDocuments,
  fetchNasabahTelatFlag,
  fetchProfile,
  resolveMapsLink,
  subscribeToTables,
  uploadToR2,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import type { Installment, Loan, NasabahDocument, NasabahEditData, Profile } from '../lib/api'
import EmergencyContacts from '../components/EmergencyContacts'
import { useToast } from '../components/Toast'
import { fmtDate, fmtRp, KYC_STATUS_CLASS, KYC_STATUS_LABEL, LOAN_STATUS_CLASS, LOAN_STATUS_LABEL, errMsg, telHref } from '../lib/format'

/** Cicilan telat: belum lunas & due_date < hari ini, atau paid_at > due_date. */
function isTelat(inst: Installment): boolean {
  const due = new Date(inst.due_date)
  due.setHours(0, 0, 0, 0)
  if (inst.paid_at) {
    const dueEnd = new Date(due)
    dueEnd.setHours(23, 59, 59, 999)
    return new Date(inst.paid_at) > dueEnd
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return inst.status !== 'paid' && due.getTime() < today.getTime()
}

const FREQ_LABEL: Record<string, string> = { weekly: 'Mingguan', monthly: 'Bulanan' }

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
  const [installments, setInstallments] = useState<Record<string, Installment[]>>({})
  const [telatFlag, setTelatFlag] = useState<boolean | null>(null)
  const [docs, setDocs] = useState<NasabahDocument[]>([])
  const [error, setError] = useState<string | null>(null)
  // Edit data nasabah: modal form
  const [editOpen, setEditOpen] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [form, setForm] = useState<NasabahEditData>({})

  const openEdit = () => {
    if (!profile) return
    setForm({
      full_name: profile.full_name ?? '',
      phone: profile.phone ?? '',
      tempat_lahir: profile.tempat_lahir ?? '',
      birth_date: profile.birth_date ?? '',
      jenis_kelamin: profile.jenis_kelamin ?? '',
      address: profile.address ?? '',
      current_address: profile.current_address ?? '',
      office_address: profile.office_address ?? '',
      rt_rw: profile.rt_rw ?? '',
      kelurahan: profile.kelurahan ?? '',
      kecamatan: profile.kecamatan ?? '',
      kota: profile.kota ?? '',
      provinsi: profile.provinsi ?? '',
      agama: profile.agama ?? '',
      status_kawin: profile.status_kawin ?? '',
      pekerjaan: profile.pekerjaan ?? '',
      kewarganegaraan: profile.kewarganegaraan ?? '',
      home_lat: profile.home_lat,
      home_lng: profile.home_lng,
      office_lat: profile.office_lat,
      office_lng: profile.office_lng,
      })
    setEditErr(null)
    setEditOpen(true)
  }

  // Upload dokumen nasabah yang hilang (data lama): foto diri / KTP / jaminan
  const uploadTargetRef = useRef<'selfie' | 'ktp' | 'jaminan' | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [jaminanLabel, setJaminanLabel] = useState('')
  const [jaminanPromptOpen, setJaminanPromptOpen] = useState(false)
  // Shareloc: input link Maps sementara (tidak dikirim mentah — hanya hasil resolve)
  const [linkInput, setLinkInput] = useState<Record<'home' | 'office', string>>({ home: '', office: '' })
  const [resolveBusy, setResolveBusy] = useState<'home' | 'office' | null>(null)

  const doResolve = async (
    which: 'home' | 'office',
    latKey: 'home_lat' | 'office_lat',
    lngKey: 'home_lng' | 'office_lng',
  ) => {
    const url = (linkInput[which] ?? '').trim()
    if (!url) return
    setResolveBusy(which)
    try {
      const r = await resolveMapsLink(url)
      setForm((f) => ({ ...f, [latKey]: r.lat, [lngKey]: r.lng }))
      setLinkInput((s) => ({ ...s, [which]: '' }))
      showToast('Lokasi berhasil di-resolve.', 'success')
    } catch (e) {
      showToast(`Link ${which === 'home' ? 'rumah' : 'kantor'}: ${errMsg(e)}`, 'error')
    } finally {
      setResolveBusy(null)
    }
  }

  const DOC_LABEL: Record<string, string> = {
    selfie: 'Foto Nasabah',
    ktp: 'Foto KTP',
    jaminan: 'Foto Jaminan',
  }

  const onPickDoc = async (file: File | null) => {
    const t = uploadTargetRef.current
    uploadTargetRef.current = null
    if (!file || !t || !profile) return
    if (t === 'jaminan' && !jaminanLabel.trim()) {
      showToast('Tulis dulu jenis jaminannya (cth: BPKB Motor).', 'error')
      return
    }
    setUploadBusy(true)
    try {
      const c = await compressImage(file)
      const up = await uploadToR2([c], t === 'selfie' ? 'nasabah' : t)
      const url = up[0]?.url ?? ''
      if (!url) throw new Error('Upload gagal — coba lagi.')
      const { error } = await supabase.from('nasabah_documents').insert({
        user_id: profile.id,
        doc_type: t,
        label: t === 'jaminan' ? jaminanLabel.trim() : DOC_LABEL[t],
        url,
        note: '',
      })
      if (error) throw error
      // Foto diri juga ditaruh di profiles.foto_path biar konsisten
      if (t === 'selfie') {
        await supabase.from('profiles').update({ foto_path: url }).eq('id', profile.id)
      }
      setJaminanLabel('')
      await load()
      showToast(`${DOC_LABEL[t]} berhasil ditambahkan.`, 'success')
    } catch (e) {
      showToast(errMsg(e), 'error')
    } finally {
      setUploadBusy(false)
    }
  }

  const doEdit = async () => {
    if (!profile) return
    if (!(form.full_name ?? '').trim()) {
      setEditErr('Nama tidak boleh kosong.')
      return
    }
    setEditErr(null)
    setEditBusy(true)
    try {
      await adminUpdateNasabah(profile.id, form)
      setEditOpen(false)
      await load()
      showToast('Data nasabah berhasil diperbarui.', 'success')
    } catch (e) {
      const message = errMsg(e)
      setEditErr(message)
      showToast(message, 'error')
    } finally {
      setEditBusy(false)
    }
  }

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [p, l, flag] = await Promise.all([
        fetchProfile(id),
        fetchLoansByUser(id),
        fetchNasabahTelatFlag(id).catch(() => null),
      ])
      setProfile(p)
      setLoans(l)
      if (typeof flag === 'boolean') setTelatFlag(flag)
      setError(null)
      // Dokumen nasabah (foto diri, KTP, jaminan) — gagal = tampilkan kosong
      fetchNasabahDocuments(id)
        .then(setDocs)
        .catch(() => setDocs([]))
      if (l.length > 0) {
        const byLoan = await fetchInstallmentsForLoans(l.map((loan) => loan.id))
        const entries = l.map((loan) => [loan.id, byLoan.get(loan.id) ?? []] as const)
        setInstallments(Object.fromEntries(entries))
      } else {
        setInstallments({})
      }
    } catch (e) {
      setError(errMsg(e))
    }
  }, [id])

  useEffect(() => {
    void load()
    return subscribeToTables(['profiles', 'loans', 'installments'], () => void load())
  }, [load])

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
    )
  }
  if (!profile) return <div className="text-sm text-slate-500">Memuat…</div>

  const totalLoan = loans.reduce((s, l) => s + l.amount, 0)
  const homeMaps =
    profile.home_lat != null && profile.home_lng != null
      ? `https://maps.google.com/?q=${profile.home_lat},${profile.home_lng}`
      : null
  const officeMaps =
    profile.office_lat != null && profile.office_lng != null
      ? `https://maps.google.com/?q=${profile.office_lat},${profile.office_lng}`
      : null
  const fotoDocs = docs.filter((d) => d.doc_type === 'selfie' && d.url)
  const ktpDocs = docs.filter((d) => d.doc_type === 'ktp' && d.url)
  const jaminanDocs = docs.filter((d) => d.doc_type === 'jaminan')
  const fotoNasabah = profile.foto_path || fotoDocs[0]?.url || ''

  return (
    <div className="space-y-4">
      <Link to="/users" className="text-sm text-primary-600 hover:underline">
        ← Kembali ke daftar user
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          {profile.full_name || '(tanpa nama)'}
        </h1>
        {telatFlag === true && (
          <span className="rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
            PERNAH TELAT
          </span>
        )}
        {telatFlag === false && (
          <span className="rounded-full bg-primary-600 px-3 py-1 text-sm font-bold text-white">
            LANCAR
          </span>
        )}
        {/* Aksi kontak cepat: telpon & WA langsung dari header */}
        <button
          onClick={openEdit}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-primary-700 active:scale-[0.99]"
        >
          ✏️ Edit Data
        </button>
        {telHref(profile.phone) && (
          <a
            href={telHref(profile.phone)!}
            title={`Telepon ${profile.phone}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700 active:scale-[0.99]"
          >
            📞 Telepon
          </a>
        )}
        {profile.phone && (
          <a
            href={`https://wa.me/${profile.phone.replace(/\D/g, '').replace(/^0/, '62')}`}
            target="_blank"
            rel="noreferrer"
            title="Chat WhatsApp"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-[0.99]"
          >
            💬 WhatsApp
          </a>
        )}
      </div>

      {/* Foto & dokumen nasabah */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          e.target.value = ''
          void onPickDoc(f)
        }}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Foto Nasabah</span>
            <button
              disabled={uploadBusy}
              onClick={() => {
                uploadTargetRef.current = 'selfie'
                fileInputRef.current?.click()
              }}
              className="min-h-9 rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
            >
              {uploadBusy ? '⏳ …' : '＋ Tambah'}
            </button>
          </div>
          {fotoNasabah ? (
            <a href={fotoNasabah} target="_blank" rel="noreferrer">
              <img
                src={fotoNasabah}
                alt={profile.full_name}
                className="h-40 w-full rounded-lg border border-slate-200 object-cover"
              />
            </a>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400">
              Belum ada foto
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Foto KTP</span>
            <button
              disabled={uploadBusy}
              onClick={() => {
                uploadTargetRef.current = 'ktp'
                fileInputRef.current?.click()
              }}
              className="min-h-9 rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
            >
              {uploadBusy ? '⏳ …' : '＋ Tambah'}
            </button>
          </div>
          {ktpDocs.length > 0 ? (
            <a href={ktpDocs[0].url} target="_blank" rel="noreferrer">
              <img
                src={ktpDocs[0].url}
                alt="KTP"
                className="h-40 w-full rounded-lg border border-slate-200 object-cover"
              />
            </a>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400">
              Belum ada foto KTP
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Jaminan</span>
            <button
              disabled={uploadBusy}
              onClick={() => {
                setJaminanLabel('')
                setJaminanPromptOpen(true)
              }}
              className="min-h-9 rounded-lg bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
            >
              {uploadBusy ? '⏳ …' : '＋ Tambah'}
            </button>
          </div>
          {jaminanDocs.filter((d) => d.url).length > 0 ? (
            <a href={jaminanDocs.find((d) => d.url)!.url} target="_blank" rel="noreferrer">
              <img
                src={jaminanDocs.find((d) => d.url)!.url}
                alt="Jaminan"
                className="h-40 w-full rounded-lg border border-slate-200 object-cover"
              />
            </a>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400">
              {jaminanDocs.length > 0 ? jaminanDocs[0].label || 'Ada jaminan (tanpa foto)' : 'Belum ada jaminan'}
            </div>
          )}
        </div>
      </div>

      {/* Detail jaminan (semua foto + keterangan) */}
      {jaminanDocs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">
            Detail Jaminan ({jaminanDocs.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jaminanDocs.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-3">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    <img
                      src={d.url}
                      alt={d.label || 'jaminan'}
                      className="h-28 w-full rounded border border-slate-100 object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-28 items-center justify-center rounded border border-dashed border-slate-200 text-xs text-slate-400">
                    Tanpa foto
                  </div>
                )}
                <div className="mt-2 text-sm font-medium text-slate-800">
                  {d.label || 'Jaminan'}
                </div>
                {d.note && <div className="text-xs text-slate-500">{d.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-700">Profil (KTP)</div>
          <dl className="space-y-2 text-sm">
            <Row label="No. HP Utama" value={profile.phone || '—'} />
            {telHref(profile.phone) && (
              <div className="flex gap-2 pt-1">
                <a
                  href={telHref(profile.phone)!}
                  title={`Telepon ${profile.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-700 active:scale-[0.99]"
                >
                  📞 Telepon
                </a>
                <a
                  href={`https://wa.me/${profile.phone!.replace(/\D/g, '').replace(/^0/, '62')}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Chat WhatsApp"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:scale-[0.99]"
                >
                  💬 WhatsApp
                </a>
              </div>
            )}
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
            <Row label="Terdaftar" value={fmtDate(profile.created_at)} />
          </dl>
          {profile.id && <EmergencyContacts userId={profile.id} />}
          <div className="mt-3 border-t border-slate-100 pt-3">
            <span className={`rounded-full px-2 py-0.5 text-xs ${KYC_STATUS_CLASS[profile.kyc_status]}`}>
              KYC: {KYC_STATUS_LABEL[profile.kyc_status]}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              Riwayat Pinjaman ({loans.length})
            </div>
            <div className="text-xs text-slate-500">
              Total: <span className="font-semibold text-slate-700">{fmtRp(totalLoan)}</span>
            </div>
          </div>
          {/* MOBILE: kartu */}
          <div className="space-y-2.5 lg:hidden">
            {loans.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">Belum ada pinjaman</p>
            )}
            {loans.map((l) => (
              <Link
                key={l.id}
                to={`/loans/${l.id}`}
                className="block rounded-xl border border-slate-200 p-3 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">{fmtRp(l.amount)}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LOAN_STATUS_CLASS[l.status]}`}
                  >
                    {LOAN_STATUS_LABEL[l.status]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {l.tenor_months} bln • {fmtDate(l.created_at)}
                </div>
              </Link>
            ))}
          </div>

          {/* DESKTOP: tabel */}
          <div className="hidden overflow-x-auto lg:block">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">Domisili &amp; Kantor</div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Alamat Domisili</dt>
            <dd className="text-slate-800">{profile.current_address || '—'}</dd>
            {homeMaps && (
              <dd>
                <a
                  href={homeMaps}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  📍 Lihat di Google Maps
                </a>
              </dd>
            )}
            {profile.home_lat != null && profile.home_lng != null && (
              <dd className="text-xs text-slate-400">
                {profile.home_lat.toFixed(6)}, {profile.home_lng.toFixed(6)}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-slate-500">Alamat Kantor</dt>
            <dd className="text-slate-800">{profile.office_address || '—'}</dd>
            {officeMaps && (
              <dd>
                <a
                  href={officeMaps}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary-600 hover:underline"
                >
                  📍 Lihat di Google Maps
                </a>
              </dd>
            )}
            {profile.office_lat != null && profile.office_lng != null && (
              <dd className="text-xs text-slate-400">
                {profile.office_lat.toFixed(6)}, {profile.office_lng.toFixed(6)}
              </dd>
            )}
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-700">Riwayat Pembayaran</div>
        {loans.length === 0 && (
          <div className="py-4 text-center text-sm text-slate-400">Belum ada pinjaman</div>
        )}
        <div className="space-y-4">
          {loans.map((l) => {
            const list = installments[l.id] ?? []
            const telatCount = list.filter(isTelat).length
            return (
              <div key={l.id} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <Link to={`/loans/${l.id}`} className="font-semibold text-primary-700 hover:underline">
                    {fmtRp(l.amount)}
                  </Link>
                  <span className="text-xs text-slate-500">
                    {FREQ_LABEL[l.frequency] ?? l.frequency} · {l.tenor_months} bln
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${LOAN_STATUS_CLASS[l.status]}`}>
                    {LOAN_STATUS_LABEL[l.status]}
                  </span>
                  {list.length > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        telatCount > 0 ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'
                      }`}
                    >
                      {telatCount > 0 ? `${telatCount} cicilan telat` : 'Tidak ada telat'}
                    </span>
                  )}
                </div>
                {list.length === 0 ? (
                  <div className="text-xs text-slate-400">Belum ada cicilan</div>
                ) : (
                  <>
                    {/* MOBILE: baris ringkas */}
                    <div className="space-y-1.5 lg:hidden">
                      {list.map((c) => {
                        const telat = isTelat(c)
                        return (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-slate-500">
                              #{c.seq} · {fmtDate(c.due_date)}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">
                                {fmtRp(c.amount)}
                              </span>
                              {c.paid_at ? (
                                <span className="text-primary-600">
                                  ✓ {fmtRp(c.amount_paid)}
                                </span>
                              ) : telat ? (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                                  Telat
                                </span>
                              ) : (
                                <span className="text-slate-400">{c.status}</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* DESKTOP: tabel */}
                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-slate-500">
                            <th className="py-1 pr-2">#</th>
                            <th className="py-1 pr-2">Jatuh Tempo</th>
                            <th className="py-1 pr-2">Nominal</th>
                            <th className="py-1 pr-2">Dibayar</th>
                            <th className="py-1 pr-2">Status</th>
                            <th className="py-1">Ket.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c) => {
                            const telat = isTelat(c)
                            return (
                              <tr key={c.id} className="border-b border-slate-50 last:border-0">
                                <td className="py-1.5 pr-2 text-slate-600">{c.seq}</td>
                                <td className="py-1.5 pr-2 text-slate-600">
                                  {fmtDate(c.due_date)}
                                </td>
                                <td className="py-1.5 pr-2 text-slate-800">{fmtRp(c.amount)}</td>
                                <td className="py-1.5 pr-2 text-slate-600">
                                  {c.paid_at
                                    ? `${fmtRp(c.amount_paid)} (${fmtDate(c.paid_at)})`
                                    : '—'}
                                </td>
                                <td className="py-1.5 pr-2 text-slate-600">{c.status}</td>
                                <td className="py-1.5">
                                  {telat ? (
                                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                                      Telat
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal isi jenis jaminan sebelum pilih foto */}
      {jaminanPromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setJaminanPromptOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-800">🏷️ Jenis Jaminan</h2>
            <p className="mt-1 text-xs text-slate-500">cth: BPKB Motor, Emas, SHM Rumah</p>
            <input
              autoFocus
              value={jaminanLabel}
              onChange={(e) => setJaminanLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && jaminanLabel.trim()) {
                  setJaminanPromptOpen(false)
                  uploadTargetRef.current = 'jaminan'
                  fileInputRef.current?.click()
                }
              }}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setJaminanPromptOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                disabled={!jaminanLabel.trim()}
                onClick={() => {
                  setJaminanPromptOpen(false)
                  uploadTargetRef.current = 'jaminan'
                  fileInputRef.current?.click()
                }}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                Pilih Foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edit data nasabah */}
      {editOpen && profile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setEditOpen(false)}
        >
          <div
            className="my-8 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-slate-800">✏️ Edit Data Nasabah</h2>
            <p className="mt-1 text-xs text-slate-500">
              NIK tidak bisa diubah (dipakai sebagai identitas & dedupe).
            </p>
            {editErr && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editErr}</div>
            )}
            <div className="mt-4 grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {(
                [
                  ['full_name', 'Nama Lengkap'],
                  ['phone', 'No. HP'],
                  ['tempat_lahir', 'Tempat Lahir'],
                  ['birth_date', 'Tanggal Lahir', 'date'],
                  ['jenis_kelamin', 'Jenis Kelamin (L/P)'],
                  ['address', 'Alamat KTP'],
                  ['rt_rw', 'RT/RW'],
                  ['kelurahan', 'Kel/Desa'],
                  ['kecamatan', 'Kecamatan'],
                  ['kota', 'Kota/Kab'],
                  ['provinsi', 'Provinsi'],
                  ['agama', 'Agama'],
                  ['status_kawin', 'Status Kawin'],
                  ['pekerjaan', 'Pekerjaan'],
                  ['kewarganegaraan', 'Kewarganegaraan'],
                  ['current_address', 'Alamat Domisili'],
                  ['office_address', 'Alamat Kantor'],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key} className="block text-sm">
                  <span className="font-medium text-slate-700">{label}</span>
                  <input
                    type={type ?? 'text'}
                    value={form[key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                  />
                </label>
              ))}
            </div>

            {/* Shareloc: pin lokasi rumah & kantor */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold text-slate-500">
                Pin Lokasi (shareloc) — tempel link Google Maps lalu resolve
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['home', '🏠 Rumah', 'home_lat', 'home_lng'],
                    ['office', '🏢 Kantor', 'office_lat', 'office_lng'],
                  ] as const
                ).map(([which, label, latKey, lngKey]) => {
                  const lat = form[latKey]
                  const lng = form[lngKey]
                  const busy = resolveBusy === which
                  return (
                    <div key={which} className="rounded-lg border border-slate-200 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                        {lat != null && lng != null ? (
                          <span className="font-mono text-[10px] text-emerald-700">
                            ✓ {lat.toFixed(5)}, {lng.toFixed(5)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">belum ada pin</span>
                        )}
                      </div>
                      <input
                        value={linkInput[which] ?? ''}
                        onChange={(e) =>
                          setLinkInput((s) => ({ ...s, [which]: e.target.value }))
                        }
                        placeholder="https://maps.app.goo.gl/…"
                        className="mt-1.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none"
                      />
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !(linkInput[which] ?? '').trim()}
                          onClick={() => void doResolve(which, latKey, lngKey)}
                          className="min-h-8 rounded bg-primary-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          {busy ? 'Mencari…' : 'Resolve Link'}
                        </button>
                        {lat != null && (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({ ...f, [latKey]: null, [lngKey]: null }))
                            }
                            className="min-h-8 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                          >
                            Hapus Pin
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                disabled={editBusy}
                onClick={() => void doEdit()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {editBusy ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
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
