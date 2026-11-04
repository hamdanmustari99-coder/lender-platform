import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createWorker } from 'tesseract.js'
import { supabase } from '../lib/supabase'
import {
  compressImage,
  parseMapsLink,
  resolveMapsLink,
  serverCreateNasabah,
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
  const [ocrDebug, setOcrDebug] = useState('')
  // --- Domisili + kantor ---
  const [domisili, setDomisili] = useState('')
  // --- Alamat KTP (terpisah dari domisili) ---
  const [ktpAlamat, setKtpAlamat] = useState('')
  const [ktpRtRw, setKtpRtRw] = useState('')
  const [ktpKel, setKtpKel] = useState('')
  const [ktpKec, setKtpKec] = useState('')
  const [domisiliLink, setDomisiliLink] = useState('')
  const [kantor, setKantor] = useState('')
  const [kantorLink, setKantorLink] = useState('')
  // --- Kontak + foto ---
  const [phone, setPhone] = useState('')
  const [golDarah, setGolDarah] = useState('')
  const [agama, setAgama] = useState('')
  const [statusKawin, setStatusKawin] = useState('')
  const [pekerjaan, setPekerjaan] = useState('')
  const [kewarganegaraan, setKewarganegaraan] = useState('WNI')
  const [berlakuHingga, setBerlakuHingga] = useState('')
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [fotoPrev, setFotoPrev] = useState('')
  // --- Jaminan ---
  const [jaminan, setJaminan] = useState('')
  const [jaminanDetail, setJaminanDetail] = useState('')
  const [buktiFiles, setBuktiFiles] = useState<File[]>([])
  const [buktiPrev, setBuktiPrev] = useState<string[]>([])
  // --- Akun (dummy, nasabah tidak login — hanya owner/admin) ---
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dupNik, setDupNik] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const domisiliLoc = parseMapsLink(domisiliLink)
  const kantorLoc = parseMapsLink(kantorLink)
  // Koordinat hasil resolve link pendek (goo.gl) — prioritas di atas parse lokal
  const [domisiliResolved, setDomisiliResolved] = useState<{ lat: number; lng: number } | null>(null)
  const [kantorResolved, setKantorResolved] = useState<{ lat: number; lng: number } | null>(null)
  const [resolveBusy, setResolveBusy] = useState<'rumah' | 'kantor' | null>(null)
  const domisiliFinal = domisiliResolved ?? domisiliLoc
  const kantorFinal = kantorResolved ?? kantorLoc

  const resolveLink = async (which: 'rumah' | 'kantor') => {
    const url = which === 'rumah' ? domisiliLink : kantorLink
    if (!url.trim()) return
    const local = parseMapsLink(url)
    if (local) {
      if (which === 'rumah') setDomisiliResolved(local)
      else setKantorResolved(local)
      return
    }
    setResolveBusy(which)
    try {
      const r = await resolveMapsLink(url)
      if (which === 'rumah') setDomisiliResolved(r)
      else setKantorResolved(r)
    } catch (e) {
      setError(`Link ${which === 'rumah' ? 'rumah' : 'kantor'}: ${e instanceof Error ? e.message : e}`)
    } finally {
      setResolveBusy(null)
    }
  }

  const checks = [
    { ok: nama.trim().length >= 3, msg: 'nama (min 3 huruf)' },
    { ok: /^\d{16}$/.test(nik.trim()), msg: 'NIK 16 digit angka' },
    { ok: /^(0|62|\+62)8\d{7,11}$/.test(phone.replace(/[\s.-]/g, '')), msg: 'HP format 08… (tanpa spasi/titik)' },
    { ok: domisili.trim().length >= 10, msg: 'domisili (min 10 huruf)' },
  ]
  const valid = checks.every((c) => c.ok)

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
      // Preprocessing: grayscale + naikkan kontras biar Tesseract akurat
      const prepped: File = await new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(ktpFile)
        img.onload = () => {
          try {
            const cv = document.createElement('canvas')
            cv.width = img.width
            cv.height = img.height
            const ctx = cv.getContext('2d')!
            ctx.drawImage(img, 0, 0)
            const d = ctx.getImageData(0, 0, cv.width, cv.height)
            for (let i = 0; i < d.data.length; i += 4) {
              const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]
              const v = g > 140 ? 255 : g < 90 ? 0 : Math.round((g - 90) * 5.1)
              d.data[i] = d.data[i + 1] = d.data[i + 2] = v
            }
            ctx.putImageData(d, 0, 0)
            URL.revokeObjectURL(url)
            cv.toBlob(
              (b) => (b ? resolve(new File([b], 'ktp.png', { type: 'image/png' })) : reject(new Error('Preprocessing gagal'))),
              'image/png',
            )
          } catch (e) {
            URL.revokeObjectURL(url)
            reject(e)
          }
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('File bukan gambar valid'))
        }
        img.src = url
      })

      let text = ''
      for (const lang of ['ind', 'eng']) {
        try {
          const worker = await createWorker(lang)
          const { data } = await worker.recognize(prepped)
          await worker.terminate()
          if ((data.text || '').trim().length > text.trim().length) text = data.text || ''
          if (/\d{16}/.test(text.replace(/\D/g, ''))) break
        } catch { /* coba bahasa berikut */ }
      }
      let filled = 0
      const mNik = text.replace(/\D/g, '').match(/\d{16}/)
      if (mNik) {
        setNik(mNik[0])
        filled++
      }
      // Nama: sebaris ("Nama : ANTON …") ATAU baris berikut
      const cleanName = (s: string) => {
        const c = s.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z\s'.-]/g, '').trim()
        if (!/^[A-Za-z][A-Za-z\s'.-]{2,}$/.test(c)) return ''
        return c.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())
      }
      const mNamaInline = text.match(/nama\s*:?\s*([A-Za-z][A-Za-z\s'.-]{2,})/i)
      if (mNamaInline) {
        const nm = cleanName(mNamaInline[1])
        if (nm) {
          setNama(nm)
          filled++
        }
      }
      if (!mNamaInline) {
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
        const iNama = lines.findIndex((l) => /nama/i.test(l))
        if (iNama >= 0 && lines[iNama + 1]) {
          const nm = cleanName(lines[iNama + 1])
          if (nm) {
            setNama(nm)
            filled++
          }
        }
      }
      // Tempat/tgl lahir: "BEKASI, 12-01-1995" (sebaris atau beda baris)
      const mLahir = text.match(/lahir\s*:?\s*([A-Za-z\s'.-]+?)[,\s]+(\d{2})[./-](\d{2})[./-](\d{4})/i)
      if (mLahir) {
        const tp = mLahir[1].replace(/^[^A-Za-z]+/, '').trim()
        if (tp.length >= 3) {
          setTempatLahir(tp.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()))
          filled++
        }
        const iso = `${mLahir[4]}-${mLahir[3]}-${mLahir[2]}`
        if (!isNaN(Date.parse(iso))) {
          setTglLahir(iso)
          filled++
        }
      } else {
        const mTgl = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/)
        if (mTgl) {
          const iso = `${mTgl[3]}-${mTgl[2]}-${mTgl[1]}`
          if (!isNaN(Date.parse(iso))) {
            setTglLahir(iso)
            filled++
          }
        }
      }
      // Alamat KTP: sebaris setelah label
      const grabInline = (re: RegExp) => {
        const m = text.match(re)
        const v = (m?.[1] ?? '').replace(/^[^A-Za-z0-9]+/, '').trim()
        return v.length >= 2 ? v : ''
      }
      const al = grabInline(/alamat\s*:?\s*([^\n]{3,})/i)
      if (al && !ktpAlamat) {
        setKtpAlamat(al)
        filled++
      }
      const rr = grabInline(/rt\s*\/\s*rw\s*:?\s*([0-9]{1,3}\s*\/\s*[0-9]{1,3})/i)
      if (rr) {
        setKtpRtRw(rr.replace(/\s/g, ''))
        filled++
      }
      const kel = grabInline(/(?:kel\/?desa|kelurahan|desa)\s*:?\s*([A-Za-z][^\n]{2,})/i)
      if (kel) {
        setKtpKel(kel)
        filled++
      }
      const kec = grabInline(/kecamatan\s*:?\s*([A-Za-z][^\n]{2,})/i)
      if (kec) {
        setKtpKec(kec)
        filled++
      }
      // v3.3: gol darah, agama, status kawin, pekerjaan, berlaku hingga
      const gd = text.match(/gol\.?\s*darah\s*:?\s*(AB|A|B|O)/i)
      if (gd) {
        setGolDarah(gd[1].toUpperCase())
        filled++
      }
      const ag = grabInline(/agama\s*:?\s*([A-Za-z][^\n]{2,})/i)
      if (ag) {
        const clean = ag.split(/\s{2,}/)[0].trim()
        if (clean) {
          setAgama(clean)
          filled++
        }
      }
      const sk = grabInline(/status\s*perkawinan\s*:?\s*([A-Za-z][^\n]{2,})/i)
      if (sk) {
        const clean = sk.split(/\s{2,}/)[0].trim()
        if (clean) {
          setStatusKawin(clean)
          filled++
        }
      }
      const pk = grabInline(/pekerjaan\s*:?\s*([A-Za-z][^\n]{2,})/i)
      if (pk) {
        const clean = pk.split(/\s{2,}/)[0].trim()
        if (clean) {
          setPekerjaan(clean)
          filled++
        }
      }
      if (/seumur\s*hidup/i.test(text)) {
        setBerlakuHingga('')
        filled++
      } else {
        const mBerlaku = text.match(/berlaku[^\d]*(\d{2})[./-](\d{2})[./-](\d{4})/i)
        if (mBerlaku) {
          const iso = `${mBerlaku[3]}-${mBerlaku[2]}-${mBerlaku[1]}`
          if (!isNaN(Date.parse(iso)) && iso !== tglLahir) {
            setBerlakuHingga(iso)
            filled++
          }
        }
      }
      setOcrInfo(
        filled > 0 ? `OCR mengisi ${filled} field — periksa & koreksi bila salah.` : 'OCR tidak menemukan data — isi manual ya.',
      )
      if (filled === 0) setOcrDebug(text.slice(0, 500))
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
      setError('Lengkapi dulu: nama (≥3), NIK 16 digit, HP format 08…, domisili ≥10.')
      return
    }
    setBusy(true)
    try {
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

      // Buat akun via server (service_role, email dummy bebas, tanpa login ulang).
      // Nasabah TIDAK login — akun hanya wadah data.
      const email = `n${nik.trim()}@danaku.test`
      const rand = new Uint32Array(4)
      crypto.getRandomValues(rand)
      const dummyPassword = [...rand].map((n) => n.toString(36)).join('').slice(0, 16)
      const newId = await serverCreateNasabah({
        email,
        password: dummyPassword,
        fullName: nama.trim(),
        phone: phone.trim(),
        nik: nik.trim(),
      })

      const { error: e2 } = await supabase.from('profiles').update({
        full_name: nama.trim(),
        nik: nik.trim(),
        tempat_lahir: tempatLahir.trim(),
        birth_date: tglLahir || null,
        jenis_kelamin: jk,
        gol_darah: golDarah,
        address: ktpAlamat.trim(),
        rt_rw: ktpRtRw.trim(),
        kelurahan: ktpKel.trim(),
        kecamatan: ktpKec.trim(),
        kota: '',
        provinsi: '',
        agama: agama.trim(),
        status_kawin: statusKawin.trim(),
        pekerjaan: pekerjaan.trim(),
        kewarganegaraan: kewarganegaraan.trim() || 'WNI',
        berlaku_hingga: berlakuHingga || null,
        phone: phone.trim(),
        current_address: domisili.trim(),
        office_address: kantor.trim(),
        home_lat: domisiliFinal?.lat ?? null,
        home_lng: domisiliFinal?.lng ?? null,
        office_lat: kantorFinal?.lat ?? null,
        office_lng: kantorFinal?.lng ?? null,
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
        // Juga catat di nasabah_documents supaya tampil di detail nasabah
        try {
          await supabase.from('nasabah_documents').insert({
            user_id: newId, doc_type: 'ktp', label: 'Foto KTP', url: ktpUrl, note: '',
          })
        } catch { /* abaikan */ }
      }

      // Simpan foto diri nasabah ke nasabah_documents juga (foto_path sudah
      // dipakai di profil, ini cadangan biar konsisten dengan dokumen lain).
      if (fotoUrl) {
        try {
          await supabase.from('nasabah_documents').insert({
            user_id: newId, doc_type: 'selfie', label: 'Foto Nasabah', url: fotoUrl, note: '',
          })
        } catch { /* abaikan */ }
      }

      // Simpan foto jaminan ke nasabah_documents (bukan loan_documents —
      // jaminan didaftarkan sebelum pinjaman ada).
      if (buktiUrls.length > 0 || jaminan) {
        try {
          const rows = buktiUrls.map((u) => ({
            user_id: newId,
            doc_type: 'jaminan',
            label: jaminan.trim(),
            url: u,
            note: jaminanDetail.trim(),
          }))
          if (rows.length === 0) {
            rows.push({
              user_id: newId,
              doc_type: 'jaminan',
              label: jaminan.trim(),
              url: '',
              note: jaminanDetail.trim(),
            })
          }
          await supabase.from('nasabah_documents').insert(rows)
        } catch { /* abaikan */ }
      }

      const extra = [
        fotoUrl ? '📷 foto nasabah ✅' : '📷 tanpa foto',
        ktpUrl ? '🪪 KTP ✅' : '',
        buktiUrls.length > 0 ? `🛡️ ${buktiUrls.length} foto jaminan ✅` : jaminan ? `🛡️ ${jaminan}` : '',
      ].filter(Boolean).join(' • ')
      setDone(`Nasabah ${nama.trim()} terdaftar! ${extra}`)
      setNama(''); setNik(''); setTempatLahir(''); setTglLahir(''); setJk(''); setGolDarah('')
      setAgama(''); setStatusKawin(''); setPekerjaan(''); setKewarganegaraan('WNI'); setBerlakuHingga('')
      setKtpAlamat(''); setKtpRtRw(''); setKtpKel(''); setKtpKec('')
      setKtpFile(null); setKtpPrev(''); setDomisili(''); setDomisiliLink(''); setDomisiliResolved(null)
      setKantor(''); setKantorLink(''); setKantorResolved(null); setPhone(''); setFotoFile(null); setFotoPrev('')
      setJaminan(''); setJaminanDetail(''); setBuktiFiles([]); setBuktiPrev([])
    } catch (e) {
      setError(errMsg(e))
      setDupNik(/sudah terdaftar|sudah dipakai/i.test(errMsg(e)))
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

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <div>{error}</div>
          {dupNik && (
            <Link to="/users" className="mt-1 inline-block font-medium text-red-800 underline">
              → Cari di daftar Users
            </Link>
          )}
        </div>
      )}
      {done && (
        <div className="space-y-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div>{done}</div>
          <button onClick={() => nav('/users')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Lihat di daftar users →</button>
        </div>
      )}

      {/* A. FOTO KTP + OCR */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">a. Foto KTP + ekstrak otomatis</div>
        <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-emerald-500 hover:bg-emerald-50">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setKtpFile(f); pickPreview(f, setKtpPrev); e.target.value = '' }} />
          <div className="text-3xl">📷</div>
          <div className="mt-1 text-sm font-medium text-slate-700">{ktpFile ? ktpFile.name : 'Klik untuk pilih foto KTP'}</div>
          <div className="text-xs text-slate-400">JPG / PNG / WebP, max 8MB</div>
        </label>
        {ktpPrev && <img src={ktpPrev} alt="KTP" className="max-h-48 rounded-lg border" />}
        <button disabled={!ktpFile || ocrBusy} onClick={() => void runOcr()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50">
          {ocrBusy ? 'Memindai…' : '🔍 Pindai otomatis dari foto'}
        </button>
        {ocrInfo && <div className="text-xs text-slate-500">{ocrInfo}</div>}
        {ocrDebug && (
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer hover:text-slate-600">Lihat teks hasil pindaian (debug)</summary>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono">{ocrDebug}</pre>
          </details>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Nama sesuai KTP *</label><input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="cth: Siti Aminah" className={inp} /></div>
          <div><label className={lbl}>NIK (16 digit) *</label><input inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/[^0-9]/g, ''))} placeholder="3201010101900005" className={`${inp} font-mono`} /></div>
          <div><label className={lbl}>Tempat lahir</label><input value={tempatLahir} onChange={(e) => setTempatLahir(e.target.value)} placeholder="cth: Bekasi" className={inp} /></div>
          <div><label className={lbl}>Tanggal lahir (dd-mm-yyyy)</label><input type="date" value={tglLahir} onChange={(e) => setTglLahir(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Jenis kelamin</label>
            <select value={jk} onChange={(e) => setJk(e.target.value)} className={inp}>
              <option value="">— pilih —</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
            </select>
          </div>
          <div><label className={lbl}>Gol. Darah</label>
            <select value={golDarah} onChange={(e) => setGolDarah(e.target.value)} className={inp}>
              <option value="">— pilih —</option><option value="A">A</option><option value="B">B</option><option value="AB">AB</option><option value="O">O</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className={lbl}>Alamat (jalan/no. rumah)</label><input value={ktpAlamat} onChange={(e) => setKtpAlamat(e.target.value)} placeholder="cth: Jl. Anggrek No. 5" className={inp} /></div>
          <div><label className={lbl}>RT/RW</label><input value={ktpRtRw} onChange={(e) => setKtpRtRw(e.target.value)} placeholder="cth: 03/07" className={inp} /></div>
          <div><label className={lbl}>Kel/Desa</label><input value={ktpKel} onChange={(e) => setKtpKel(e.target.value)} placeholder="cth: Cibiru Wetan" className={inp} /></div>
          <div><label className={lbl}>Kecamatan</label><input value={ktpKec} onChange={(e) => setKtpKec(e.target.value)} placeholder="cth: Bekasi Selatan" className={inp} /></div>
          <div><label className={lbl}>Agama</label><input value={agama} onChange={(e) => setAgama(e.target.value)} placeholder="cth: Islam" className={inp} /></div>
          <div><label className={lbl}>Status Perkawinan</label><input value={statusKawin} onChange={(e) => setStatusKawin(e.target.value)} placeholder="cth: Belum Kawin" className={inp} /></div>
          <div><label className={lbl}>Pekerjaan</label><input value={pekerjaan} onChange={(e) => setPekerjaan(e.target.value)} placeholder="cth: Pelajar/Mahasiswa" className={inp} /></div>
          <div><label className={lbl}>Kewarganegaraan</label><input value={kewarganegaraan} onChange={(e) => setKewarganegaraan(e.target.value)} placeholder="WNI" className={inp} /></div>
          <div><label className={lbl}>Berlaku hingga (kosongkan = seumur hidup)</label><input type="date" value={berlakuHingga} onChange={(e) => setBerlakuHingga(e.target.value)} className={inp} /></div>
        </div>
      </div>

      {/* B-C-D-E. DOMISILI + KANTOR + SHARELOC */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">b–e. Domisili, kantor & share location</div>
        <div><label className={lbl}>Alamat tinggal saat ini *</label>
          <textarea rows={2} value={domisili} onChange={(e) => setDomisili(e.target.value)} placeholder="cth: Jl. Mawar No. 12, Cibiru, Bandung" className={inp} /></div>
        <div><label className={lbl}>Link Maps rumah (dari WA nasabah)</label>
          <div className="flex gap-2">
            <input value={domisiliLink} onChange={(e) => { setDomisiliLink(e.target.value); setDomisiliResolved(null) }} placeholder="tempel link Google Maps… (panjang maupun goo.gl)" className={`${inp} font-mono text-xs`} />
            <button type="button" disabled={!domisiliLink.trim() || resolveBusy === 'rumah'} onClick={() => void resolveLink('rumah')} className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {resolveBusy === 'rumah' ? '…' : '🎯 Cari'}
            </button>
          </div>
          {domisiliFinal && <a href={`https://maps.google.com/?q=${domisiliFinal.lat},${domisiliFinal.lng}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📍 {domisiliFinal.lat.toFixed(6)}, {domisiliFinal.lng.toFixed(6)} — buka peta</a>}</div>
        <div><label className={lbl}>Alamat kantor</label>
          <textarea rows={2} value={kantor} onChange={(e) => setKantor(e.target.value)} placeholder="cth: Pasar Cibiru Blok B No. 5" className={inp} /></div>
        <div><label className={lbl}>Link Maps kantor</label>
          <div className="flex gap-2">
            <input value={kantorLink} onChange={(e) => { setKantorLink(e.target.value); setKantorResolved(null) }} placeholder="tempel link Google Maps…" className={`${inp} font-mono text-xs`} />
            <button type="button" disabled={!kantorLink.trim() || resolveBusy === 'kantor'} onClick={() => void resolveLink('kantor')} className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {resolveBusy === 'kantor' ? '…' : '🎯 Cari'}
            </button>
          </div>
          {kantorFinal && <a href={`https://maps.google.com/?q=${kantorFinal.lat},${kantorFinal.lng}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📍 {kantorFinal.lat.toFixed(6)}, {kantorFinal.lng.toFixed(6)} — buka peta</a>}</div>
      </div>

      {/* F-G. KONTAK + FOTO */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">f–g. Kontak & foto nasabah</div>
        <div><label className={lbl}>No. HP aktif (format 08…) *</label>
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.trim())} placeholder="cth: 081234567890" className={inp} /></div>
        <div><label className={lbl}>Foto nasabah</label>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-4 py-5 text-center hover:border-emerald-500 hover:bg-emerald-50">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFotoFile(f); pickPreview(f, setFotoPrev); e.target.value = '' }} />
            <div className="text-2xl">🤳</div>
            <div className="mt-1 text-sm font-medium text-slate-700">{fotoFile ? fotoFile.name : 'Klik untuk pilih foto nasabah'}</div>
          </label>
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
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 px-4 py-5 text-center hover:border-emerald-500 hover:bg-emerald-50">
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
              const fs = [...(e.target.files ?? [])].slice(0, 5); setBuktiFiles(fs)
              setBuktiPrev([]); fs.forEach((f) => { const r = new FileReader(); r.onload = () => setBuktiPrev((p) => [...p, String(r.result || '')]); r.readAsDataURL(f) })
              e.target.value = ''
            }} />
            <div className="text-2xl">🛡️</div>
            <div className="mt-1 text-sm font-medium text-slate-700">{buktiFiles.length > 0 ? `${buktiFiles.length} foto dipilih` : 'Klik untuk pilih foto bukti'}</div>
          </label>
          {buktiPrev.length > 0 && <div className="mt-2 grid grid-cols-3 gap-2">{buktiPrev.map((u, i) => <img key={i} src={u} alt={`bukti ${i}`} className="h-24 rounded-lg border object-cover" />)}</div>}</div>
      </div>

      {/* SUBMIT */}
      <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <p className="text-xs text-slate-400">Nasabah tidak mendapat akun login — aplikasi hanya dipakai owner/admin.</p>
        <button disabled={busy || !valid} onClick={() => void submit()} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? 'Mendaftarkan…' : 'Daftarkan Nasabah'}
        </button>
        {!valid && (
          <p className="text-xs text-amber-700">
            Belum bisa diklik — kurang: {checks.filter((c) => !c.ok).map((c) => c.msg).join(', ')}.
          </p>
        )}
      </div>
    </div>
  )
}
