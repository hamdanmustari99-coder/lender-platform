import { supabase } from './supabase'

// ---------- Tipe (kontrak: ../supabase/schema.sql) ----------

export type KycStatus = 'pending' | 'verified' | 'rejected'
export type LoanStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'active'
  | 'completed'
export type InstallmentStatus = 'unpaid' | 'paid' | 'overdue'

export interface Profile {
  id: string
  role: 'admin' | 'petugas' | 'nasabah'
  email: string
  full_name: string
  // --- Data KTP (model koperasi) ---
  nik: string | null
  tempat_lahir: string | null
  birth_date: string | null
  jenis_kelamin: 'L' | 'P' | '' | null
  address: string | null
  // --- v3.0: domisili + kantor + shareloc ---
  current_address: string | null
  office_address: string | null
  home_lat: number | null
  home_lng: number | null
  office_lat: number | null
  office_lng: number | null
  rt_rw: string | null
  kelurahan: string | null
  kecamatan: string | null
  kota: string | null
  provinsi: string | null
  agama: string | null
  status_kawin: string | null
  pekerjaan: string | null
  kewarganegaraan: string | null
  phone: string | null
  foto_path: string | null
  kyc_status: KycStatus
  created_at: string
}

export interface EmergencyContact {
  id: string
  user_id: string
  seq: 1 | 2
  nama: string
  hubungan: string
  nomor: string
  created_at: string
}

export interface Loan {
  id: string
  user_id: string
  amount: number
  // v3.0: usulan nasabah (kalau beda dari final) + jaminan
  requested_amount: number | null
  collateral_type: string | null
  collateral_detail: string | null
  tenor_months: number
  frequency: 'weekly' | 'monthly'
  interest_rate: number
  monthly_payment: number
  late_fee: number
  collected_by: string | null
  purpose: string | null
  status: LoanStatus
  reject_reason: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
  profiles?:
    | Pick<
        Profile,
        | 'full_name'
        | 'email'
        | 'kyc_status'
        | 'phone'
        | 'nik'
        | 'address'
        | 'tempat_lahir'
        | 'birth_date'
        | 'jenis_kelamin'
        | 'rt_rw'
        | 'kelurahan'
        | 'kecamatan'
        | 'kota'
        | 'provinsi'
        | 'agama'
        | 'status_kawin'
        | 'pekerjaan'
        | 'kewarganegaraan'
      >
    | null
}

export interface Installment {
  id: string
  loan_id: string
  seq: number
  due_date: string
  amount: number
  amount_paid: number
  paid_by: string | null
  status: InstallmentStatus
  paid_at: string | null
}

export interface KycDoc {
  id: string
  user_id: string
  doc_type: 'ktp' | 'selfie'
  storage_path: string
  created_at: string
}

export interface PendingKycProfile extends Profile {
  kyc_documents: KycDoc[]
  emergency_contacts: EmergencyContact[]
}

// ---------- Query ----------

export async function fetchLoans(): Promise<Loan[]> {
  const { data, error } = await supabase
    .from('loans')
    .select('*, profiles!loans_user_id_fkey(full_name, email, kyc_status, phone)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Loan[]
}

export async function fetchLoansByUser(userId: string): Promise<Loan[]> {
  const { data, error } = await supabase
    .from('loans')
    .select('*, profiles!loans_user_id_fkey(full_name, email, kyc_status, phone)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Loan[]
}

export async function fetchLoan(id: string): Promise<Loan | null> {
  const { data, error } = await supabase
    .from('loans')
    .select(
      '*, profiles!loans_user_id_fkey(full_name, email, kyc_status, phone, nik, address, tempat_lahir, birth_date, jenis_kelamin, rt_rw, kelurahan, kecamatan, kota, provinsi, agama, status_kawin, pekerjaan, kewarganegaraan)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Loan) ?? null
}

export async function fetchInstallments(loanId: string): Promise<Installment[]> {
  const { data, error } = await supabase
    .from('installments')
    .select('*')
    .eq('loan_id', loanId)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []) as Installment[]
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

/** Profile borrower dengan kyc_status=pending beserta dokumen & kontak daruratnya */
export async function fetchPendingKyc(): Promise<PendingKycProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      '*, kyc_documents(id, user_id, doc_type, storage_path, created_at), emergency_contacts(id, user_id, seq, nama, hubungan, nomor, created_at)',
    )
    .eq('kyc_status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PendingKycProfile[]
}

/** Kontak darurat milik seorang borrower */
export async function fetchEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []) as EmergencyContact[]
}

