# PRD — Danaku Bank Keliling Platform

**Versi:** 2.0 (Model Bank Keliling — revisi 1 Nov 2026)
**Tanggal:** 1 Nov 2026
**Status:** In Development — migrasi dari model pinjol (v1.0) ke bank keliling
**Pemilik:** Operator (D4NNBOZ)
**Klien:** Usaha bank keliling (owner + petugas lapangan + nasabah)
**Repo:** `C:/Users/simpl/lender-platform/` → `mobile/` (Flutter) + `admin/` (React+Vite) + `supabase/schema.sql`

---

## 1. Ringkasan Eksekutif

Danaku adalah aplikasi operasional **bank keliling** (pinjaman mikro dengan penagihan door-to-door), 3 peran:

1. **Mobile App Nasabah/Client (Flutter)** — daftar (mandiri dipandu petugas / didaftarkan petugas), KYC full KTP + kontak darurat, ajukan pinjaman, lihat sisa utang + jadwal + riwayat bayar, terima notifikasi.
2. **Mobile App Petugas Lapangan (satu app, mode peran)** — rute tagihan hari ini, input bayar tunai di depan nasabah, catat nunggak/janji bayar, daftarkan nasabah baru di tempat, setor rekap harian ke owner.
3. **Admin Web Owner (React+TS+Vite)** — dashboard setoran per petugas, verifikasi KYC, approve/reject pinjaman, rekonsiliasi setoran, daftar nunggak, kelola petugas & nasabah, laporan piutang & laba.

Backend 100% **Supabase Cloud**: Postgres + Auth + Storage + Realtime. Pembayaran = **tunai di lapangan** (tanpa payment gateway — sesuai realita bank keliling).

Keputusan klien (3 Nov 2026 — FINAL):
- **Bunga: 20% per periode pinjaman** (flat).
- **Frekuensi bayar: mingguan ATAU bulanan** (dipilih saat pengajuan — nilai plus aplikasi).
- Jumlah nasabah per petugas bervariasi (tidak ada angka pasti — desain harus fleksibel).
- Denda keterlambatan: belum ditentukan → denda = 0, disiapkan kolomnya.
- Nasabah baru: didaftarkan petugas; ke depan daftar mandiri dipandu petugas.
- Jumlah petugas: belum diketahui → kelola tim harus dinamis.

## 2. Masalah yang Diselesaikan

- Catatan petugas masih buku fisik → hilang, tidak terekap, owner tidak tahu duit berapa yang dibawa tiap petugas.
- Nunggak ketahuan telat (baru sadar pas buku dihitung) → butuh daftar nunggak realtime per petugas.
- Nasabah tidak tahu sisa utang (hanya kartu fisik) → butuh tampilan sisa + riwayat.
- Pengajuan baru lewat omongan → tidak terlacak statusnya.

## 3. Tujuan & Success Metrics (MVP)

| Tujuan | Metric | Target MVP |
|---|---|---|
| Nasabah end-to-end (daftar → KYC → ajukan → disetujui → lunas) | 1 loan fiktif lolos alur penuh | 100% tanpa error |
| Petugas bisa input bayar tunai < 30 detik/nasabah | Waktu buka rute → simpan pembayaran | < 30 detik |
| Owner tahu setoran per petugas per hari | Rekap harian tampil < 1 menit setelah petugas submit | 100% akurat |
| Nol akses silang antar nasabah | Uji RLS | Lolos |
| Nol privilege escalation | Uji role/status/bunga | Lolos |
| Kedua app build bersih | `npm run build` + `flutter build apk` | 0 error |

## 4. Ruang Lingkup

