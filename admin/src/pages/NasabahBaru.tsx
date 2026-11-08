import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { scanKtp, suggestKtpBox } from '../lib/ocr'
import { supabase } from '../lib/supabase'
import { pickPhoto, ensureCameraPermission, isNative } from '../lib/camera'
import KtpCropDialog from '../components/KtpCropDialog'
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
  const ktpInputRef = useRef<HTMLInputElement>(null)
  const ktpGalleryRef = useRef<HTMLInputElement>(null)
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
  const fotoGalleryRef = useRef<HTMLInputElement>(null)
  // Dialog crop KTP: sumber gambar + hasil crop menunggu konfirmasi.
  const [cropSrc, setCropSrc] = useState('')
  // Saran kotak crop dari deteksi kartu (relatif 0..1), dihitung saat foto
  // dipilih. Kalau kartu terdeteksi, kotak default langsung mendarat di kartu.
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // Apakah crop terakhir berasal dari kotak hasil deteksi kartu (bukan center).
  const [cropDetected, setCropDetected] = useState(false)
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

  // Ambil foto KTP dari kamera device (native) atau input file capture (web)
  const goKtpCamera = async () => {
    try {
      if (isNative) {
        const ok = await ensureCameraPermission()
        if (!ok) {
          setError('Izin kamera ditolak — aktifkan di Pengaturan HP, atau pilih dari galeri.')
          return
        }
        const f = await pickPhoto('camera')
        if (f) {
          // Kamera juga lewat dialog crop: hasil jepretan sering memuat latar.
          openCrop(f)
        }
      } else {
        ktpInputRef.current?.click()
      }
    } catch (e) {
      setError(errMsg(e))
    }
  }

  // Pilih foto KTP dari galeri.
  // Di native SENGAJA memakai input file (TYPE_PICK / GET_CONTENT) dan bukan
  // Camera.getPhoto({source:'photos'}). Plugin terbukti tidak membuka galeri di
  // HP operator sehingga tombolnya "tidak bisa diklik". Input file adalah jalur
  // yang paling andal di WebView (Android membuka photo picker resmi), dan
  // sekaligus menyatukan perilaku web/native.
  const goKtpGallery = () => {
    setError(null)
    ktpGalleryRef.current?.click()
  }

  // Setelah gambar dipilih, tampilkan dialog crop supaya OCR hanya membaca area
  // kartu. Operator bisa menggeser/mengubah kotak, atau langsung memakai default.
  // Default kotak = hasil deteksi kartu (lihat suggestKtpBox), dihitung paralel.
  const openCrop = (f: File | null) => {
    if (!f) return
    setCropBox(null)
    const r = new FileReader()
    r.onload = () => setCropSrc(String(r.result || ''))
    r.readAsDataURL(f)
    createImageBitmap(f)
      .then((bm) =>
        suggestKtpBox(bm).then((b) => {
          bm.close?.()
          if (b) setCropBox(b)
        }),
      )
      .catch(() => {
        /* preview tetap muncul, kotak jatuh ke center */
      })
  }

  const applyCrop = (blob: Blob) => {
    const f = new File([blob], 'ktp-crop.jpg', { type: 'image/jpeg' })
    setKtpFile(f)
    pickPreview(f, setKtpPrev)
    setCropDetected(Boolean(cropBox))
    setCropSrc('')
    setError(null)
  }

  const runOcr = async () => {
    if (!ktpFile) {
      setError('Pilih foto KTP dulu.')
      return
    }
    setOcrBusy(true)
    setOcrInfo('')
    setOcrDebug('')
    setError(null)
    try {
      // Pipeline ada di lib/ocr.ts: deteksi kartu via blueness -> crop ->
      // PaddleOCR (PP-OCRv6) satu pass. Model mendeteksi baris dulu lalu
      // mengenali per baris, jadi NIK dibaca utuh — bukan ditebak per digit.
      // preCropped diisi hasil deteksi dialog: kalau kartu terdeteksi, kotak
      // crop sudah pas, jadi deteksi internal dilewati; kalau tidak, deteksi
      // internal dipakai sebagai jaring pengaman.
      const { text, nik: nikFound, cardDetected } = await scanKtp(ktpFile, (p) => {
        setOcrInfo(`${p.label}${p.value < 1 ? ` ${Math.round(p.value * 100)}%` : ''}`)
      }, { preCropped: cropDetected })
      let filled = 0
      if (nikFound) {
        setNik(nikFound)
        filled++
      }
      // ---- Helper: ambil nilai SETELAH label, berhenti di label berikutnya ----
      // Masalah nyata: regex greedy `nama\s*:?\s*(...)` ikut menelan label di
      // baris berikutnya karena \s mencocokkan newline -> "Siti AminahTempat".
      // Solusi: baca nilai hanya dalam SATU baris, lalu bersihkan token sampah.
      //
      // OCR sering salah baca LABEL-nya sendiri, bukan nilainya:
      //   "Kecamatan" -> "Otamalan"/"amalan"/"Recamatan"
      //   "Kel/Desa"  -> "Kelbesa"/"KelDasa"
      //   "Pekerjaan" -> "Kerajaan"/"kerjaan"
      // Jadi pencocokan label dibuat toleran (potongan kata kunci), dan nilai
      // diambil dari sisa baris yang sama.
      const LABEL_ALIAS: [RegExp, string][] = [
        [/\b(?:k[ce]c?[ae]m[ae]t[ae]n|kccamatan|otamalan|amalan|recamatan)\b/i, 'kec'],
        // "Kel/Desa" sering terbaca "Ke/Desa", "Kelbesa", "Keldasa", atau "Kelurahan".
        [/\b(?:k[ce]l?\s*\/?\s*desa|kelurahan|kelbesa|keldasa|kel\s*desa|ke\s*\/?\s*desa)\b/i, 'kel'],
        [/\b(?:pekerjaan|kerajaan|kerjaan|pekerjaan)\b/i, 'kerja'],
        [/\b(?:agama)\b/i, 'agama'],
        [/\b(?:status\s*perkawinan|perkawinan)\b/i, 'kawin'],
        [/\b(?:kewarga\w*|kewargaregaraan)\b/i, 'kwn'],
        [/\b(?:alamat)\b/i, 'alamat'],
        [/\b(?:rt\s*\/?\s*rw|rtrw)\b/i, 'rtrw'],
      ]

      /**
       * Bersihkan nilai dari sampah OCR.
       * Kolom kanan KTP sudah dipotong sebelum OCR, tapi sisa noise tetap ada:
       *   "Hamdan Mustari Kn Ek Fo"  -> "Hamdan Mustari"
       *   "SETIAMEKAR- eee ieee"     -> "SETIAMEKAR"
       * Aturannya: buang token non-alfabet, token 1 huruf, dan kata tanpa
       * vokal (derau khas "Kn", "Bea", "eee") — nama/alamat Indonesia punya vokal.
       *
       * Kasus lapangan yang WAJIB ditangani: label terduplikasi. OCR sering
       * membaca labelnya dua kali dalam satu baris, jadi sisa setelah label
       * pertama masih berisi label lagi:
       *   "Pekerjaan Pekerjaan PELAJAR/MAHASISWA" -> "Pekerjaan PELAJAR/..."
       * Kata label yang muncul di TENGAH nilai selalu sampah — tidak ada
       * pekerjaan/agama bernama "Pekerjaan". Jadi dibuang eksplisit.
       */
      const LABEL_WORDS = /^(?:nama|nik|tempat|lahir|jenis|kelamin|alamat|rt|rw|kel|desa|kelurahan|kecamatan|agama|status|perkawinan|pekerjaan|kewarganegaraan|berlaku|hingga|gol|darah|provinsi|kabupaten|kota)$/i
      const cleanValue = (s: string): string => {
        const VOWEL = /[aeiouAEIOU]/
        return s
          .replace(/[^A-Za-z\s'./-]/g, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 2 && t.length <= 22 && VOWEL.test(t) && !LABEL_WORDS.test(t))
          .join(' ')
          .replace(/\s{2,}/g, ' ')
          .trim()
      }

      /**
       * Snap ke kosakata tertutup KTP.
       * "BELUM KA BEL KAWIN" bukan nilai sah — status perkawinan hanya punya
       * 4 nilai di KTP. Memaksa cocok ke daftar ini membuang fragmen noise
       * ("KA", "BEL") yang lolos filter vokal, tanpa mengarang nilai baru.
       * Dibalik ke bentuk baku supaya konsisten dengan pilihan di form.
       */
      const snap = (s: string, table: [RegExp, string][]): string => {
        const u = s.toUpperCase()
        for (const [re, val] of table) if (re.test(u)) return val
        return s
      }
      const STATUS_KAWIN: [RegExp, string][] = [
        [/BELUM\s*KAWIN|\bBELUM\b/, 'Belum Kawin'],
        [/CERAI\s*HIDUP/, 'Cerai Hidup'],
        [/CERAI\s*MATI|CERAI\s*MAT[Il]/, 'Cerai Mati'],
        [/\bKAWIN\b/, 'Kawin'],
      ]
      const AGAMA: [RegExp, string][] = [
        [/ISLAM/, 'Islam'],
        [/KRISTEN|PROTESTAN/, 'Kristen'],
        [/KATOLIK|KATHOLIK/, 'Katolik'],
        [/HINDU/, 'Hindu'],
        [/BUDHA|BUDDHA/, 'Budha'],
        [/KONGHUCU|KONG\s*HUCU/, 'Konghucu'],
      ]

      /** Ambil nilai setelah label pada baris yang sama (atau baris berikutnya). */
      const valueAfter = (labelRe: RegExp): string => {
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(labelRe)
          if (!m || m.index === undefined) continue
          // teks setelah label; buang pemisah seperti ":", "=", "-"
          const rest = lines[i].slice(m.index + m[0].length).replace(/^[\s:=\-–]+/, '')
          const cleaned = cleanValue(rest)
          if (cleaned.length >= 2) return cleaned
          if (i + 1 < lines.length) {
            const c2 = cleanValue(lines[i + 1])
            if (c2.length >= 2) return c2
          }
        }
        return ''
      }
      // Alias: fungsi lama tetap dipakai untuk alamat & turunannya.
      const oneLineValue = valueAfter

      // ---- Nama ----
      const cleanName = (s: string) => {
        const c = s.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z\s'.-]/g, '').replace(/\s+/g, ' ').trim()
        if (!/^[A-Za-z][A-Za-z\s'.-]{2,}$/.test(c)) return ''
        if (c.split(' ').length > 6) return '' // terlalu panjang = label numpuk
        return c.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase())
      }
      // Label "Nama" sering terbaca salah satu huruf: N->l ("lama"), N->H ("Hama"),
      // atau tergabung dengan noise ("Sama"). Ini penyebab nyata nama tidak terisi
      // di APK walau KTP jelas:  "= lama———___——_ = HAMDAN MUSTAR|"
      // Alias dibuat khusus kata 4 huruf yang mirip, bukan pola longgar, supaya
      // tidak menangkap "Alamat"/"Kecamatan" yang juga mengandung "ama".
      const rawNama = oneLineValue(/\b(?:nama|lama|hama|nnama|nam|ama|naa)\b/i)
      const nm = cleanName(rawNama)
      if (nm) {
        setNama(nm)
        filled++
      }

      // Tempat/tgl lahir: "BEKASI, 21-02-1990" (sebaris atau beda baris)
      const mLahir = text
        .replace(/\n/g, ' ')
        .match(/lahir\s*:?\s*([A-Za-z\s'.-]{2,}?)[,\s]+(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i)
      if (mLahir) {
        const tp = mLahir[1].replace(/^[^A-Za-z]+/, '').replace(/\s+/g, ' ').trim()
        if (tp.length >= 3) {
          setTempatLahir(tp.toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase()))
          filled++
        }
        const iso = `${mLahir[4]}-${mLahir[3].padStart(2, '0')}-${mLahir[2].padStart(2, '0')}`
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
      // Alamat KTP dan turunannya — pakai oneLineValue supaya label di kanan
      // (OCR sering menggabung dua kolom dalam satu baris) tidak ikut tersedot.
      const al = oneLineValue(/\balamat\b/i)
      if (al && !ktpAlamat) {
        setKtpAlamat(al)
        filled++
      }
      // RT/RW: nilai berupa DIGIT sehingga cleanValue (yang membuang non-huruf)
      // tidak bisa dipakai. Ambil langsung \d{1,3}/\d{1,3} dari barisnya.
      const rrM = text.match(/\brt\s*\/?\s*rw\s*:?\s*(\d{1,3})\s*[\/\\]\s*(\d{1,3})\b/i)
      if (rrM) {
        setKtpRtRw(`${rrM[1]}/${rrM[2]}`)
        filled++
      }
      // Kelurahan & Kecamatan: pakai alias toleran karena OCR sering salah
      // membaca labelnya ("Kecamatan" -> "Otamalan", "Kel/Desa" -> "Kelbesa").
      const byLabel = (code: string): string => {
        const alias = LABEL_ALIAS.find(([, c]) => c === code)
        return alias ? valueAfter(alias[0]) : ''
      }
      const kel = byLabel('kel')
      if (kel) {
        setKtpKel(kel)
        filled++
      }
      const kec = byLabel('kec')
      if (kec) {
        setKtpKec(kec)
        filled++
      }
      // v3.3: gol darah, agama, status kawin, pekerjaan, berlaku hingga
      const gd = text.match(/gol\.?\s*darah\s*:?\s*(AB|A|B|O)\b/i)
      if (gd) {
        setGolDarah(gd[1].toUpperCase())
        filled++
      }
      const ag = byLabel('agama')
      if (ag) {
        setAgama(snap(ag, AGAMA))
        filled++
      }
      const sk = byLabel('kawin')
      if (sk) {
        setStatusKawin(snap(sk, STATUS_KAWIN))
        filled++
      }
      const pk = byLabel('kerja')
      if (pk) {
        setPekerjaan(pk)
        filled++
      }
      const kwn = byLabel('kwn')
      if (kwn) {
        setKewarganegaraan(kwn.toUpperCase() === 'WNI' ? 'WNI' : kwn)
        filled++
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
        filled > 0
          ? `OCR mengisi ${filled} field${cardDetected ? '' : ' (kartu tidak terdeteksi — foto ulang lebih dekat)'} — periksa & koreksi bila salah.`
          : 'OCR tidak menemukan data — isi manual ya.',
      )
      if (filled === 0) setOcrDebug(text.slice(0, 500))
      // Diagnostik in-memory (mati saat reload, tidak dikirim ke mana pun):
      // berguna saat klien melaporkan "hasil scan aneh" — buka console dan
      // ketik __swfOcrText untuk melihat teks mentah yang dibaca Tesseract.
      ;(window as unknown as { __swfOcrText?: string }).__swfOcrText = text
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

  const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none'
  const lbl = 'mb-1 block text-xs font-medium text-slate-600'

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/users" className="text-sm text-primary-600 hover:underline">← Kembali ke daftar users</Link>
      <h1 className="text-2xl font-black tracking-tight text-slate-900">➕ Daftarkan Nasabah</h1>
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
        <div className="space-y-2 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800">
          <div>{done}</div>
          <button onClick={() => nav('/users')} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">Lihat di daftar users →</button>
        </div>
      )}

      {/* A. FOTO KTP + OCR */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">a. Foto KTP + ekstrak otomatis</div>

        {/* Dua sumber foto, eksplisit. Input file dipakai dua-duanya (native
            lewat plugin, web lewat picker) — tanpa atribut capture supaya
            tombol galeri benar-benar membuka galeri, bukan kamera. */}
        <input
          ref={ktpGalleryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0] ?? null; openCrop(f); e.target.value = '' }}
        />
        <input
          ref={ktpInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0] ?? null; openCrop(f); e.target.value = '' }}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void goKtpCamera()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            📸 Ambil pakai kamera
          </button>
          <button
            type="button"
            onClick={() => void goKtpGallery()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            🖼️ Pilih dari galeri
          </button>
        </div>

        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-center">
          <div className="text-sm font-medium text-slate-700">
            {ktpFile ? ktpFile.name : 'Belum ada foto KTP terpilih'}
          </div>
          <div className="text-xs text-slate-400">JPG / PNG / WebP, max 8MB</div>
        </div>

        {ktpPrev && <img src={ktpPrev} alt="KTP" className="max-h-48 rounded-lg border" />}
        <button disabled={!ktpFile || ocrBusy} onClick={() => void runOcr()} className="min-h-11 w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 sm:w-auto">
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
          <div><label className={lbl}>NIK (16 digit) *</label><input inputMode="numeric" maxLength={16} value={nik} onChange={(e) => setNik(e.target.value.replace(/[^0-9]/g, ''))} placeholder="3201010101900005" className={`${inp} font-mono`} aria-describedby="nik-hint" />
            {ocrInfo && !nik && <p id="nik-hint" className="mt-1 text-[11px] font-medium text-amber-700">NIK tidak terbaca otomatis — ketik manual dari KTP.</p>}
          </div>
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
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
          {domisiliFinal && <a href={`https://maps.google.com/?q=${domisiliFinal.lat},${domisiliFinal.lng}`} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">📍 {domisiliFinal.lat.toFixed(6)}, {domisiliFinal.lng.toFixed(6)} — buka peta</a>}</div>
        <div><label className={lbl}>Alamat kantor</label>
          <textarea rows={2} value={kantor} onChange={(e) => setKantor(e.target.value)} placeholder="cth: Pasar Cibiru Blok B No. 5" className={inp} /></div>
        <div><label className={lbl}>Link Maps kantor</label>
          <div className="flex gap-2">
            <input value={kantorLink} onChange={(e) => { setKantorLink(e.target.value); setKantorResolved(null) }} placeholder="tempel link Google Maps…" className={`${inp} font-mono text-xs`} />
            <button type="button" disabled={!kantorLink.trim() || resolveBusy === 'kantor'} onClick={() => void resolveLink('kantor')} className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50">
              {resolveBusy === 'kantor' ? '…' : '🎯 Cari'}
            </button>
          </div>
          {kantorFinal && <a href={`https://maps.google.com/?q=${kantorFinal.lat},${kantorFinal.lng}`} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline">📍 {kantorFinal.lat.toFixed(6)}, {kantorFinal.lng.toFixed(6)} — buka peta</a>}</div>
      </div>

      {/* F-G. KONTAK + FOTO */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-slate-700">f–g. Kontak & foto nasabah</div>
        <div><label className={lbl}>No. HP aktif (format 08…) *</label>
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.trim())} placeholder="cth: 081234567890" className={inp} /></div>
        <div><label className={lbl}>Foto nasabah</label>
          {/* Foto nasabah diambil dari GALERI (bukan kamera selfie): operator
              biasanya sudah memfoto nasabah atau memakai foto yang dikirim
              lewat WhatsApp. capture="user" memaksa kamera depan sehingga
              galeri tidak pernah terbuka — itu keluhan operator. */}
          <input ref={fotoGalleryRef} type="file" accept="image/*" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFotoFile(f); pickPreview(f, setFotoPrev); e.target.value = '' }} />
          <button type="button" onClick={() => fotoGalleryRef.current?.click()}
            className="block w-full cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 px-4 py-5 text-center hover:border-primary-500 hover:bg-primary-50">
            <div className="text-2xl">🖼️</div>
            <div className="mt-1 text-sm font-medium text-slate-700">{fotoFile ? fotoFile.name : 'Pilih foto nasabah dari galeri'}</div>
          </button>
          {fotoPrev && <img src={fotoPrev} alt="Nasabah" className="mt-2 max-h-48 rounded-lg border" />}</div>
      </div>

      {/* H. JAMINAN */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 px-4 py-5 text-center hover:border-primary-500 hover:bg-primary-50">
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => {
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
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs text-slate-400">Nasabah tidak mendapat akun login — aplikasi hanya dipakai owner/admin.</p>
        <button disabled={busy || !valid} onClick={() => void submit()} className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {busy ? 'Mendaftarkan…' : 'Daftarkan Nasabah'}
        </button>
        {!valid && (
          <p className="text-xs text-amber-700">
            Belum bisa diklik — kurang: {checks.filter((c) => !c.ok).map((c) => c.msg).join(', ')}.
          </p>
        )}
      </div>

      {/* Dialog crop KTP: tampil setelah foto dipilih, sebelum OCR. */}
      {cropSrc && (
        <KtpCropDialog
          src={cropSrc}
          suggested={cropBox}
          onCancel={() => setCropSrc('')}
          onConfirm={applyCrop}
        />
      )}
    </div>
  )
}
