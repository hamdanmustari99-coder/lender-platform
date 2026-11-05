# PRD — Danaku Lender Platform

> ⚠️ **DOKUMEN INI DUPLIKAT LAMA (v1.0, 31 Okt 2026) — JANGAN DIPAKAI.**
> Acuan resmi adalah **`PRD.md` di root repo** (v3.1, 5 Nov 2026 — model bank keliling, M0–M20).
> File ini sengaja dibiarkan hanya sebagai arsip sejarah model pinjol v1.0.

| | |
|---|---|
| **Produk** | Danaku — platform pinjaman (lending) mobile-first |
| **Versi dokumen** | v1.0 — 31 Oktober 2026 (ARSIP) |
| **Status** | MVP dalam pengembangan (fase build) |
| **Pemilik** | Operator |
| **Platform** | Mobile app (Flutter, Android + iOS) · Admin web (React + Vite) |
| **Backend** | Supabase (Postgres + Auth + Storage + Realtime) — BaaS, tanpa server infra sendiri |

---

## 1. Latar Belakang & Masalah

Ada permintaan pinjaman konsumtif jangka pendek yang belum terlayani dengan proses cepat dan digital penuh. Danaku mengisi ceruk ini: pengajuan dari HP dalam hitungan menit, verifikasi operator via admin web, dan siklus pinjaman (approve → cair → cicilan → lunas) yang terpantau dari satu dashboard.

## 2. Tujuan Produk & Metrik Sukses

**Tujuan MVP:** memverifikasi end-to-end loop bisnis pinjaman — dari daftar sampai cicilan lunas — dengan satu admin yang mengelola.

| Metrik | Target MVP |
|---|---|
| Waktu daftar → pengajuan pertama (KYC verified) | ≤ 1×24 jam |
| Waktu admin memutuskan 1 pengajuan | ≤ 5 menit per pinjaman |
| Loop penuh (register → 1 loan completed) teruji UAT | Berjalan tanpa intervensi manual di luar approval |
| Insiden akses liar (borrower lihat data user lain / self-promote admin) | 0 |

## 3. Persona & Peran

| Peran | Platform | Deskripsi |
|---|---|---|
| **Borrower** | Mobile app | Mengajukan pinjaman, menyelesaikan KYC, melihat jadwal cicilan, menerima notifikasi |
| **Admin / Operator** | Admin web | Memverifikasi KYC, menyetujui/menolak pengajuan, menandai cicilan lunas, memantau portofolio |

Role disimpan di `profiles.role` (enum `borrower`/`admin`) dan dipakai RLS + RPC guard di sisi database. Tidak ada registrasi admin terbuka — admin pertama dipromosikan manual via SQL.

## 4. Ruang Lingkup MVP

### 4.1 In scope (v1)

1. **Autentikasi** — registrasi & login email+password (Supabase Auth).
2. **KYC (Know Your Customer)** — form NIK, tanggal lahir, alamat + upload foto KTP & selfie ke storage privat; status `pending → verified / rejected` oleh admin.
3. **Pengajuan pinjaman** — nominal Rp500.000–Rp20.000.000, tenor 1–12 bulan, bunga flat 10%/tahun, kolom tujuan pinjaman; simulasi cicilan real-time sebelum submit.
4. **Approval workflow** — admin approve (auto-generate jadwal cicilan + notifikasi) atau reject dengan alasan (terkirim sebagai notifikasi).
5. **Cicilan** — jadwal per bulan dengan status `unpaid / paid / overdue`; admin menandai lunas; loan otomatis `completed` saat semua angsuran lunas.
6. **Notifikasi in-app** — list notifikasi per user dengan badge unread; update realtime (Supabase Realtime).
7. **Dashboard admin** — statistik (total borrower, KYC pending, pinjaman berjalan, outstanding), grafik pengajuan 6 bulan terakhir, distribusi status, daftar pinjaman terbaru; auto-refresh realtime.
8. **Manajemen user (admin)** — daftar/cari user, detail profil + riwayat pinjaman.

### 4.2 Out of scope (v1) — roadmap lanjutan

- Payment gateway / VA otomatis (pembayaran masih ditandai admin).
- Pencairan dana otomatis (disbursal) ke rekening.
- Credit scoring / limit dinamis per user.
- Push notification (FCM) & SMS/WA reminder.
- Multi-produk pinjaman (payday, produk gadaian, dsb.).
- Pelunasan dipercepat + kalkulasi bunga sisa.
- Push ke production & kepatuhan OJK penuh (lihat §9).

## 5. Kebutuhan Fungsional