### In-scope (MVP v2.0 — migrasi dari v1.0)
- Auth 3 peran: admin/owner, petugas (dibuatkan owner), nasabah (daftar mandiri/didaftarkan petugas).
- KYC full KTP + 3 nomor + 2 kontak darurat (SUDAH JADI ✅).
- Pengajuan pinjaman: plafon Rp500rb–Rp20jt, **frekuensi mingguan/bulanan**, bunga flat **20%/periode**.
- Approval: submitted → approved/disbursed | rejected + alasan (survey formal DITIADAKAN — sesuai realita bank keliling).
- Auto-generate jadwal **per frekuensi** (mingguan: due tiap 7 hari; bulanan: tiap bulan).
- **Pembayaran tunai oleh petugas** (RPC `record_cash_payment`): catat jumlah, tanggal, penerima (petugas_id), cicilan lunas parsial/penuh; auto-complete loan.
- **Rekap setoran harian petugas → owner** (total tunai dibawa per hari + rekonsiliasi).
- Daftar tagihan per petugas (rute: cicilan jatuh tempo + nunggak milik nasabahnya).
- Status nunggak otomatis (lewat due_date belum bayar → overdue) + daftar nunggak per petugas.
- Riwayat + sisa utang (nasabah & admin), notifikasi otomatis, dashboard + laporan.
- Denda: kolom disiapkan (`late_fee`), nilai 0 sampai klien menentukan.

### Out-of-scope (pasca-MVP)
- Payment gateway / VA / transfer (tunai adalah jalurnya).
- E-KYC otomatis, credit scoring formal, SLIK.
- FCM push terjadwal (notifikasi in-app dulu).
- Pengajuan mandiri penuh tanpa petugas (tahap 2 — sekarang petugas yang daftarin).
- Multi-cabang, audit log UI, izin OJK.

## 5. Persona

| Persona | Kebutuhan |
|---|---|
| **Nasabah (Bu Ani)** — pedagang pasar, HP Android entry-level | Tahu sisa utang & kapan bayar berikutnya; riwayat bayar tercatat; daftar dibantu petugas |
| **Petugas lapangan (Bang Udin)** — keliling tiap hari, HP jadi buku catatan | Rute tagihan hari ini (nama-alamat-nominal), input bayar tunai 1-klik, tandai nunggak/janji bayar, daftarkan nasabah baru di tempat |
| **Owner (Pak Haji)** — pantau dari kantor via browser | Setoran per petugas per hari, siapa nunggak, sisa piutang total, laba periode, approve pinjaman & kelola tim |

## 6. Asumsi & Ketergantungan

1. Supabase project (region Singapore) sudah dibuat; `schema.sql` sudah dijalankan sekali.
2. Bucket Storage `kyc-documents` PRIVATE sudah dibuat + 2 policy (insert/select) sesuai README.
3. Minimal 1 akun dipromote `role='admin'` via SQL.
4. Kredensial: admin pakai `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); mobile pakai `--dart-define` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) atau default di `lib/config.dart`.
5. Tanpa Supabase terisi, kedua app tetap build & jalan dengan banner "belum dikonfigurasi" (mode degradasi).

## 7. Arsitektur

```
Mobile (Flutter) ──┐
                   ├─→ Supabase Cloud ─ Postgres (+RLS/RPC) ─ Auth ─ Storage ─ Realtime
