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

// GET /resolve-maps?url=... → { lat, lng } | { error }
// Ikuti redirect (goo.gl/maps.app.goo.gl) + parse koordinat dari URL final.
app.get('/resolve-maps', async (req, res) => {
  try {
    let u = String(req.query.url || '').trim()
    if (!u) return res.status(400).json({ error: 'URL kosong.' })
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    if (!/google|goo\.gl|maps\.app/i.test(u)) {
      return res.status(400).json({ error: 'Bukan link Google Maps.' })
    }
    const r = await fetch(u, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } })
    const finalUrl = r.url || u
    let m = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (!m) m = finalUrl.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (!m) {
      const html = await r.text().catch(() => '')
      // cari "lat":x,"lng":y ATAU array [lat,lng] ATAU meta center
      m = html.match(/"[a-z_]*lat[^a-z]*":\s*(-?\d+\.\d+)[^}]{0,80}?"[a-z_]*l(?:ng|on)[^a-z]*":\s*(-?\d+\.\d+)/i)
        || html.match(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/)
        || html.match(/center[=:]\s*(-?\d+\.\d+)[,%20]+(-?\d+\.\d+)/i)
      if (m) {
        const lat = Number(m[1]), lng = Number(m[2])
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return res.json({ lat, lng })
      }
      return res.status(422).json({ error: 'Koordinat tidak ditemukan di link itu. Minta nasabah kirim ulang via Share > Copy link.' })
    }
    const lat = Number(m[1]), lng = Number(m[2])
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(422).json({ error: 'Koordinat di luar jangkauan.' })
    }
    res.json({ lat, lng })
  } catch (e) {
    console.error('resolve-maps gagal:', e?.message || e)
    res.status(500).json({ error: 'Gagal membuka link.' })
  }
})

app.listen(Number(PORT), () =>
  console.log(`Upload proxy (Cloudinary) jalan di http://localhost:${PORT}`),
)
