// Supabase Edge Function: danaku-api
// Satu pintu untuk operasi yang butuh service_role — secret tidak pernah ke browser.
//
// POST /functions/v1/danaku-api  { action: "create-nasabah" | "resolve-maps" | "upload-url", ... }
//
// Deploy: supabase functions deploy danaku-api --project-ref <ref>
// Secret: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... CLOUDINARY_* ...

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLD_CLOUD = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? ''
const CLD_KEY = Deno.env.get('CLOUDINARY_API_KEY') ?? ''
const CLD_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Cek pemanggil benar-benar admin (pakai JWT user, bukan service key). */
async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; res: Response }> {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, res: json({ error: 'Tidak ada token.' }, 401) }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return { ok: false, res: json({ error: 'Token tidak valid.' }, 401) }
  const { data: prof } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()
  if (prof?.role !== 'admin') return { ok: false, res: json({ error: 'Hanya admin.' }, 403) }
  return { ok: true }
}

/** Upload buffer ke Cloudinary (unsigned upload pakai signature server-side). */
async function cldUpload(bytes: Uint8Array, mime: string, folder: string) {
  if (!CLD_CLOUD || !CLD_KEY || !CLD_SECRET) throw new Error('Cloudinary secret belum diset.')
  const timestamp = Math.floor(Date.now() / 1000)
  const transformation = 'w_1280,c_limit,q_auto:good'
  // Cloudinary: sign SEMUA param (kecuali api_key/file) urut alfabetis.
  const toSign = `folder=${folder}&timestamp=${timestamp}&transformation=${transformation}${CLD_SECRET}`
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(toSign))
  const signature = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), `f.${ext}`)
  form.append('api_key', CLD_KEY)
  form.append('timestamp', String(timestamp))
  form.append('folder', folder)
  form.append('transformation', transformation)
  form.append('signature', signature)

  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const b = await r.json().catch(() => ({}))
  if (!r.ok || !b.secure_url) throw new Error(b?.error?.message || 'Upload Cloudinary gagal.')
  return { key: b.public_id as string, url: b.secure_url as string, size: Number(b.bytes ?? 0) }
}

/** Ikuti redirect link Maps + ambil koordinat. */
async function resolveMaps(url: string) {
  let u = url.trim()
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  if (!/google|goo\.gl|maps\.app/i.test(u)) throw new Error('Bukan link Google Maps.')
  const r = await fetch(u, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DanakuBot/1.0)' },
  })
  const finalUrl = r.url || u
  let m = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
    finalUrl.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (!m) {
    const html = await r.text().catch(() => '')
    m =
      html.match(/"lat":\s*(-?\d+\.\d+)[^}]{0,120}?"lng":\s*(-?\d+\.\d+)/i) ??
      html.match(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/) ??
      html.match(/center[=:]\s*(-?\d+\.\d+)[,%20]+(-?\d+\.\d+)/i)
  }
  if (!m) throw new Error('Koordinat tidak ditemukan. Minta nasabah Share > Copy link.')
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Koordinat di luar jangkauan.')
  return { lat, lng }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST saja.' }, 405)

  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.res

  try {
    const ct = req.headers.get('content-type') ?? ''

    // --- multipart: upload foto ---
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData()
      const folder = `danaku/${String(fd.get('folder') ?? 'lainnya').replace(/[^a-z0-9_-]/gi, '')}`
      const files = fd.getAll('file').filter((f): f is File => f instanceof File)
      if (files.length === 0) return json({ error: 'Tidak ada file.' }, 400)
      if (files.length > 10) return json({ error: 'Maksimal 10 file.' }, 400)
      const out = []
      for (const f of files) {
        if (f.size > 8 * 1024 * 1024) return json({ error: `${f.name} > 8MB.` }, 400)
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
          return json({ error: `Tipe ${f.type} ditolak.` }, 400)
        }
        const bytes = new Uint8Array(await f.arrayBuffer())
        out.push(await cldUpload(bytes, f.type, folder))
      }
      return json({ files: out })
    }

    // --- JSON actions ---
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '')

    if (action === 'create-nasabah') {
      const { email, password, full_name, phone } = body
      if (!email || !password) return json({ error: 'Email + password wajib.' }, 400)
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? '', phone: phone ?? '' },
      })
      if (error) return json({ error: error.message }, 400)
      return json({ id: data.user?.id })
    }

    if (action === 'resolve-maps') {
      const coords = await resolveMaps(String(body?.url ?? ''))
      return json(coords)
    }

    return json({ error: `Action tidak dikenal: ${action}` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