Admin Web (Vite) ──┘
```

- Tidak ada backend custom. Semua logika sensitif (approve, generate jadwal, guard bunga/status/role) di **Postgres function security definer**.
- Mobile & admin bicara langsung ke Supabase SDK (supabase_flutter / supabase-js).
- Bucket KYC private; baca hanya via signed URL 10 menit.

## 8. Model Data (kontrak — lihat supabase/schema.sql; MIGRASI v2.0 PENDING)

- **profiles**(id→auth.users, role **admin|petugas|nasabah** ← rename dari borrower|admin, field KTP full + phone + kyc_status; tambah `petugas_id` → penanggung jawab (untuk nasabah), `wilayah` (untuk petugas))
- **emergency_contacts**(tetap ✅)
- **kyc_documents**(tetap ✅)
- **loans**(+ `frequency` **weekly|monthly**, + `interest_rate` default **15.00**, + `late_fee` default 0, + `collected_by` → petugas yang input bayar terakhir; tenor = jumlah periode sesuai frekuensi)
- **installments**(+ `paid_by` → petugas_id, + `paid_at` tetap, + `amount_paid` untuk cicilan parsial)
- **payments**(BARU): setiap setoran tunai (id, loan_id, installment_id, nasabah, petugas, amount, paid_at, note) — buku kas digital
- **collection_routes**(BARU): penugasan nasabah → petugas (petugas_id, nasabah_id, wilayah, aktif)
- **notifications**(tetap ✅ + tipe baru: tagihan & janji bayar)
- RPC: `approve_loan` (generate jadwal **per frekuensi**), `reject_loan` (tetap ✅), **`record_cash_payment`** (pengganti pay_installment versi petugas: cek petugas/admin → catat payment → update installment → notif), helper `is_admin()`, **`is_petugas()`**, trigger existing + guard frekuensi/bunga.

## 9. Kebutuhan Fungsional — Mobile (FR-M)

### Nasabah (tetap dari v1.0, istilah borrower→nasabah)
| ID | Fitur | Detail |
|---|---|---|
| FR-M1 | Register | email+password+nama+telepon → trigger bikin profile **nasabah** (atau didaftarkan petugas) |
| FR-M2 | Login/logout + sesi persisten | Supabase auth; ambil profile (role, kyc_status) |
| FR-M3 | Form KTP full | 14 field ✅ SUDAH JADI |
| FR-M3b | Nomor & kontak darurat | ✅ SUDAH JADI |
| FR-M4 | Upload dokumen | ✅ SUDAH JADI |
| FR-M5 | Status KYC | Banner; lengkap jika 14 field + 3 nomor + 2 dokumen |
| FR-M6 | Simulasi pinjaman | Slider 500rb–20jt + **frekuensi mingguan/bulanan** + tenor periode → preview cicilan flat 15% |
| FR-M7 | Ajukan pinjaman | Insert loans (frequency + tenor; server override rate/payment) |
| FR-M8 | Daftar pinjaman | List + badge + **sisa utang** |
| FR-M9 | Detail pinjaman | Jadwal per periode + status + siapa petugas penerima |
| FR-M10 | Notifikasi | List + realtime + badge + mark-read (tipe baru: tagihan, janji bayar) |
| FR-M11 | Profil | Lihat/edit nama & phone; tampil role & KYC; logout |
| FR-M12 | Mode belum-konfigurasi | Banner + auth disabled dengan pesan |

### Petugas lapangan (BARU — satu app, home beda per role)
| ID | Fitur | Detail |
|---|---|---|
| FR-P1 | Rute hari ini | Daftar tagihan jatuh tempo + nunggak milik nasabahnya (nama, alamat, nominal, status) |
| FR-P2 | Input bayar tunai | 1-klik per cicilan (penuh/parsial + catatan) → RPC record_cash_payment |
| FR-P3 | Tandai nunggak/janji bayar | Status + tanggal janji + catatan → notif ke owner |
| FR-P4 | Daftarkan nasabah baru | Form (nama, NIK, HP, alamat, wilayah, foto KTP) → calon_nasabah; tracking status (baru/diproses/jadi/ditolak) |
| FR-P5 | Rekap setoran harian | Total tunai dibawa hari ini + submit ke owner (rekonsiliasi) |
| FR-P6 | Riwayat kunjungan | Log pembayaran yang pernah diinput |

Navigasi nasabah: BottomNav 5 tab (Beranda, Ajukan, Pinjaman, Notifikasi, Profil). Navigasi petugas: (Rute, Setoran, Nasabah, Profil). Tema Material 3 teal/emerald, rupiah id-ID.

## 10. Kebutuhan Fungsional — Admin Web (FR-A)

| ID | Fitur | Detail |
|---|---|---|
| FR-A1 | Login + gate owner | signIn; cek role admin; non-owner → signOut + "Akses ditolak" |
| FR-A2 | Dashboard | Kartu: total nasabah, KYC pending, pinjaman berjalan, outstanding; **setoran hari ini per petugas**; bar 6 bulan; pie status; pinjaman terbaru; daftar nunggak |
| FR-A3 | Daftar pinjaman | Tabel + join nasabah; filter status + **frekuensi**; cari nama/email; realtime |
| FR-A4 | Detail pinjaman | Data loan + nasabah + jadwal; approve (RPC), reject (RPC + alasan wajib) |
| FR-A5 | Verifikasi KYC | Antrean pending + dokumen via signed URL + **data KTP full + 3 nomor + 2 kontak darurat** ✅ SUDAH JADI; tombol Verifikasi/Tolak |
| FR-A6 | Nasabah & petugas | Tabel semua profile (cari, badge KYC & role); detail + riwayat loan; **tambah akun petugas + tugaskan rute** |
| FR-A6b | Rekonsiliasi setoran | Setoran harian per petugas (total tunai vs tercatat) + tombol terima |
| FR-A6c | Laporan | Sisa piutang per nasabah, laba periode (total bunga), nunggak per wilayah |
| FR-A7 | Realtime | Subscribe loans/profiles/kyc_documents/**payments** → auto-reload |
| FR-A8 | Mode belum-konfigurasi | Banner kuning; error login ditangani, tidak crash |

Layout: sidebar (Dashboard, Pinjaman, Verifikasi KYC, Users). Bahasa Indonesia, badge warna per status.

## 11. Kebutuhan Backend (FR-B — v1.0 di schema.sql ✅; v2.0 PENDING migrasi)

V1.0 (live): FR-B1 ✅ FR-B2 ✅ FR-B3 ✅ FR-B3b ✅ FR-B4 ✅(jadwal bulanan) FR-B5 ✅ FR-B6 ✅.

V2.0 (menunggu eksekusi — SETELAH build APK kelar):
| ID | Aturan |
|---|---|
| FR-B1b | RLS 3 peran: nasabah = miliknya; petugas = nasabah dalam rutenya + tulis payments; owner = semua |
| FR-B4b | approve_loan: generate jadwal **per frequency** (weekly: +7 hari × N; monthly: +1 bulan × N); bunga default **15.00**; guard frequency weekly\|monthly |
| FR-B6b | `record_cash_payment`: cek petugas/admin → catat payments (tunai) → update installment (penuh/parsial) + paid_by → notif; semua paid → completed |
| FR-B7 | Role enum migrasi borrower→nasabah + petugas baru; `handle_new_user` default nasabah; pembuatan petugas/admin hanya via owner (GoTrue Admin API + promote) |

## 12. Alur Bisnis Utama (Bank Keliling)

```
Nasabah: daftar (mandiri dipandu petugas / didaftarkan petugas)
  → isi KYC full + kontak darurat → [owner verifikasi]
  → ajukan pinjaman (plafon, frekuensi mingguan/bulanan, tenor periode)
  → owner approve → jadwal auto-jadi per frekuensi
  → PETUGAS keliling: input bayar tunai per kunjungan → payment tercatat
  → nunggak? tandai janji bayar → didatangi lagi
  → semua lunas → completed (+ nasabah bagus → plafon naik tahap 2)
  (reject kapan pun → notifikasi + alasan)