// ==================== M7: Setoran & Laporan (admin v2.0) ====================

export interface Payment {
  id: string
  loan_id: string
  installment_id: string | null
  nasabah_id: string
  petugas_id: string | null
  amount: number
  paid_at: string
  note: string
  created_at: string
  petugas?: Pick<Profile, 'full_name' | 'email'> | null
  nasabah?: Pick<Profile, 'full_name' | 'email'> | null
}

/** Semua payments (admin lihat semua via RLS). Batas 2000 baris terbaru. */
export async function fetchPayments(limit = 2000): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(
      '*, petugas:profiles!payments_petugas_id_fkey(full_name, email), nasabah:profiles!payments_nasabah_id_fkey(full_name, email)',
    )
    .order('paid_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Payment[]
}

export interface SetoranHarian {
  tanggal: string // yyyy-mm-dd
  petugasId: string
  petugasNama: string
  total: number
  count: number
}

/** Agregasi setoran per petugas per hari (client-side, data MVP kecil). */
export function aggregateSetoran(payments: Payment[]): SetoranHarian[] {
  const m = new Map<string, SetoranHarian>()
  for (const p of payments) {
    const tanggal = p.paid_at.slice(0, 10)
    const key = `${tanggal}|${p.petugas_id ?? '-'}`
    const cur = m.get(key) ?? {
      tanggal,
      petugasId: p.petugas_id ?? '-',
      petugasNama: p.petugas?.full_name || p.petugas?.email || '—',
      total: 0,
      count: 0,
    }
    cur.total += p.amount
    cur.count += 1
    m.set(key, cur)
  }
  return [...m.values()].sort((a, b) =>
    a.tanggal === b.tanggal
      ? a.petugasNama.localeCompare(b.petugasNama)
      : b.tanggal.localeCompare(a.tanggal),
  )
}

export interface PiutangNasabah {
  nasabahId: string
  nama: string
  email: string
  totalTagihan: number
  totalBayar: number
  sisa: number
  nunggak: number // jumlah cicilan overdue
}

/** Laporan piutang per nasabah dari loans + installments (client-side). */
export function buildPiutang(
  loans: (Loan & { profiles?: Pick<Profile, 'full_name' | 'email'> | null })[],
  installmentsByLoan: Map<string, Installment[]>,
): PiutangNasabah[] {
  const m = new Map<string, PiutangNasabah>()
  const today = new Date().toISOString().slice(0, 10)
  for (const l of loans) {
    if (l.status === 'rejected') continue
    const tagihan =
      l.amount + Math.round((l.amount * Number(l.interest_rate)) / 100) + (l.late_fee ?? 0)
    const insts = installmentsByLoan.get(l.id) ?? []
    const bayar = insts.reduce((s, i) => s + (i.amount_paid ?? 0), 0)
    const nunggak = insts.filter(
      (i) => i.status !== 'paid' && i.due_date.slice(0, 10) < today,
    ).length
    const cur = m.get(l.user_id) ?? {
      nasabahId: l.user_id,
      nama: l.profiles?.full_name || '(tanpa nama)',
      email: l.profiles?.email || '',
      totalTagihan: 0,
      totalBayar: 0,
      sisa: 0,
      nunggak: 0,
    }
    cur.totalTagihan += tagihan
    cur.totalBayar += bayar
    cur.sisa += Math.max(0, tagihan - bayar)
    cur.nunggak += nunggak
    m.set(l.user_id, cur)
  }
  return [...m.values()].sort((a, b) => b.sisa - a.sisa)
}

/** Koreksi salah input (reversal beraudit, alasan wajib). Admin: apa pun. */
export async function voidPayment(paymentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_payment', {
    p_payment_id: paymentId,
    p_reason: reason,
  })
  if (error) throw error
}

