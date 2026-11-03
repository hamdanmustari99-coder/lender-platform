import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createWorker } from 'tesseract.js'
import { supabase } from '../lib/supabase'
import {
  compressImage,
  parseMapsLink,
  uploadToR2,
} from '../lib/api'
import { errMsg } from '../lib/format'

const JAMINAN_OPTS = [
  'BPKB Motor',
  'BPKB Mobil',
  'Sertifikat Tanah',
  'Emas',
  'Elektronik',
  'Lainnya',
]

/**
 * v3.2 — Form registrasi LENGKAP oleh owner (tanpa petugas, tanpa verifikasi).
 * a. Foto KTP + OCR auto-isi | b-c. Domisili + kantor | d-e. Shareloc via link
 * f. HP aktif | g. Foto nasabah (Cloudinary) | h. Jaminan dropdown + foto bukti.
 */
export default function NasabahBaru() {
  const nav = useNavigate()
  // --- KTP ---
  const [nama, setNama] = useState('')
  const [nik, setNik] = useState('')
  const [tempatLahir, setTempatLahir] = useState('')
  const [tglLahir, setTglLahir] = useState('')
  const [jk, setJk] = useState('')
  const [ktpFile, setKtpFile] = useState<File | null>(null)
  const [ktpPrev, setKtpPrev] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrInfo, setOcrInfo] = useState('')
  // --- Domisili + kantor ---
  const [domisili, setDomisili] = useState('')
  const [domisiliLink, setDomisiliLink] = useState('')
  const [kantor, setKantor] = useState('')
  const [kantorLink, setKantorLink] = useState('')
  // --- Kontak + foto ---
  const [phone, setPhone] = useState('')
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPrev, setFotoPrev] = useState('')
  // --- Jaminan ---
  const [jaminan, setJaminan] = useState('')
  const [jaminanDetail, setJaminanDetail] = useState('')
  const [buktiFiles, setBuktiFiles] = useState<File[]>([])
  const [buktiPrev, setBuktiPrev] = useState<string[]>([])
  // --- Akun ---
  const [password, setPassword] = useState('Danaku123!')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const domisiliLoc = parseMapsLink(domisiliLink)
  const kantorLoc = parseMapsLink(kantorLink)

  const valid =
    nama.trim().length >= 3 &&
    /^\d{16}$/.test(nik.trim()) &&
    /^(0|62|\+62)8\d{7,11}$/.test(phone.trim()) &&
    domisili.trim().length >= 10 &&
    password.length >= 6

  const pickPreview = (f: File | null, set: (u: string) => void) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => set(String(r.result || ''))
    r.readAsDataURL(f)
  }

  const runOcr = async () => {
    if (!ktpFile) {
      setError('Pilih foto KTP dulu.')
      return
    }
    setOcrBusy(true)
    setOcrInfo('')
    setError(null)
    try {
      const worker = await createWorker('ind')
      const { data } = await worker.recognize(ktpFile)
      await worker.terminate()
      const text = data.text || ''
      let filled = 0
      const mNik = text.replace(/\D/g, '').match(/\d{16}/)
      if (mNik) {
        setNik(mNik[0])
        filled++
      }
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      const iNama = lines.findIndex((l) => /nama/i.test(l))
      if (iNama >= 0 && lines[iNama + 1] && /^[A-Z][A-Z\s'.-]{2,}$/.test(lines[iNama + 1])) {
        const nm = lines[iNama + 1]
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
        setNama(nm)
        filled++
      }
      const mTgl = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
      if (mTgl) {
        const iso = `${mTgl[3]}-${mTgl[2]}-${mTgl[1]}`
        if (!isNaN(Date.parse(iso))) {
          setTglLahir(iso)
          filled++
        }
      }
      setOcrInfo(
        filled > 0 ? `OCR mengisi ${filled} field — periksa & koreksi bila salah.` : 'OCR tidak menemukan data — isi manual ya.',
      )
    } catch (e) {
      setError(`OCR gagal: ${errMsg(e)} Isi manual saja.`)
    } finally {
      setOcrBusy(false)
    }
  }

  const submit = async () => {
    setError(null)
    setDone(null)
    if (!valid) {
      setError('Lengkapi dulu: nama (≥3), NIK 16 digit, HP format 08…, domisili ≥10, password ≥6.')
      return
    }
    setBusy(true)
    try {
      const { data: { session: adminSession } } = await supabase.auth.getSession()
      if (!adminSession) throw new Error('Sesi admin hilang. Login ulang.')

      // Upload foto (opsional, gagal = lanjut tanpa foto)
      let ktpUrl = ''
      let fotoUrl = ''
      const buktiUrls: string[] = []
      try {
        if (ktpFile) {
          const c = await compressImage(ktpFile)
          ktpUrl = (await uploadToR2([c], 'ktp'))[0]?.url ?? ''
        }
        if (fotoFile) {
          const c = await compressImage(fotoFile)
          fotoUrl = (await uploadToR2([c], 'nasabah'))[0]?.url ?? ''
        }
        if (buktiFiles.length > 0) {
          const cs = await Promise.all(buktiFiles.slice(0, 5).map((f) => compressImage(f)))
          const rs = await uploadToR2(cs, 'jaminan')
          for (const r of rs) buktiUrls.push(r.url)
        }
      } catch (e) {
        setError(`Upload foto gagal (lanjut tanpa foto): ${errMsg(e)}`)
      }

      const email = `n${nik.trim()}@danaku.local`
      const { data, error: e1 } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: nama.trim(), phone: phone.trim() } },
      })
      if (e1) throw e1
      const newId = data.user?.id
      if (!newId) throw new Error('Gagal membuat akun.')

      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      })

      const { error: e2 } = await supabase.from('profiles').update({
        full_name: nama.trim(),
        nik: nik.trim(),
        tempat_lahir: tempatLahir.trim(),
        birth_date: tglLahir || null,
        jenis_kelamin: jk,
        address: domisili.trim(),
        phone: phone.trim(),
        current_address: domisili.trim(),
        office_address: kantor.trim(),
        home_lat: domisiliLoc?.lat ?? null,
        home_lng: domisiliLoc?.lng ?? null,
        office_lat: kantorLoc?.lat ?? null,
        office_lng: kantorLoc?.lng ?? null,
        foto_path: fotoUrl,
        kyc_status: 'verified',
      }).eq('id', newId)
      if (e2) throw e2

      // Catat foto KTP (boleh gagal — jangan gagalkan registrasi)
      if (ktpUrl) {
        try {
          await supabase.from('kyc_documents').insert({
            user_id: newId, doc_type: 'ktp', storage_path: ktpUrl,
          })
        } catch { /* abaikan */ }
      }

      const extra = [
        fotoUrl ? '📷 foto nasabah ✅' : '📷 tanpa foto',
        ktpUrl ? '🪪 KTP ✅' : '',
        buktiUrls.length > 0 ? `🛡️ ${buktiUrls.length} foto jaminan ✅` : jaminan ? `🛡️ ${jaminan}` : '',
      ].filter(Boolean).join(' • ')
      setDone(`Nasabah ${nama.trim()} terdaftar! Login: ${email} / ${password} — ${extra}`)
      setNama(''); setNik(''); setTempatLahir(''); setTglLahir(''); setJk('')
      setKtpFile(null); setKtpPrev(''); setDomisili(''); setDomisiliLink('')
      setKantor(''); setKantorLink(''); setPhone(''); setFotoFile(null); setFotoPrev('')
      setJaminan(''); setJaminanDetail(''); setBuktiFiles([]); setBuktiPrev([])
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600'

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/users" className="text-sm text-emerald-600 hover:underline">← Kembali ke daftar users</Link>
      <h1 className="text-2xl font-bold text-slate-800">➕ Daftarkan Nasabah</h1>
      <p className="-mt-2 text-sm text-slate-500">Owner daftarkan langsung. Foto tersimpan di cloud — aman dari HP hilang.</p>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {done && (
        <div className="space-y-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div>{done}</div>
          <button onClick={() => nav('/users')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Lihat di daftar users →</button>
        </div>
      )}

      {/* A. FOTO KTP + OCR */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">a. Foto KTP + ekstrak otomatis</div>
        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setKtpFile(f); pickPreview(f, setKtpPrev) }} className="text-sm" />
        {ktpPrev && <img src={ktpPrev} alt="KTP" className="max-h-48 rounded-lg border" />}
        <button disabled={!ktpFile || ocrBusy} onClick={() => void runOcr()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {ocrBusy ? 'Memindai…' : '🔍 Pindai otomatis dari foto'}
        </button>
        {ocrInfo && <div className="text-xs text-slate-500">{ocrInfo}</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Nama sesuai KTP *</label><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="cth: Siti Aminah" className={inp} /></div>
          <div><label className={lbl}>NIK (16 digit) *</label><input inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/[^0-9]/g, ''))} placeholder="3201010101900005" className={`${inp} font-mono`} /></div>
          <div><label className={lbl}>Tempat lahir</label><input value={tempatLahir} onChange={(e) => setTempatLahir(e.target.value)} placeholder="cth: Bandung" className={inp} /></div>
          <div><label className={lbl}>Tanggal lahir</label><input type="date" value={tglLahir} onChange={(e) => setTglLahir(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jenis kelamin</label>
            <select value={jk} onChange={(e) => setJk(e.target.value)} className={inp}>
              <option value="">— pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
            </select>
          </div>
        </div>
      </div>

      {/* B-C-D-E. DOMISILI + KANTOR + SHARELOC */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">b–e. Domisili, kantor & share location</div>
        <div><label className={lbl}>Alamat tinggal saat ini *</label>
          <textarea rows={2} value={domisili} onChange={(e) => setDomisili(e.target.value)} placeholder="cth: Jl. Mawar No. 12, Cibiru, Bandung" className={inp} /></div>
        <div><label className={lbl}>Link Maps rumah (dari WA nasabah)</label>
          <input value={domisiliLink} onChange={(e) => setDomisiliLink(e.target.value)} placeholder="tempel link Google Maps…" className={`${inp} font-mono text-xs`} />
          {domisiliLoc && <a href={`https://maps.google.com/?q=${domisiliLoc.lat},${domisiliLoc.lng}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📍 {domisiliLoc.lat.toFixed(6)}, {domisiliLoc.lng.toFixed(6)} — buka peta</a>}</div>
        <div><label className={lbl}>Alamat kantor</label>
          <textarea rows={2} value={kantor} onChange={(e) => setKantor(e.target.value)} placeholder="cth: Pasar Cibiru Blok B No. 5" className={inp} /></div>
        <div><label className={lbl}>Link Maps kantor</label>
          <input value={kantorLink} onChange={(e) => setKantorLink(e.target.value)} placeholder="tempel link Google Maps…" className={`${inp} font-mono text-xs`} />
          {kantorLoc && <a href={`https://maps.google.com/?q=${kantorLoc.lat},${kantorLoc.lng}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📍 {kantorLoc.lat.toFixed(6)}, {kantorLoc.lng.toFixed(6)} — buka peta</a>}</div>
      </div>

      {/* F-G. KONTAK + FOTO */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">f–g. Kontak & foto nasabah</div>
        <div><label className={lbl}>No. HP aktif (format 08…) *</label>
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.trim())} placeholder="cth: 081234567890" className={inp} /></div>
        <div><label className={lbl}>Foto nasabah</label>
          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFotoFile(f); pickPreview(f, setFotoPrev) }} className="text-sm" />
          {fotoPrev && <img src={fotoPrev} alt="Nasabah" className="mt-2 max-h-48 rounded-lg border" />}</div>
      </div>

      {/* H. JAMINAN */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">h. Jaminan + bukti foto</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Jenis jaminan</label>
            <select value={jaminan} onChange={(e) => setJaminan(e.target.value)} className={inp}>
              <option value="">— pilih —</option>
              {JAMINAN_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select></div>
          <div><label className={lbl}>Detail {jaminan === 'Lainnya' ? '(isi sendiri) *' : '(opsional)'}</label>
            <input value={jaminanDetail} onChange={(e) => setJaminanDetail(e.target.value)} placeholder="cth: Beat 2021 D 1234 AB" className={inp} /></div>
        </div>
        <div><label className={lbl}>Foto bukti (bisa banyak, max 5)</label>
          <input type="file" accept="image/*" multiple onChange={(e) => {
            const fs = [...(e.target.files ?? [])].slice(0, 5); setBuktiFiles(fs)
            setBuktiPrev([]); fs.forEach((f) => { const r = new FileReader(); r.onload = () => setBuktiPrev((p) => [...p, String(r.result || '')]); r.readAsDataURL(f) })
          }} className="text-sm" />
          {buktiPrev.length > 0 && <div className="mt-2 grid grid-cols-3 gap-2">{buktiPrev.map((u, i) => <img key={i} src={u} alt={`bukti ${i}`} className="h-24 rounded-lg border object-cover" />)}</div>}</div>
      </div>

      {/* AKUN */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">Akun login</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Email otomatis</label>
            <input readOnly value={nik ? `n${nik.trim()}@danaku.local` : '— isi NIK dulu —'} className={`${inp} bg-slate-50 font-mono text-xs`} /></div>
          <div><label className={lbl}>Password awal *</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inp} font-mono`} /></div>
        </div>
        <button disabled={busy || !valid} onClick={() => void submit()} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Mendaftarkan…' : 'Daftarkan Nasabah'}
        </button>
      </div>
    </div>
  )
}
