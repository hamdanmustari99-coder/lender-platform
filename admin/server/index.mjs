// Proxy upload Cloudinary — secret TIDAK PERNAH ke browser.
// Browser → POST /upload (multipart) → server teruskan ke Cloudinary → balas URL.
// Jalan: `npm run r2` (port 8787, nama script dipertahankan). Kredensial di server/.env.
import express from 'express'
import multer from 'multer'
import cors from 'cors'
import dotenv from 'dotenv'
import { v2 as cloudinary } from 'cloudinary'

import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const {
  CLD_CLOUD_NAME,
  CLD_API_KEY,
  CLD_API_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,
  PORT = '8787',
} = process.env

if (!CLD_CLOUD_NAME || !CLD_API_KEY || !CLD_API_SECRET) {
  console.error('Cloudinary env belum lengkap — isi server/.env dulu.')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Supabase service_role belum ada — isi server/.env dulu.')
  process.exit(1)
}

cloudinary.config({
  cloud_name: CLD_CLOUD_NAME,
  api_key: CLD_API_KEY,
  api_secret: CLD_API_SECRET,
})

const app = express()
app.use(cors())
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 }, // 8MB/file, max 10
})

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const safe = (n) => String(n || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)

app.get('/health', (_req, res) =>
  res.json({ ok: true, provider: 'cloudinary', cloud: CLD_CLOUD_NAME }),
)

// POST /upload  form-data: file (1..N), folder (opsional: ktp|nasabah|jaminan)
app.post('/upload', upload.array('file', 10), async (req, res) => {
  try {
    const folder = `danaku/${safe(req.body?.folder || 'lainnya')}`
    const files = req.files || []
    if (files.length === 0) return res.status(400).json({ error: 'Tidak ada file.' })
    const out = []
    for (const f of files) {
      if (!ALLOWED.has(f.mimetype)) {
        return res.status(400).json({ error: `Tipe ${f.mimetype} ditolak (jpg/png/webp saja).` })
      }
      const dataUri = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`
      const r = await cloudinary.uploader.upload(dataUri, {
        folder,
        resource_type: 'image',
        // Hemat kuota: max 1280px + auto quality di CDN
        transformation: [{ width: 1280, crop: 'limit', quality: 'auto:good' }],
      })
      out.push({ key: r.public_id, url: r.secure_url, size: r.bytes })
    }
    res.json({ files: out })
  } catch (e) {
    console.error('Cloudinary upload gagal:', e?.message || e)
    res.status(500).json({ error: 'Upload ke Cloudinary gagal.' })
  }
})

// POST /create-nasabah { email, password, full_name, phone } → { id }
// Pakai service_role (bypass validasi email + tanpa kirim email).
// DIPANGGIL admin web. Secret tidak pernah ke browser.
app.post('/create-nasabah', express.json(), async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Email + password wajib.' })
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || '', phone: phone || '' },
      }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: body?.msg || body?.message || 'Gagal membuat akun.' })
    res.json({ id: body.id })
  } catch (e) {
    console.error('create-nasabah gagal:', e?.message || e)
    res.status(500).json({ error: 'Gagal membuat akun.' })
  }
})

app.listen(Number(PORT), () =>
  console.log(`Upload proxy (Cloudinary) jalan di http://localhost:${PORT}`),
)
