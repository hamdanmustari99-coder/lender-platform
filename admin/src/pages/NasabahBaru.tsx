import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errMsg } from '../lib/format'

/**
 * v3.1 — Admin daftarkan nasabah langsung (tanpa petugas lapangan).
 * Buat akun via signUp (email dari NIK + password awal), sesi admin
 * di-restore otomatis setelahnya, lalu admin lengkapi profil + KYC manual.
 */
export default function NasabahBaru() {
  const nav = useNavigate()
  const [nama, setNama] = useState('')
  const [nik, setNik] = useState('')
  const [phone, setPhone] = useState('')
  const [alamat, setAlamat] = useState('')
  const [password, setPassword] = useState('Danaku123!')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const valid =
    nama.trim().length >= 3 &&
    /^\d{16}$/.test(nik.trim()) &&
    /^(0|62|\+62)8\d{7,11}$/.test(phone.trim()) &&
    alamat.trim().length >= 10 &&
    password.length >= 6

  const submit = async () => {
    setError(null)
    setDone(null)
    if (!valid) {
      setError('Lengkapi dulu: nama (≥3), NIK 16 digit, HP format 08…, alamat ≥10, password ≥6.')
      return
    }
    setBusy(true)
    try {
      // Simpan sesi admin untuk restore
      const {
        data: { session: adminSession },
      } = await supabase.auth.getSession()
      if (!adminSession) throw new Error('Sesi admin hilang. Login ulang.')

      // Email deterministik dari NIK (nasabah ganti nanti kalau mau)
      const email = `n${nik.trim()}@danaku.local`
      const { data, error: e1 } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: nama.trim(), phone: phone.trim() } },
      })
      if (e1) throw e1
      const newId = data.user?.id
      if (!newId) throw new Error('Gagal membuat akun (cek konfirmasi email di Supabase).')

      // signUp otomatis login sebagai user baru → restore sesi admin
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      })

      // Lengkapi profil + verifikasi langsung (admin boleh)
      const { error: e2 } = await supabase
        .from('profiles')
        .update({
          full_name: nama.trim(),
          nik: nik.trim(),
          phone: phone.trim(),
          address: alamat.trim(),
          current_address: alamat.trim(),
          kyc_status: 'verified',
        })
        .eq('id', newId)
      if (e2) throw e2

      setDone(`Nasabah ${nama.trim()} terdaftar! Login: ${email} / ${password}`)
      setNama('')
      setNik('')
      setPhone('')
      setAlamat('')
    } catch (e) {
      setError(errMsg(e))
      // Coba restore sesi admin kalau keputus di tengah
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session) await supabase.auth.signOut()
      } catch {
        /* abaikan */
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <Link to="/users" className="text-sm text-emerald-600 hover:underline">
        ← Kembali ke daftar users
      </Link>
      <h1 className="text-2xl font-bold text-slate-800">➕ Daftarkan Nasabah</h1>
      <p className="-mt-2 text-sm text-slate-500">
        Admin daftarkan langsung (tanpa petugas). Akun langsung aktif + KYC
        terverifikasi — data KTP lengkap bisa dilengkapi di Verifikasi KYC.
      </p>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {done && (
        <div className="space-y-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div>{done}</div>
          <button
            onClick={() => nav('/users')}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Lihat di daftar users →
          </button>
        </div>
      )}

      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Nama lengkap (sesuai KTP) *
          </label>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="cth: Siti Aminah"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            NIK (16 digit) *
          </label>
          <input
            inputMode="numeric"
            maxLength={16}
            value={nik}
            onChange={(e) => setNik(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="cth: 3201010101900005"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            No. HP (format 08…) *
          </label>
          <input
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.trim())}
            placeholder="cth: 081234567890"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Alamat tinggal *
          </label>
          <textarea
            rows={2}
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            placeholder="cth: Jl. Mawar No. 12, Cibiru, Bandung"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Password awal *
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            Email login otomatis: n[NIK]@danaku.local — kasih tahu nasabah +
            suruh ganti password.
          </p>
        </div>
        <button
          disabled={busy || !valid}
          onClick={() => void submit()}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Mendaftarkan…' : 'Daftarkan Nasabah'}
        </button>
      </div>
    </div>
  )
}