### FR-1 Autentikasi
- FR-1.1 Registrasi mengirim `full_name` & `phone` sebagai metadata; trigger DB `handle_new_user` otomatis membuat `profiles` ber-role `borrower`.
- FR-1.2 Session persisten; logout dari halaman profil (mobile) & sidebar (admin).
- FR-1.3 Admin web men-gate akses: user tanpa `role='admin'` ditolak dengan halaman "Akses Ditolak" + auto sign-out.

### FR-2 KYC
- FR-2.1 Borrower mengisi NIK, tanggal lahir, alamat → update `profiles`.
- FR-2.2 Upload foto KTP + selfie via kamera/galeri; disimpan di bucket **privat** `kyc-documents` dengan path `{uid}/ktp.jpg` & `{uid}/selfie.jpg`.
- FR-2.3 Setelah submit, status KYC `pending`; borrower melihat banner status dan **belum bisa** mengajukan pinjaman sampai `verified` *(enforcement di UI; validasi server-side menyusul di fase integrasi)*.
- FR-2.4 Admin melihat antrean KYC pending, membuka dokumen via signed URL (10 menit), dan memutuskan verifikasi/tolak.
- FR-2.5 Borrower **tidak dapat** mengubah `kyc_status`/`role` miliknya sendiri (trigger guard DB).

### FR-3 Pengajuan Pinjaman
- FR-3.1 Rentang nominal Rp500.000–Rp20.000.000; tenor 1–12 bulan; bunga flat 10%/tahun (fixed v1).
- FR-3.2 Simulasi cicilan: `(amount + amount × 10% × tenor/12) / tenor`, dibulatkan ke atas.
- FR-3.3 Submit membuat loan ber-status `submitted`; **server memaksa** status, rate, dan `monthly_payment` via trigger (input client diabaikan) — mencegah manipulasi.
- FR-3.4 Satu user dapat memiliki banyak pinjaman (batas simultan menyusul di v1.1).

### FR-4 Approval Workflow (admin)
- FR-4.1 Status: `submitted → (under_review) → approved/disbursed` atau `rejected`.
- FR-4.2 Approve (RPC `approve_loan`): validasi status, generate baris `installments` 1..tenor (jatuh tempo `created + i bulan`), set `decided_by/decided_at`, kirim notifikasi.
- FR-4.3 Reject (RPC `reject_loan`): wajib alasan, terkirim sebagai notifikasi.
- FR-4.4 Kedua RPC hanya bisa dipanggil oleh admin (cek `is_admin()` server-side, security definer).

### FR-5 Cicilan
- FR-5.1 Borrower melihat jadwal cicilan di detail pinjaman dengan per-angsuran `unpaid/paid/overdue`.
- FR-5.2 Admin menandai cicilan lunas (RPC `pay_installment`), memicu notifikasi ke borrower.
- FR-5.3 Saat seluruh angsuran lunas → loan otomatis `completed`.
- FR-5.4 Penandaan `overdue` otomatis berdasarkan tanggal (job/scheduled, menyusul di v1.1 — v1 pakai tampilan tanggal lewat).

### FR-6 Notifikasi
- FR-6.1 Baris notifikasi dibuat server (RPC) untuk event: pinjaman disetujui, ditolak, cicilan diterima.
- FR-6.2 Mobile subscribe realtime pada tabel `notifications`; badge unread & mark-as-read saat dibuka.

### FR-7 Dashboard & Monitoring (admin)
- FR-7.1 Kartu: total borrower, KYC menunggu, pinjaman berjalan, total outstanding (jumlah loan `disbursed/active`).
- FR-7.2 Grafik: pengajuan per bulan (6 bulan terakhir) & distribusi status (pie).
- FR-7.3 Tabel pinjaman: filter status, cari nama/email, akses ke detail (approval point).
- FR-7.4 Data auto-refresh via realtime subscription (`loans`, `profiles`, `installments`, `kyc_documents`).

## 6. Kebutuhan Non-Fungsional

| Area | Kebutuhan |
|---|---|
| **Keamanan** | RLS aktif di semua tabel; borrower hanya melihat data miliknya. Tidak ada policy INSERT di `profiles` (mencegah self-promote admin). Trigger guard memaksa field server-side. Semua RPC keputusan mengecek `is_admin()`. Bucket KYC privat + signed URL berbatas waktu. |
| **Privasi** | Dokumen identitas (KTP, selfie) hanya diakses pemilik & admin; sesuai prinsip UU PDP No. 27/2022 (data sensitif, perlu perhatian khusus sebelum produksi). |
| **Ketersediaan** | Mengandalkan SLA Supabase (tanpa infra sendiri). |
| **Perangkat** | Android + iOS (Flutter), RTL layout standar Material 3; admin web responsive desktop-first. |
| **Bahasa UI** | Indonesia (santai-profesional). |
| **Kualitas kode** | `flutter analyze` 0 issue & `npm run build` 0 error sebagai gate sebelum merge. |

