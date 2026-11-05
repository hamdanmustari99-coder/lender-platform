# Danaku — Bank Keliling Platform

Platform pinjaman mikro dengan penagihan door-to-door: **admin web (React+TS+Vite)** + **Supabase** (Postgres + Auth + Storage + Realtime) sebagai backend.

> **Dokumen acuan:** `PRD.md` (root) — v4.0, 5 Nov 2026.

```
lender-platform/
├── admin/      → React+TS+Vite: dashboard, approval, verifikasi KYC, users, setoran, laporan
└── supabase/
    ├── schema.sql                 → skema DB + RLS + RPC (jalankan sekali di SQL Editor)
    ├── migrations/                → migrasi bertahap (M14–M22); jalankan via `supabase db push`
    └── functions/danaku-api/      → Edge Function: buat/hapus akun nasabah (service_role)
```

## Ringkasan produk

**Satu peran pengguna: admin/owner.** Aplikasi hanya dipakai admin/owner dari web — tidak ada mobile app dan tidak ada akun petugas (M21). `role='nasabah'` tetap ada di DB semata sebagai penanda **pemilik data pinjaman**, bukan sebagai pengguna yang login.

Pembayaran = **tunai di lapangan** (tanpa payment gateway — sesuai realita bank keliling), dicatat admin saat kunjungan.

- **Bunga:** flat **20% per periode pinjaman** (mingguan atau bulanan).
- **Plafon:** **Rp50.000 – Rp20.000.000** (revisi M17).
- **Tenor:** 1–52 periode (mingguan) / 1–3 bulan (bulanan).
- **Frekuensi bayar:** mingguan atau bulanan, dipilih saat pengajuan.
- **Denda keterlambatan:** kolom `late_fee` ada, nilai **0** sampai klien menentukan.
- **Nasabah tidak perlu email** — email dummy `n[NIK]@danaku.test` dibuat otomatis dan disembunyikan dari UI.

## Setup Supabase (sekali, ~10 menit)

1. Buat project di [supabase.com/dashboard](https://supabase.com/dashboard) (region Singapore paling dekat).
2. **SQL Editor** → New query → paste seluruh `supabase/schema.sql` → Run.
3. **Storage** → New bucket → name: `kyc-documents`, **Private**.
4. Storage → Policies → pada bucket `kyc-documents`, tambah 2 policy custom (SQL):
   - `INSERT`: `(bucket_id = 'kyc-documents'::text) AND (auth.uid()::text = (storage.foldername(name))[1])`
   - `SELECT`: `(bucket_id = 'kyc-documents'::text) AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())`
5. Daftar dulu 1 akun via app (atau Authentication → Add user), lalu promote jadi admin:
   ```sql
   update public.profiles set role='admin' where email = 'email-anda@domain.com';
   ```

### Migrasi bertahap

Kalau project sudah pernah jalan sebelum M14, jalankan migrasi yang belum masuk:

```bash
supabase db push
```

Kalau migration history remote tidak cocok dengan lokal (pesan error saat push):

```bash
supabase migration repair --status reverted <migration_id>
```

## Konfigurasi kredensial

Ambil dari Dashboard → Project Settings → API: `Project URL` & `anon public key`.

**Admin web** — edit `admin/.env`:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...anon-key
```

**Edge Function** — edit `admin/server/.env` (dipakai `supabase/functions/danaku-api`):
```
SUPABASE_SERVICE_ROLE=sb_secret...service-role-key
```

**Edge Function** — edit `admin/server/.env` (dipakai `supabase/functions/danaku-api`):
```
SUPABASE_SERVICE_ROLE=sb_secret...service-role-key
```

## Menjalankan

```bash
# Admin web (http://localhost:5173)
cd admin && npm install && npm run dev

# Deploy edge function
supabase functions deploy danaku-api --project-ref <project-ref>
```

## Alur bisnis

```
Admin daftar nasabah (KTP + foto + lokasi + kontak darurat)
      → admin verifikasi KYC
      → admin buat pinjaman (plafon, frekuensi, tenor, jaminan)
      → admin approve + tetapkan nominal final → jadwal auto-generate per frekuensi
      → admin catat bayar tunai per kunjungan (parsial/penuh, auto-apply)
      → nunggak? status overdue otomatis tiap 00:00 WIB (pg_cron) + notifikasi
      → semua lunas → completed

Setoran: admin catat tunai → owner rekonsiliasi per hari (agregasi WIB)
Koreksi: salah input → void_payment / void_and_repay (reversal beraudit, alasan wajib)
```

## Skala besar (M20)

Aplikasi sudah disiapkan untuk ribuan nasabah / puluhan ribu cicilan:

- **Paginasi** — daftar nasabah (50/halaman) & setoran; search nama/email/telepon/NIK.
- **Agregasi di Postgres** — RPC `laporan_ringkasan()`, `list_nasabah(...)`, `setoran_harian(...)`. Browser tidak lagi menarik semua baris lalu menghitung sendiri.
- **12 index** untuk pola query sort/filter/join yang dipakai UI.
- **Rincian transaksi on-demand** — halaman Setoran hanya mengambil detail saat baris di-expand.

Zona waktu: semua perhitungan tanggal memakai **`Asia/Jakarta`** (server Supabase berjalan di UTC).

## Catatan keamanan

- RLS aktif di semua tabel; pemilik data cuma lihat data miliknya, semua operasi tulis lewat `is_admin()`.
- Tidak ada policy INSERT di `profiles` — profile dibuat trigger, jadi tidak bisa self-insert `role='admin'`.
- Trigger guard: pemilik data tidak bisa ubah `role`/`kyc_status` sendiri, dan tidak bisa set `interest_rate`/`status`/`monthly_payment` sendiri saat insert loan.
- RPC sensitif (`approve_loan`, `reject_loan`, `record_cash_payment`, `void_payment`, `laporan_ringkasan`, `list_nasabah`, `setoran_harian`) cek `is_admin()` (security definer).
- `service_role` **hanya** di Edge Function, tidak pernah di client.
- Bucket KYC private; path di-scopes per-user `{uid}/...`, dibaca via signed URL.
- Admin web: **nol dialog bawaan browser** (`window.confirm/prompt/alert`) — semua konfirmasi pakai modal React.

## Build

```bash
# Admin web
cd admin && npm run build
```