Setoran: petugas submit rekap harian → owner rekonsiliasi (tunai vs tercatat)
```

## 13. Aturan Bisnis & Perhitungan (v3.0 — bunga 20%)

- Bunga flat **20%/periode**: `total = amount + amount*20%`; `cicilan = ceil(total/tenor)`.
  Contoh: pinjam 1jt, 10 minggu → total 1.200.000 → 120.000/minggu.
- Batas: amount 500.000–20.000.000 (CHECK), tenor = jumlah periode 1–52 (mingguan) / 1–12 (bulanan).
- Frekuensi: `weekly` (due = approve + 7×i hari) | `monthly` (due = approve + i bulan).
- Denda: kolom `late_fee` ada, nilai **0** sampai klien menentukan.
- Status final: `completed` otomatis saat semua paid; `rejected` butuh alasan wajib.
- Notifikasi hanya ditulis server via RPC.

## 14. Non-Fungsional

- Mobile: Android 8+ / iOS 15+, ukuran APK debug wajar, bekerja di koneksi seluler.
- Admin: browser modern, build statis < 1 MB gzip JS (di luar recharts), PWA tidak required.
- Availability mengikuti SLA Supabase Cloud (free tier cukup untuk MVP/demo).
- Bahasa UI: Indonesia. Zona waktu tampilan: id-ID.

## 15. Keamanan

- RLS + security-definer RPC + guard trigger (diuji di §3).
- Anon key boleh di client (wajar Supabase); service_role TIDAK PERNAH di client.
- Bucket private + path per-user + signed URL pendek.
- Password dipegang GoTrue (bcrypt); tidak ada penyimpanan kredensial di app.
- Catatan produksi: aktifkan email confirmation, password policy, rate-limit auth, dan audit log.

## 16. Risiko & Mitigasi

| Risiko | Mitigasi MVP |
|---|---|
| Operasional tanpa izin (bank keliling informal) | MVP internal/usaha sendiri; sebelum ekspansi konsultasi legalitas |
| Petugas bawa tunai → selisih/catatan fiktif | Rekap harian + rekonsiliasi owner; payments tercatat per transaksi + paid_by |
| HP petugas hilang/rusak | Data di cloud; login ulang di HP pengganti |
| Nasabah gaptek (tidak install app) | App nasabah opsional — petugas bisa daftarkan & operasikan atas nama nasabah |
| Angka bunga belum fix | 20% per 3 Nov 2026; ganti via 1 migration + 1 konstanta |
| Ketergantungan Supabase cloud | Skema SQL standar Postgres → bisa migrasi self-host kapan pun |

## 17. Milestone

- [x] M0 Fondasi v1.0: monorepo, schema+RLS+RPC, README
- [x] M1 Admin web v1.0: build sukses 0 error (JK join-fix + errMsg)
- [x] M2 Mobile v1.0: kode lengkap (KTP koperasi + kontak darurat) — **APK DEBUG BERHASIL (1 Nov 2026, percobaan-10 ✅): app-debug.apk ~151MB, root cause = Dart SDK snapshot korup (frontend_server hilang), fix = flutter upgrade --force; toolchain final: Gradle 8.14.3 + AGP 8.11.1 + Kotlin 2.2.20 + JDK 17; analyze 0 error**
- [x] M3 Integrasi + uji AC1–AC8, hardening B5/B6 (13+13 kasus ✅)
- [x] M4 PRD v2.0 bank keliling (1 Nov 2026): 3 peran, bunga 15%, frekuensi mingguan/bulanan, record_cash_payment, payments, collection_routes
- [x] M5 Migrasi DB v2.0 (1 Nov 2026): enum +petugas/nasabah (3 borrower→nasabah), handle_new_user default nasabah, profiles +petugas_id/+wilayah, loans +frequency/+late_fee/+collected_by + bunga default 15.00 + tenor 1–52, installments +paid_by/+amount_paid, tabel **payments** + **collection_routes** + RLS, `is_petugas()`, approve_loan per-frekuensi, **`record_cash_payment`** (tunai petugas, parsial, paid_by, notif). Uji live: weekly 1jt/10 → guard kunci 15% + cicilan 115rb ✅ → approve → 10 jadwal gap 7 hari ✅ → petugas bayar penuh+parsial ✅ → nasabah ditolak ✅ → overpay ditolak ✅ → lunas 11 payments total 1.150.000 → completed + collected_by ✅. schema.sql sinkron.
- [x] M6 Mode petugas mobile + frekuensi pengajuan (1 Nov 2026): models +frequency/+RouteTask/+Payment, service (submitLoan frequency, recordCashPayment, fetchRouteTasks, fetchPaymentsToday), **route_screen** (rute + terima tunai penuh/parsial + nunggak highlight), **setoran_screen** (rekap harian), root_shell cabang peran (petugas: Rute/Setoran/Notif/Profil), apply_loan frekuensi mingguan-bulanan + tenor dinamis + bunga 15%. analyze 0 error. **Gap RLS ditemukan & ditutup**: petugas butuh baca loans/installments rute (`route loans read`, `route inst read` ✅; petugas asing → [] ✅). Uji live: monthly 2jt/3 → 3×766.667 ✅ → petugas baca rute + bayar 204 ✅. FR-P4 (daftarkan nasabah) DITUNDA ke M6b (butuh tabel calon_nasabah + convert owner).
- [x] M6b Daftarkan nasabah oleh petugas (1 Nov 2026): tabel **calon_nasabah** + RLS, storage prefix `calon/` untuk petugas, mobile **DaftarNasabahScreen** (form + foto KTP kamera + tracking status) + tab Daftar ke-5 petugas, admin **CalonNasabah page** (verifikasi + tandai jadi/ditolak + link UUID). Uji live: petugas submit Dedi ✅ → upload awal 403 → policy storage diperbaiki ✅ → owner convert (akun + profile + rute otomatis) ✅ → status jadi_nasabah ✅ → nasabah lain baca → [] ✅. schema.sql + PRD sinkron.
- [x] M7 Admin v2.0 (1 Nov 2026): api payments + agregasi client (aggregateSetoran, buildPiutang, totalLaba), halaman **Setoran** (rekap per petugas/hari + rincian transaksi, FR-A6b), **Laporan** (kartu tagihan/masuk/sisa/laba + tabel nunggak + piutang per nasabah link ke detail, FR-A6c), dashboard +kartu setoran hari ini + tipe role 3 peran (FR-A1/A2). build ✅. Validasi live: payments hari ini dari Udin ✅, piutang C 3.450.000 ✅.
- [x] M7b Blok Nunggak di dashboard (1 Nov 2026): daftar pinjaman nunggak (urut tunggakan terbesar) + expand per nasabah: cicilan telat (seq/due/terkumpul/sisa) + 5 riwayat bayar terakhir (tanggal/petugas/catatan/nominal) + link detail pinjaman. build ✅. Contoh live: Ajeng 1 telat Rp575.000, riwayat kosong ("belum pernah bayar") ✅.
- [x] M7c Uji macet di tengah (1 Nov 2026): seq3 parsial 300rb+200rb → unpaid/500rb ✅ → overpay ditolak ✅ → lunasi sisa → completed ✅. **Temuan**: pay_installment v1 tidak tulis payments → rekap setoran selisih. **Fix**: pay_installment kini catat payments (note 'via admin web') + backfill data lama; rekonsiliasi payments=installments=2.300.001 ✅. schema.sql sinkron.
- [x] M-void Koreksi salah input via reversal (1 Nov 2026): RPC **void_payment** (alasan wajib, baris lawan negatif + link void_of, kembalikan amount_paid, loan bisa balik completed→active, notif ke nasabah; izin: petugas miliknya hari-H, admin bebas; guard: tidak bisa void koreksi/double-void/void bikin negatif). Uji live 6/6 ✅ (nasabah→400, tanpa alasan→400, void benar→204 + audit trail utuh, double→400, overpay-sisa→400 ditolak, input benar 50rb ✅, cleanup ✅). UI: mobile Setoran (tombol Koreksi + dialog alasan + baris merah) + admin Setoran (tombol Koreksi + prompt alasan + baris merah). analyze 0 error, admin build ✅. schema.sql + PRD sinkron.
- [x] M-void2 Koreksi + input benar sekaligus (1 Nov 2026): RPC **void_and_repay** (void + bayar benar atomic; gagal di mana pun = rollback total — teruji: benar 600rb > sisa → void batal total ✅). Hasil: salah 400rb → −400rb + 100rb benar, amount_paid 150rb ✅. UI: modal admin (field nominal opsional, tombol dinamis "Koreksi + Catat Benar") + dialog mobile (checkbox + field). Menggantikan window.prompt sepenuhnya. build ✅, analyze 0 error.
- [x] M-autoapply Kelebihan bayar mengalir otomatis (1 Nov 2026): `record_cash_payment` v2 — nominal berapa pun (≤ total sisa) → lunasi target → sisa ke cicilan berikutnya by due_date (tunggakan didahulukan); tiap aliran = 1 payments + note "Kelebihan dari #X"; overpay total → 400; notif sebutkan aliran. Uji live Ajeng: 700rb → seq4 lunas + 125rb ke seq2 overdue ✅ → lunasi 2.025.000 sekaligus → completed, net 3.450.000 ✅. Bayar tanggal beda (advance) memang sudah didukung sejak awal (cicilan belum due bisa dibayar parsial). schema.sql + PRD sinkron.
- [x] M6c Ringkasan bayar di detail pinjaman (1 Nov 2026): mobile + admin tampil **total tagihan** (pokok+bunga+denda), **sudah dibayar** (sum amount_paid, parsial ikut), **sisa hutang** + progress nominal + sisa per angsuran; label frekuensi/tenor/bunga v2.0. analyze 0 error, admin build ✅. Validasi angka live: weekly completed 1.150.000/1.150.000/0 ✅; backfill amount_paid untuk paid lama ✅.
- [x] M13 Overdue otomatis + Convert calon 1-klik (5 Nov 2026): **(roadmap #1+#2 tutup)**. DB live: `pg_cron` aktif, job `danaku-mark-overdue` (`0 17 * * *` UTC = 00:00 WIB) → `mark_overdue_installments()` memindahkan cicilan `unpaid` lewat tempo ke `overdue` + 1 notifikasi `tagihan` per transisi (idempoten, run kedua = 0); semua tanggal acuan pakai `now() at time zone 'Asia/Jakarta'` (server TZ = UTC). `void_payment` diperbaiki: koreksi tidak lagi me-reset status jadi `unpaid` — balik ke `overdue` bila memang lewat tempo. Guard `profiles_guard_update` dapat escape hatch server-side (`auth.uid() is null` / `service_role`) supaya convert bisa set `kyc_status`, tanpa membuka eskalasi end-user. `convert_calon_internal(calon_id,user_id,assign_route)` — REVOKE anon/authenticated, GRANT service_role: isi profil dari data lapangan, tolak NIK dobel, auto-assign `collection_routes` ke petugas pendaftar, tutup baris calon, notif nasabah. Edge Function `danaku-api` **v3** action `convert-calon`: buat akun service_role (`n<NIK>@danaku.test`) + deteksi NIK sudah berakun + rollback hapus akun bila langkah DB gagal + salin foto KTP lapangan ke `kyc_documents`. Admin web: halaman baru **/calon** (filter status, Lihat KTP via signed URL, Convert 1-klik, Tolak ber-catatan). Mobile: `fetchRouteTasks` ganti `.eq('status','unpaid')` → `.neq('status','paid')` — **bug laten**: begitu cron menandai `overdue`, rute petugas jadi kosong dan seluruh tunggakan hilang dari HP. Uji live ✅ (semua di-ROLLBACK): unpaid→overdue flagged=1 notif_delta=1, run#2 flagged=0 idempoten; void overdue→paid→void→`overdue`, cicilan belum tempo→paid→void→`unpaid`; convert via UI → profil/nik/phone/alamat/wilayah/petugas terisi, kyc=verified, rute=1, dok ktp=1, notif=1; double-convert 409, NIK dobel ditolak, tanpa token 401, petugas 403; guard: nasabah role→admin & kyc ditolak 400, tulis profil orang lain 204-tapi-0-baris; loop cron terbukti jalan (`job_run_details` succeeded). Build: admin ✅ (tsc 0 error + vite), mobile `flutter analyze` 0 error (4 info deprecated Radio lama). Test harness: `supabase/m13_convert_overdue.sql`.
- [x] M8 Demo ke klien (1 Nov 2026): APK final **app-debug.apk 177MB** (BUILD_EXIT=0, fitur M5–M-void2–M-autoapply semua masuk) + **DEMO.md** (checklist 4 skenario ±20 menit + cast 8 akun + catatan klien) + data demo dirapikan (nama Indonesia, Budi nunggak fresh seq1 telat 5 hari, Petugas Asing tanpa rute). PRD §18.7/§19/status board updated (basi pinjol dibersihkan).
- [x] M11 Tanpa-petugas (3 Nov 2026): klien TANPA petugas lapangan — admin daftarkan nasabah + catat bayar langsung. Admin web: halaman **NasabahBaru** (`/users/new`: signUp email n[NIK]@danaku.local + restore sesi admin + profil verified, tombol di Users) + **Catat Bayar tunai** per cicilan di LoanDetail (modal nominal+catatan, RPC record_cash_payment, auto-apply) + Setoran label "Pencatat". Uji live ✅: admin catat 100rb ke Dedi (parsial, petugas_id=admin). Build admin ✅.
- [x] M10 Bunga 20% (3 Nov 2026): default kolom + guard 15→20; mobile _rate 20.0; PRD §13/keputusan/risiko + DEMO + PPTX (120rb/minggu, total 1.2jt) sinkron. **Bug ketemu & fix:** overload approve_loan (2 versi) bikin PostgREST 300 → drop versi 1-arg, sisakan 2-arg (default = kompatibel). Uji live: Candra 1jt/10 → 20.00 + 120rb ✅ → approve → completed 10×120rb ✅. Catatan: loan yang SUDAH cair sebelum ini tetap ikut akad lamanya (15%); 1 loan submitted lama disamakan 20%.
- [x] M9 v3.0 Registrasi & fitur klien (3 Nov 2026): DB live — profiles +6 kolom (current/office address + 4 shareloc), loans +3 (requested_amount, collateral_type/detail), loan_documents + RLS, RPC approve_loan(p_amount_override), admin_create_loan (fix monthly_payment dummy), nasabah_telat_flag, guard tenor monthly 1|3 + weekly 1-52. Uji live ✅ (tenor 2 ditolak, tenor 3 OK, override 1.8jt = 690rb, multi paralel, flag budi=true/dedi=false, Dedi e2e usulan 3jt → final 2.5jt + WA-loan 1jt cair). Mobile: KYC +alamat/kantor/shareloc + OCR KTP (mlkit) + apply tenor 1/3 + jaminan + foto di detail + izin lokasi/kamera; Admin: LoanDetail nominal final + dokumen + LoanNew + Users/UserDetail flag telat + domisili/maps. Build: web ✅ APK 223MB ✅ admin ✅, analyze 0 error. **Web mobile: `mobile/build/web/` (serve statis /mobile/).**

**Status board (1 Nov 2026):** ✅ SEMUA M SELESAI (M0–M8 + M-void/M-void2/M-autoapply + M6b/M6c/M7b/M7c). APK final + admin live + data demo + DEMO.md siap. File `docs/PRD.md` duplikat lama — acuan resmi `PRD.md` root.

## 18. Acceptance Criteria MVP (Definition of Done) — HASIL UJI 1 Nov 2026

1. ✅ Register → KYC (upload 2 foto) → status pending tampil di kedua sisi. (borrower.a: trigger profile ok, PATCH KYC 204, 2 file di bucket, 2 baris kyc_documents 201, pending terbaca A & antrean admin)
2. ✅ Admin verifikasi KYC → borrower lihat verified. (signed URL ok, PATCH 204, A baca `verified`)
3. ✅ Borrower ajukan 5jt/6bln → admin lihat + approve → 6 jadwal di kedua sisi. (insert 5jt/6bln; selundupan status/rate/payment di-override guard → submitted/10.00/875000 = hitungan flat pas; approve RPC 204 → disbursed + 6×875rb total 5.250.000 + notifikasi)
4. ✅ Admin tandai lunas 6/6 → completed + notifikasi realtime. (6× pay_installment 204, double-pay idempotent 204, status completed, 7 notifikasi. Catatan: satu 400 di tengah jalan adalah artefak CRLF di script uji, bukan bug RPC — retry UUID bersih = 204)
5. ✅ Reject loan dengan alasan → borrower terima notifikasi berisi alasan. (loan ke-2 2jt/3bln → rejected + `reject_reason` + body notif memuat alasan persis)
6. ✅ User A tidak bisa akses data user B. (profile B → [], loans B → [], scan semua loans hanya milik A, PATCH role B → 204/0-rows-tidak-berubah, self-escalate → 400 `Tidak diizinkan…`; verifikasi server: B tetap borrower/pending, A tetap borrower/verified)
7. ✅ Build bersih codebase final. Admin: `npm run build` 0 error (berulang, termasuk M7). Mobile: `flutter analyze` 0 error (4 info deprecated Radio, non-blocking); APK debug berhasil berkali-kali (toolchain final Gradle 8.14.3 + AGP 8.11.1 + Kotlin 2.2.20 + JDK 17).

8. ✅ (Model koperasi, 1 Nov 2026) Borrower C isi 14 field KTP + phone + 2 kontak (nama+hubungan+nomor) → terbaca C & admin (pending queue + halaman verifikasi); RLS kontak steril (A baca kontak C → [], A tulis utk C → 403).

## 19. Roadmap Pasca-MVP (prioritas bank keliling)

1. ✅ **SELESAI M13 (5 Nov 2026)** — Convert calon 1-klik (Edge Function `convert-calon` + assign rute otomatis ke petugas pendaftar).
2. ✅ **SELESAI M13 (5 Nov 2026)** — Status overdue otomatis (`pg_cron` 00:00 WIB + notifikasi `tagihan`). **Sisa:** denda nominal saat angka final disepakati klien (`loans.late_fee` masih 0).
3. Push notification (FCM) + pengingat H-3/H-1 ke nasabah. *Sebagian: notifikasi in-app `tagihan` sudah terbit dari job harian; FCM belum.*
4. Plafon naik otomatis untuk nasabah lancar.
5. Cetak kartu angsuran fisik (PDF/thermal) dari jadwal.
6. Multi-wilayah + multi-owner (cabang).
7. Audit log UI (siapa ubah/void apa). *Catatan: `payments.void_of/void_reason/voided_at` sudah menyimpan jejak koreksi, belum ada layar khusus.*

---

*Dokumen ini adalah kontrak pembangunan. Perubahan skema tabel/RPC wajib update schema.sql + kedua app + bagian §8 PRD ini bersamaan.*
