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
  PORT = '8787',
} = process.env

if (!CLD_CLOUD_NAME || !CLD_API_KEY || !CLD_API_SECRET) {
  console.error('Cloudinary env belum lengkap — isi server/.env dulu.')
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

app.listen(Number(PORT), () =>
  console.log(`Upload proxy (Cloudinary) jalan di http://localhost:${PORT}`),
)