/** Koreksi + langsung catat nominal benar (atomic, 1 transaksi DB). */
export async function voidAndRepay(
  paymentId: string,
  reason: string,
  correctAmount: number,
  correctNote = '',
): Promise<void> {
  const { error } = await supabase.rpc('void_and_repay', {
    p_payment_id: paymentId,
    p_reason: reason,
    p_correct_amount: correctAmount,
    p_correct_note: correctNote,
  })
  if (error) throw error
}

/** Laba kotor = total bunga semua loan non-rejected. */
export function totalLaba(loans: Loan[]): number {
  return loans
    .filter((l) => l.status !== 'rejected')
    .reduce(
      (s, l) => s + Math.round((l.amount * Number(l.interest_rate)) / 100),
      0,
    )
}

// ---------- RPC (security definer, cek is_admin() di server) ----------

export async function approveLoan(loanId: string, finalAmount?: number): Promise<void> {
  const { error } = await supabase.rpc('approve_loan', {
    p_loan_id: loanId,
    ...(finalAmount != null ? { p_amount_override: finalAmount } : {}),
  })
  if (error) throw error
}

/** v3.0: admin buatkan pinjaman langsung (nominal WA = final, langsung cair). */
export async function adminCreateLoan(input: {
  userId: string
  amount: number
  tenor: number
  frequency: 'weekly' | 'monthly'
  purpose?: string
  collateralType?: string
  collateralDetail?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_loan', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_tenor: input.tenor,
    p_frequency: input.frequency,
    p_purpose: input.purpose ?? '',
    p_collateral_type: input.collateralType ?? '',
    p_collateral_detail: input.collateralDetail ?? '',
  })
  if (error) throw error
  return data as string
}

/** v3.0: riwayat telat nasabah (pernah nunggak / bayar lewat due). */
export async function fetchNasabahTelatFlag(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('nasabah_telat_flag', {
    p_user_id: userId,
  })
  if (error) throw error
  return (data as boolean) ?? false
}

export interface LoanDocument {
  id: string
  loan_id: string
  doc_type: string
  storage_path: string
  created_at: string
}

/** v3.0: dokumen per pinjaman (foto jaminan dkk). */
export async function fetchLoanDocuments(loanId: string): Promise<LoanDocument[]> {
  const { data, error } = await supabase
    .from('loan_documents')
    .select('*')
    .eq('loan_id', loanId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as LoanDocument[]
}

export interface NasabahDocument {
  id: string
  user_id: string
  doc_type: 'ktp' | 'selfie' | 'jaminan' | 'lainnya'
  label: string
  url: string
  note: string
  created_at: string
}

/** M14: dokumen milik nasabah (foto KTP, foto diri, foto jaminan). */
export async function fetchNasabahDocuments(userId: string): Promise<NasabahDocument[]> {
  const { data, error } = await supabase
    .from('nasabah_documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as NasabahDocument[]
}

/**
 * Hapus nasabah beserta seluruh datanya (pinjaman lunas, cicilan, dokumen,
 * rute, notifikasi) lewat service_role di server. Ditolak kalau masih ada
 * pinjaman aktif/menunggu, atau kalau admin menghapus akunnya sendiri.
 */
export async function deleteNasabah(userId: string): Promise<void> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: await edgeHeaders(true),
    body: JSON.stringify({ action: 'delete-nasabah', user_id: userId }),
  })
  if (!res.ok) await edgeErr(res)
}

export async function rejectLoan(loanId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reject_loan', {
    p_loan_id: loanId,
    p_reason: reason,
  })
  if (error) throw error
}

export async function payInstallment(installmentId: string): Promise<void> {
  const { error } = await supabase.rpc('pay_installment', {
    p_installment_id: installmentId,
  })
  if (error) throw error
}

/** v3.1: catat bayar tunai (penuh/parsial + auto-apply). Admin & petugas. */
export async function recordCashPayment(
  installmentId: string,
  amount: number,
  note = '',
): Promise<void> {
  const { error } = await supabase.rpc('record_cash_payment', {
    p_installment_id: installmentId,
    p_amount: amount,
    p_note: note,
  })
  if (error) throw error
}

