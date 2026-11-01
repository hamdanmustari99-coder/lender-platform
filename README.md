# Danaku — Lender Platform

Platform pinjaman (lending) multi-platform: **mobile app borrower (Flutter)** + **admin web monitoring (React+Vite)** + **Supabase** (Postgres + Auth + Storage + Realtime) sebagai backend.

```
lender-platform/
├── mobile/     → Flutter app (borrower): KYC, ajukan pinjaman, cicilan, notifikasi
├── admin/      → React+TS+Vite (admin): dashboard, approval, verifikasi KYC, users
└── supabase/
    └── schema.sql  → skema DB + RLS + RPC (jalankan sekali di SQL Editor)
```

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

## Konfigurasi kredensial

Ambil dari Dashboard → Project Settings → API: `Project URL` & `anon public key`.

**Admin web** — edit `admin/.env`:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...anon-key
```

**Mobile** — build dengan dart-define (atau edit default di `mobile/lib/config.dart`):
```bash
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ...anon-key
```

## Menjalankan

```bash
# Admin web (http://localhost:5173)
cd admin && npm install && npm run dev

# Mobile (emulator / device / -d windows)
cd mobile && flutter pub get && flutter run --dart-define=...
```

## Alur bisnis

```
Borrower: register → isi KYC (NIK+KTP+selfie) → [tunggu verifikasi]
        → ajukan pinjaman (Rp500rb–20jt, tenor 1–12 bln, bunga flat 10%/th)
        → [admin approve] → jadwal cicilan auto-generate
        → bayar cicilan (admin tandai lunas) → loan completed
Admin:   dashboard monitor → verifikasi KYC → approve/reject loan
        → tandai cicilan lunas (notifikasi ke borrower otomatis)
```

## Catatan keamanan (sudah di-implement di schema.sql)

- RLS aktif di semua tabel; borrower cuma lihat data miliknya.
- Tidak ada policy INSERT di `profiles` — profile dibuat trigger, jadi tidak bisa self-insert `role='admin'`.
- Trigger guard: borrower tidak bisa ubah `role`/`kyc_status` sendiri, dan tidak bisa set `interest_rate`/`status`/`monthly_payment` sendiri saat insert loan.
- `approve_loan` / `reject_loan` / `pay_installment` cek `is_admin()` (security definer).
- Bucket KYC private; path di-scopes per-user `{uid}/...`, dibaca via signed URL.