## 7. Arsitektur & Teknologi

```
┌─ Mobile Flutter ────────┐   ┌─ Admin web (React+Vite) ─┐
│ supabase_flutter SDK    │   │ supabase-js v2           │
│ Material 3 · bottom nav │   │ Tailwind + Recharts      │
└───────────┬─────────────┘   └───────────┬──────────────┘
            │        Auth + PostgREST + Storage + Realtime
            ▼                             ▼
┌─────────────────────────────────────────────────────────┐
│ SUPABASE (Supabase cloud)                               │
│ auth.users → trigger → profiles                         │
│ profiles · kyc_documents · loans · installments ·       │
│ notifications                                           │
│ RLS + trigger guard + RPC security-definer              │
│ bucket 'kyc-documents' (privat, path per user {uid}/)   │
└─────────────────────────────────────────────────────────┘
```

- **Monorepo**: `lender-platform/{mobile, admin, supabase}`.
- **State**: mobile pakai StatefulWidget + stream Supabase (tanpa provider/bloc) demi ringan v1; admin pakai fetch-on-mount + realtime refresh.
- **Keputusan kredensial**: mobile via `--dart-define` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); admin via `VITE_*` di `.env`. Keduanya tetap jalan (degraded + banner) saat belum dikonfigurasi.

## 8. Ringkasan Model Data

| Tabel | Isi utama | Catatan akses |
|---|---|---|
| `profiles` | role, email, nama, NIK, telepon, tgl lahir, alamat, kyc_status | 1-1 `auth.users` via trigger; tanpa INSERT policy publik |
| `kyc_documents` | doc_type (ktp/selfie), storage_path | path di bucket privat |
| `loans` | amount, tenor, rate, monthly_payment, purpose, status, keputusan | guard insert server-side |
| `installments` | seq, due_date, amount, status, paid_at | di-generate saat approve (unique loan_id+seq) |
| `notifications` | title, body, type, is_read | ditulis hanya via RPC server |

Enum status loan: `submitted, under_review, approved, rejected, disbursed, active, completed`.

## 9. Risiko & Kepatuhan

| Risiko | Dampak | Mitigasi v1 | Mitigasi produksi |
|---|---|---|---|
| Kegiatan pinjam-meminjam tanpa izin OJK | Hukum | Label internal/POC disclosed | Badge IPULE/pendaftaran OJK sebelum operasi komersial |
| Fraud identitas KYC (foto bocoran) | Kerugian | Verifikasi manual admin + matching visual | Liveness detection / Dukcapil check di v2 |
| Pembayaran manual (tandai lunas) | Salah catat | Konfirmasi admin + notifikasi | Payment gateway + webhook otomatis v2 |
| Supabase out/latency | Layanan turun | — | Status page + retry/backoff |
| Phantom error analyzer Flutter di host dev | Pending verifikasi build | Build APK sebagai jalur verifikasi kebenaran kode | Perbaiki cache analyzer host |

## 10. Status Implementasi (per 31 Okt 2026)

| Komponen | Status |
|---|---|
| `supabase/schema.sql` (tabel, RLS, guard, RPC auto-jadwal) | ✅ Selesai, siap dieksekusi |
| Admin web (10 file: auth gate, dashboard+chart, loans+approval, KYC verify, users, realtime) | ✅ Selesai — `npm run build` sukses 0 error |
| Mobile Flutter (13 file: auth, KYC upload, pengajuan+simulasi, riwayat, notifikasi realtime, profil) | ✅ Kode selesai — verifikasi `flutter build apk` berjalan |
| Setup Supabase project (user) | ⏳ Menunggu akun/project user |
| Integrasi end-to-end + UAT (register→KYC→loan→lunas) | ⏳ Setelah Supabase aktif |
| Pencairan/pembayaran nyata, FCM, overdue job, batas loan simultan | 🔜 v1.1+ |

## 11. Pertanyaan Terbuka

1. Batas jumlah pinjaman aktif simultan per borrower? (usulan: 1 untuk MVP)
2. Denda keterlambatan: persentase/hari atau flat? (usulan: 0.5%/hari, cap 10% pokok — v1.1)
3. Produk setelah MVP: bunga flat tetap atau sliding berdasarkan skor?
4. Branding (nama "Danaku" sementara), logo, dan warna akhir.