/** Admin verifikasi / tolak KYC (diizinkan RLS utk admin) */
export async function setKycStatus(
  userId: string,
  status: 'verified' | 'rejected',
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ kyc_status: status })
    .eq('id', userId)
  if (error) throw error
}

// ---------- Edge Function (supabase/functions/danaku-api) ----------
// Semua operasi ber-secret (buat akun, upload foto, resolve Maps) lewat sini.
// Token admin dikirim otomatis → function cek role di server.

const FN_URL = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/danaku-api`

async function edgeHeaders(json = false): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const h: HeadersInit = {}
  if (json) h['Content-Type'] = 'application/json'
  if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (anon) h.apikey = anon
  return h
}

async function edgeErr(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new Error(body?.error || `Server error (${res.status})`)
}

/** Buatkan akun nasabah (service_role di server, email dummy bebas). */
export async function serverCreateNasabah(input: {
  email: string
  password: string
  fullName: string
  phone: string
  nik?: string
}): Promise<string> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: await edgeHeaders(true),
    body: JSON.stringify({
      action: 'create-nasabah',
      email: input.email,
      password: input.password,
      full_name: input.fullName,
      phone: input.phone,
      nik: input.nik ?? '',
    }),
  })
  if (!res.ok) await edgeErr(res)
  const body = await res.json()
  if (!body?.id) throw new Error('Gagal membuat akun.')
  return body.id as string
}

/** Selesaikan link Maps pendek (goo.gl) via server → {lat,lng}. */
export async function resolveMapsLink(url: string): Promise<{ lat: number; lng: number }> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: await edgeHeaders(true),
    body: JSON.stringify({ action: 'resolve-maps', url }),
  })
  if (!res.ok) await edgeErr(res)
  const body = await res.json()
  if (body?.lat == null) throw new Error('Koordinat tidak ditemukan.')
  return { lat: Number(body.lat), lng: Number(body.lng) }
}

export interface R2File {
  key: string
  url: string
  size: number
}

/** Upload 1..N gambar via Edge Function (Cloudinary). folder: ktp | nasabah | jaminan */
export async function uploadToR2(files: File[], folder = 'lainnya'): Promise<R2File[]> {
  const fd = new FormData()
  fd.append('folder', folder)
  for (const f of files) fd.append('file', f, f.name)
  const res = await fetch(FN_URL, { method: 'POST', headers: await edgeHeaders(), body: fd })
  if (!res.ok) await edgeErr(res)
  const body = await res.json()
  return (body.files ?? []) as R2File[]
}

/** Kompres gambar di browser sebelum upload (max 1280px, jpeg 0.72). Hemat R2. */
export function compressImage(file: File, maxDim = 1280, quality = 0.72): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const cv = document.createElement('canvas')
        cv.width = w
        cv.height = h
        cv.getContext('2d')!.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        cv.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Kompres gambar gagal.'))
            resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
          },
          'image/jpeg',
          quality,
        )
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('File bukan gambar valid.'))
    }
    img.src = url
  })
}

/** Parse link Google Maps → {lat,lng} atau null. Dukung @lat,lng / ?q= / /maps/search/ */
export function parseMapsLink(text: string): { lat: number; lng: number } | null {
  const t = text.trim()
  let m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) }
  m = t.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) }
  m = t.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
  if (m && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180)
    return { lat: Number(m[1]), lng: Number(m[2]) }
  return null
}

// ---------- Storage (bucket PRIVATE 'kyc-documents') ----------

export async function kycDocSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('kyc-documents')
    .createSignedUrl(storagePath, 600)
  if (error || !data) throw error ?? new Error('Gagal membuat signed URL dokumen')
  return data.signedUrl
}

// ---------- Auth ----------

export async function fetchMyProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw error
  return (data as Profile) ?? null
}

// ---------- Realtime ----------

/** Subscribe perubahan tabel; kembalikan fungsi unsubscribe */
export function subscribeToTables(tables: string[], onChange: () => void): () => void {
  const channel = supabase.channel('admin-watch')
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () =>
      onChange(),
    )
  }
  channel.subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
