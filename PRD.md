# PRD — SWFinance Bank Keliling Platform

**Versi:** 5.2 (Revisi 6 Nov 2026 — M28: kulit "Vault" — login forest + frame forest navbar/bottom bar; sebelumnya v5.1: rebrand SWFinance)
**Tanggal:** 6 Nov 2026
**Status:** In Development — v5.2 (brand + identitas visual SWFinance terpasang; model DanaModal + Arus Kas + redesign UI sesuai mockup acuan)
**Pemilik:** Operator (D4NNBOZ)
**Klien:** Usaha bank keliling (owner/admin — satu peran pengguna aplikasi)
**Repo:** `C:/Users/simpl/lender-platform/` → `admin/` (React+Vite) + `supabase/schema.sql`

---

## 1. Ringkasan Eksekutif

SWFinance adalah aplikasi operasional **bank keliling** (pinjaman mikro dengan penagihan door-to-door), **satu peran pengguna**:

1. **Admin Web Owner (React+TS+Vite)** — dashboard setoran, verifikasi KYC, approve/reject pinjaman, rekonsiliasi setoran, daftar nunggak, kelola nasabah, laporan piutang & laba.

Backend 100% **Supabase Cloud**: Postgres + Auth + Storage + Realtime. Pembayaran = **tunai di lapangan** (tanpa payment gateway — sesuai realita bank keliling), dicatat admin saat kunjungan.

> **M21 (5 Nov 2026) — koreksi klien:** "3 peran itu hilang karena yang menggunakan aplikasi nya cuma admin/owner aja." Mobile app Flutter **dihapus sepenuhnya**; akun petugas **dihapus total**. `role='nasabah'` tetap ada di DB semata sebagai penanda **pemilik data pinjaman**, bukan sebagai pengguna yang login.

Keputusan klien (3 Nov 2026 — FINAL):
- **Bunga: 20% per periode pinjaman** (flat).
- **Frekuensi bayar: mingguan ATAU bulanan** (dipilih saat pengajuan — nilai plus aplikasi).
- Denda keterlambatan: belum ditentukan → denda = 0, disiapkan kolomnya.
- Nasabah didaftarkan admin/owner langsung dari web.

Revisi klien (5 Nov 2026):
- **Nasabah tidak perlu email** — email dummy `nNIK@danaku.test` dibuat otomatis dan disembunyikan dari UI.
- **Foto nasabah, foto KTP, foto jaminan, dan koordinat lokasi** harus tersimpan & tampil di detail nasabah.
- **Menu Calon Nasabah dihapus**; diganti **fitur hapus nasabah** (dengan guard pinjaman berjalan).
- **Semua konfirmasi pakai popup box custom** — tidak boleh dialog bawaan browser.
- **Minimum pinjaman Rp50.000** (sebelumnya Rp500.000).
- **Aplikasi harus disiapkan untuk nasabah banyak** — jangan tambal kondisi sekarang.
- **Hanya admin/owner yang pakai aplikasi** — 3 peran dihapus total; mobile app dihapus sepenuhnya.

## 2. Masalah yang Diselesaikan

- Catatan tagihan masih buku fisik → hilang, tidak terekap, owner tidak tahu duit berapa yang masuk.
- Nunggak ketahuan telat (baru sadar pas buku dihitung) → butuh daftar nunggak realtime.
- Nasabah tidak tahu sisa utang (hanya kartu fisik) → butuh tampilan sisa + riwayat.
- Pengajuan baru lewat omongan → tidak terlacak statusnya.

## 3. Tujuan & Success Metrics (MVP)

| Tujuan | Metric | Target MVP |
|---|---|---|
| Nasabah end-to-end (daftar → KYC → ajukan → disetujui → lunas) | 1 loan fiktif lolos alur penuh | 100% tanpa error |
| Admin bisa input bayar tunai < 30 detik/nasabah | Waktu buka detail → simpan pembayaran | < 30 detik |
| Owner tahu setoran per hari | Rekap harian tampil < 1 menit setelah admin catat | 100% akurat |
| Nol akses silang antar pemilik data | Uji RLS | Lolos |
| Nol privilege escalation | Uji role/status/bunga | Lolos |
| Admin web build bersih | `npm run build` | 0 error |

## 4. Ruang Lingkup

### In-scope (MVP v2.0 — migrasi dari v1.0)
- Auth **satu peran**: admin/owner (dibuatkan owner). Tidak ada akun petugas / nasabah yang login.
- KYC full KTP + 3 nomor + 2 kontak darurat (SUDAH JADI ✅).
- Pengajuan pinjaman: plafon **Rp50rb–Rp20jt** (revisi M17, 5 Nov 2026), **frekuensi mingguan/bulanan**, bunga flat **20%/periode**.
- Approval: submitted → approved/disbursed | rejected + alasan (survey formal DITIADAKAN — sesuai realita bank keliling).
- Auto-generate jadwal **per frekuensi** (mingguan: due tiap 7 hari; bulanan: tiap bulan).
- **Pembayaran tunai oleh admin** (RPC `record_cash_payment`): catat jumlah, tanggal, pencatat (`dicatat_oleh`), cicilan lunas parsial/penuh; auto-complete loan.
- **Rekap setoran harian → owner** (total tunai masuk per hari + rekonsiliasi).
- Status nunggak otomatis (lewat due_date belum bayar → overdue) + daftar nunggak.
- Riwayat + sisa utang (admin), notifikasi otomatis, dashboard + laporan.
- Denda: kolom disiapkan (`late_fee`), nilai 0 sampai klien menentukan.

### Out-of-scope (pasca-MVP)
- Payment gateway / VA / transfer (tunai adalah jalurnya).
- E-KYC otomatis, credit scoring formal, SLIK.
- FCM push terjadwal (notifikasi in-app dulu).
- Pengajuan mandiri penuh oleh nasabah (tahap 2 — sekarang admin yang mendaftarkan).
- Multi-cabang, audit log UI, izin OJK.

## 5. Persona

| Persona | Kebutuhan |
|---|---|
| **Nasabah (Bu Ani)** — pedagang pasar, HP Android entry-level | Tahu sisa utang & kapan bayar berikutnya; riwayat bayar tercatat; didaftarkan admin |
| **Owner (Pak Haji)** — pantau dari kantor via browser | Setoran per hari, siapa nunggak, sisa piutang total, laba periode, approve pinjaman & kelola nasabah |

## 6. Asumsi & Ketergantungan

1. Supabase project (region Singapore) sudah dibuat; `schema.sql` sudah dijalankan sekali.
2. Bucket Storage `kyc-documents` PRIVATE sudah dibuat + 2 policy (insert/select) sesuai README.
3. Minimal 1 akun dipromote `role='admin'` via SQL.
4. Kredensial: admin pakai `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
5. Tanpa Supabase terisi, admin web tetap build & jalan dengan banner "belum dikonfigurasi" (mode degradasi).

## 7. Arsitektur

```
Admin Web (Vite) ──→ Supabase Cloud ─ Postgres (+RLS/RPC) ─ Auth ─ Storage ─ Realtime
```

- Tidak ada backend custom. Semua logika sensitif (approve, generate jadwal, guard bunga/status/role) di **Postgres function security definer**.
- Mobile & admin bicara langsung ke Supabase SDK (supabase_flutter / supabase-js).
- Bucket KYC private; baca hanya via signed URL 10 menit.

## 8. Model Data (kontrak — lihat supabase/schema.sql)

- **profiles**(id→auth.users, role **admin|nasabah**, field KTP full + phone + kyc_status; **M14: `foto_path`** → foto nasabah; M9: `current_address`, `office_address`, `home_lat/lng`, `office_lat/lng`)
- **emergency_contacts**(tetap ✅)
- **kyc_documents**(tetap ✅ — M14: `storage_path` diubah jadi text agar bisa simpan URL Cloudinary)
- **nasabah_documents**(BARU M14): foto nasabah / foto KTP / foto jaminan (user_id, doc_type, url, created_at) — jaminan didaftarkan sebelum pinjaman ada, jadi tidak bisa ikut `loan_documents` yang terikat `loan_id`
- **loans**(+ `frequency` **weekly|monthly**, + `interest_rate` default **20.00**, + `late_fee` default 0, + `dicatat_oleh`; M9: `requested_amount`, `collateral_type`, `collateral_detail`; tenor = jumlah periode sesuai frekuensi; **M17: CHECK amount 50.000–20.000.000**)
- **installments**(+ `dicatat_oleh` → profiles, + `paid_at`, + `amount_paid` untuk cicilan parsial)
- **payments**(BARU): setiap setoran tunai (id, loan_id, installment_id, nasabah, `dicatat_oleh`, amount, paid_at, note) — buku kas digital; + `void_of`, `void_reason`, `voided_at` (M-void: jejak koreksi)
- **loan_documents**(BARU M9): dokumen pinjaman + RLS
- **notifications**(tetap ✅ + tipe baru: tagihan & janji bayar)
- **M21 (5 Nov 2026):** `collection_routes` & `calon_nasabah` **dibuang dari DB**; kolom `petugas_id` / `collected_by` / `paid_by` / `wilayah` **dihapus** (nilai historis disalin ke `dicatat_oleh`); enum `user_role` → `('admin','nasabah')`; fungsi `is_petugas()` dibuang; semua RLS write → `is_admin()`.
- **M26 (5 Nov 2026) — Laporan Bulanan + ekspor PDF/CSV:** permintaan klien "fungsi laporan bulanan bentuk pdf / csv bisa ga? dalam laporan nya yang menarik tapi jangan cuma kyc table list aja". RPC **`laporan_bulanan(p_bulan, p_tahun)`** mengembalikan 8 seksi dalam satu call: `periode`, `ringkasan` (pencairan, pinjaman_baru, nasabah_baru, jatuh_tempo, terkumpul, koreksi, terkumpul_bersih, laba_bunga, sisa_piutang, total_modal, pinjaman_berjalan, nasabah_aktif), `tren` (6 bulan), `status` (sebaran keandalan), `top_nasabah` (5 piutang terbesar), `arus_kas`, `metode`, `kinerja`. Halaman **Laporan ditulis ulang**: pemilih bulan/tahun, bar kolektibilitas, donat status keandalan, bar chart tren 6 bulan, bar-list 5 piutang terbesar, metode pembayaran, kinerja pencatat, dan blok "Perlu Tindakan" (nunggak). **Ekspor PDF** = `window.print()` + `@media print` (kop laporan khusus cetak, `.no-print` buang kontrol, `.print-block` `break-inside: avoid`, `@page` A4) — teks tetap bisa di-select, tanpa dependency. **Ekspor CSV** = Blob + BOM UTF-8 (Excel Windows aman), 3 berkas: `laporan_<th>-<bl>_ringkasan.csv`, `_tren.csv`, `_top_nasabah.csv`. **Backfill `cash_transactions`** (migrasi `20261105180000_backfill_kas.sql`) karena cleanup M23 menghapus baris kas tapi tidak mengembalikan `installments.amount_paid`/`payments` — tanpa itu laporan nunjukin Rp 0. **Koreksi M26c:** `pencairan` ikut menghitung pinjaman `rejected` (3.750.000 padahal tidak cair) → ditambah `and l.status <> 'rejected'`; `terkumpul` bruto memasukkan pembayaran yang di-void → ditambah field `koreksi` & `terkumpul_bersih` (= terkumpul - koreksi), kolektibilitas pakai yang bersih. Migrasi: `20261105170000_laporan_bulanan.sql`, `20261105180000_backfill_kas.sql`, `20261105200000_laporan_bulanan_v3.sql`.
- **M25 (5 Nov 2026) — nominal pinjaman di kartu Nasabah:**
 `list_nasabah()` menambah `total_dipinjam` (modal yang keluar), `total_tagihan` (pokok + bunga flat), `total_sisa` (belum tertagih), `total_dibayar` (sudah masuk), dan `pinjaman_detail[]` (per pinjaman: pokok, tagihan, sisa, dibayar, frekuensi, tenor, tanggal, status, tipe + detail agunan). Field `jaminan[]` M24 **dibuang** — agunannya sekarang nempel di tiap entri `pinjaman_detail`, jadi frontend tidak perlu dua array paralel. Kartu Nasabah dapat blok **"Pinjaman ke Owner"** (nominal besar + 3 metrik Tagihan/Sisa/Dibayar) dan blok **"Rincian Pinjaman & Agunan"** (per pinjaman: nominal, frekuensi × tenor, sisa, lunas, agunan). Nominal diformat ringkas (`Rp 1,5 jt`, `Rp 120 rb`) karena kartu sempit. Sisa dihitung dari **total cicilan** (bukan pokok) supaya bunga ikut terlihat. **Bug data ketemu:** 1 pinjaman orphan (`1830fa89`, 1jt, dibuat 2 Nov saat testing M23) **tanpa cicilan sama sekali** → tagihan Rp 0 di kartu. Dihapus manual. Migrasi `20261105160000_nominal_pinjaman_nasabah.sql`.
- **M24 (5 Nov 2026) — kartu Nasabah & Jaminan:** `list_nasabah()` diperkaya (kolom `status_keandalan`, `alamat_rumah`/`home_lat`/`home_lng`, `alamat_kantor`/`office_lat`/`office_lng`, `pinjaman_aktif`, `jaminan[]` jsonb dari pinjaman berjalan) — migrasi `20261105150000_kartu_nasabah.sql`. Menu **Nasabah diubah dari tabel ke grid kartu** mengikuti mockup acuan: foto/inisial, NIK mono, badge status keandalan + jumlah pinjaman aktif + badge telat, alamat rumah & kantor dengan link "Lihat di Maps" (kalau shareloc ada), daftar agunan/jaminan yang ditahan, footer aksi Detail & Riwayat / WA / Hapus. Search, paginasi, realtime, dan hapus via ConfirmDialog dipertahankan.
- **M23 (5 Nov 2026) — model SWFinance:** tabel **`cash_transactions`** ditambah (buku mutasi kas masuk/keluar: tipe, kategori, loan_id/nasabah_id opsional, pihak, metode, nominal, catatan, `dicatat_oleh`); kolom **`profiles.status_keandalan`** (`LANCAR|PERINGATAN|MACET`) + fungsi `hitung_status_keandalan()` + trigger auto-refresh saat cicilan berubah; enum `loan_status` disederhanakan jadi `('disbursed','active','completed','rejected')` — **alur approval dihapus** (`submitted`/`under_review`/`approved` tidak ada lagi, fungsi `approve_loan`/`reject_loan` dibuang); `admin_create_loan` langsung insert `disbursed` + generate cicilan + catat kas keluar; `record_cash_payment` & `void_payment` ikut menulis ke `cash_transactions`; RPC baru `kas_harian(page,pageSize,dari,sampai)`.
- RPC: `approve_loan` (generate jadwal **per frekuensi**, override nominal final), `reject_loan`, **`record_cash_payment`** (tunai, parsial, auto-apply kelebihan), **`void_payment`** / **`void_and_repay`** (koreksi beraudit), helper `is_admin()`, trigger + guard frekuensi/bunga/tenor.
- **RPC skala besar (M20):** `laporan_ringkasan()`, `list_nasabah(page,pageSize,search,role,kyc)`, `setoran_harian(page,pageSize,dari,sampai)` — agregasi & paginasi di Postgres, bukan di browser. (M22: ikut menyesuaikan `petugas_id` → `dicatat_oleh`.)
- **Index (M20):** loans(created_at desc), loans(status, created_at desc), installments(due_date,status), installments(status,due_date), payments(paid_at desc), payments(void_of), profiles(created_at desc), profiles(role), profiles(kyc_status), notifications(created_at desc), kyc_documents(created_at desc), loan_documents(created_at desc).

## 9. Kebutuhan Fungsional — Mobile (FR-M)

**DIHAPUS (M21, 5 Nov 2026).** Mobile app Flutter dihapus sepenuhnya — aplikasi hanya dipakai admin/owner dari web.
Semua kebutuhan fungsional mobile (FR-M1..FR-M12) dan petugas lapangan (FR-P1..FR-P6) tidak lagi berlaku.
Pendaftaran nasabah, KYC, pengajuan pinjaman, pencatatan bayar tunai, dan rekonsiliasi setoran kini semuanya dilakukan dari **Admin Web** (§10).

## 10. Kebutuhan Fungsional — Admin Web (FR-A)

| ID | Fitur | Detail |
|---|---|---|
| FR-A1 | Login + gate owner | signIn; cek role admin; non-owner → signOut + "Akses ditolak" |
| FR-A2 | Dashboard | Kartu: total nasabah, KYC pending, pinjaman berjalan, outstanding; **setoran hari ini**; bar 6 bulan; pie status; pinjaman terbaru; daftar nunggak |
| FR-A3 | Daftar pinjaman | Tabel + join nasabah; filter status + **frekuensi**; cari nama/telepon; realtime |
| FR-A4 | Detail pinjaman | Data loan + nasabah + jadwal; approve (RPC), reject (RPC + alasan wajib) |
| FR-A5 | Verifikasi KYC | Antrean pending + dokumen via signed URL + **data KTP full + 3 nomor + 2 kontak darurat** ✅ SUDAH JADI; tombol Verifikasi/Tolak |
| FR-A6 | Kelola nasabah | Tabel semua profile (cari, badge KYC & role); detail + riwayat loan; **tambah akun nasabah** (email dummy otomatis); **hapus nasabah** (M15) |
| FR-A6b | Rekonsiliasi setoran | Setoran harian per admin (total tunai vs tercatat) + tombol terima; **koreksi salah input** via reversal beraudit (M-void/M-void2) |
| FR-A6c | Laporan | Sisa piutang per nasabah, laba periode (total bunga), nunggak — **agregasi di server** (RPC `laporan_ringkasan`, M20) |
| FR-A6d | Daftar nasabah ber-paginasi | 50 baris/halaman + search nama/telepon/NIK + badge telat dari server (RPC `list_nasabah`, M20) |
| FR-A7 | Realtime | Subscribe loans/profiles/kyc_documents/**payments** → auto-reload |
| FR-A8 | Mode belum-konfigurasi | Banner kuning; error login ditangani, tidak crash |
| FR-A9 | Dialog konfirmasi custom | **Nol dialog bawaan browser** (`window.confirm/prompt/alert`) — semua konfirmasi pakai modal React (M16) |
| FR-A10 | Foto & lokasi nasabah | Foto nasabah / foto KTP / foto jaminan + koordinat rumah & kantor (link Google Maps) di detail nasabah (M14) |

Layout: sidebar (Dashboard, Pinjaman, Verifikasi KYC, Users, Setoran, Laporan). Bahasa Indonesia, badge warna per status.

## 11. Kebutuhan Backend (FR-B)

V1.0 (live): FR-B1 ✅ FR-B2 ✅ FR-B3 ✅ FR-B3b ✅ FR-B4 ✅(jadwal bulanan) FR-B5 ✅ FR-B6 ✅.
V2.0 (live): FR-B1b ✅ FR-B4b ✅ FR-B6b ✅ FR-B7 ✅.
V3.0–v3.1 (live): nominal final admin (`approve_loan(p_amount_override)`), `admin_create_loan`, `nasabah_telat_flag`, guard tenor monthly 1|3 / weekly 1-52, `void_payment` + `void_and_repay` (koreksi beraudit), auto-apply kelebihan bayar, `delete-nasabah` (edge function, cascade + guard), cek NIK sebelum `createUser`, foto/lokasi/dokumen nasabah, **agregasi & paginasi server** (`laporan_ringkasan`, `list_nasabah`, `setoran_harian`), **12 index skala besar**, **CHECK amount 50.000–20.000.000**.
**M21–M22 (live):** enum `user_role` → `('admin','nasabah')`; `is_petugas()` dibuang; tabel `collection_routes` & `calon_nasabah` dibuang; kolom `petugas_id`/`collected_by`/`paid_by`/`wilayah` dihapus (historis → `dicatat_oleh`); RLS write → `is_admin()`; RPC M20 ikut menyesuaikan.

| ID | Aturan | Status |
|---|---|---|
| FR-B1b | RLS **satu peran**: pemilik data = miliknya; semua tulis lewat `is_admin()` | ✅ |
| FR-B4b | approve_loan: generate jadwal **per frequency**; bunga default **20.00**; guard frequency weekly\|monthly | ✅ |
| FR-B6b | `record_cash_payment`: cek admin → catat payments → update installment (penuh/parsial) + `dicatat_oleh` → notif; semua paid → completed | ✅ |
| FR-B7 | Role enum admin + nasabah; `handle_new_user` default nasabah; pembuatan admin hanya via owner | ✅ |
| FR-B8 | `void_payment` / `void_and_repay`: koreksi salah input dengan reversal beraudit (alasan wajib, baris lawan negatif, link `void_of`) | ✅ |
| FR-B9 | `delete-nasabah`: hapus akun + cascade; tolak hapus akun sendiri & tolak jika masih ada pinjaman berjalan | ✅ |
| FR-B10 | Cek duplikat NIK sebelum `auth.admin.createUser` → 409 `nik_exists` + auto-recover akun yatim | ✅ |
| FR-B11 | Agregasi & paginasi di Postgres (`laporan_ringkasan`, `list_nasabah`, `setoran_harian`) + index pendukung | ✅ |
| FR-B12 | Hapus jejak petugas: enum, fungsi, tabel, kolom, policy, RPC (M21–M22) | ✅ |
| FR-B13 | Arus Kas: tabel `cash_transactions` + RPC `kas_harian()`; pencairan/pembayaran/koreksi tercatat otomatis (M23) | ✅ |
| FR-B14 | Pinjaman langsung cair tanpa tahap approval; `admin_create_loan` = disbursed + cicilan + kas keluar (M23) | ✅ |
| FR-B15 | Status keandalan nasabah 3 level, dihitung otomatis dari riwayat cicilan (M23) | ✅ |
| FR-B16 | Menu Nasabah tampil sebagai kartu: foto, NIK, WA, alamat rumah/kantor + link Maps, agunan ditahan, jumlah pinjaman aktif, badge status keandalan (M24) | ✅ |
| FR-B17 | Kartu Nasabah menampilkan nominal: total dipinjam, tagihan, sisa, dibayar + rincian per pinjaman dengan agunannya (M25) | ✅ |
| FR-B18 | Laporan bulanan lengkap (ringkasan, tren, status keandalan, top nasabah, arus kas, metode, kinerja) + ekspor PDF & CSV (M26) | ✅ |

## 12. Alur Bisnis Utama (Bank Keliling)

```
Admin daftar nasabah (KTP + foto + lokasi rumah/kantor + kontak darurat)
  → admin verifikasi KYC
  → admin buat pinjaman (plafon, frekuensi mingguan/bulanan, tenor periode)
  → LANGSUNG CAIR: jadwal cicilan auto-jadi per frekuensi + kas keluar tercatat (M23)
  → admin catat bayar tunai per kunjungan → payment + kas masuk tercatat
  → nunggak? status overdue otomatis tiap 00:00 WIB + notifikasi
  → semua lunas → completed
  (salah input → void/reversal beraudit, kas ikut terkoreksi)

Arus Kas (M23): pencairan & pembayaran nasabah tercatat OTOMATIS oleh sistem;
admin mencatat manual suntikan modal owner, biaya operasional, penarikan profit.

Status keandalan nasabah (M23): LANCAR | PERINGATAN | MACET — dihitung otomatis
dari riwayat cicilan, tampil sebagai badge di Dashboard & daftar nasabah.
```

## 13. Aturan Bisnis & Perhitungan (v3.0 — bunga 20%)

- Bunga flat **20%/periode**: `total = amount + amount*20%`; `cicilan = ceil(total/tenor)`.
  Contoh: pinjam 1jt, 10 minggu → total 1.200.000 → 120.000/minggu.
- Batas: amount **50.000–20.000.000** (CHECK, revisi M17 5 Nov 2026 — sebelumnya 500.000), tenor = jumlah periode 1–52 (mingguan) / 1–3 (bulanan, revisi M9).
- Frekuensi: `weekly` (due = approve + 7×i hari) | `monthly` (due = approve + i bulan).
- Denda: kolom `late_fee` ada, nilai **0** sampai klien menentukan.
- Status final: `completed` otomatis saat semua paid; `rejected` butuh alasan wajib.
- Notifikasi hanya ditulis server via RPC.

## 14. Non-Fungsional

- Admin: browser modern, build statis < 1 MB gzip JS (di luar recharts), PWA tidak required.
- **Skala besar (M20):** daftar nasabah, setoran, dan laporan ber-paginasi + agregasi di Postgres, sehingga tetap responsif pada ribuan nasabah / puluhan ribu cicilan tanpa refactor. Index sudah disiapkan untuk pola query sort/filter/join yang dipakai UI.
- **Zona waktu:** semua perhitungan tanggal (overdue, setoran harian, jatuh tempo) memakai `Asia/Jakarta`. Agregasi setoran sebelumnya memakai UTC — sudah dibetulkan di M20.
- **Dialog:** nol dialog bawaan browser (`window.confirm/prompt/alert`) di admin web; semua konfirmasi pakai modal React.
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
| Uang tunai selisih / catatan fiktif | Rekap harian + rekonsiliasi owner; payments tercatat per transaksi + `dicatat_oleh` |
| HP admin hilang/rusak | Data di cloud; login ulang dari browser pengganti |
| Nasabah gaptek (tidak install app) | Tidak perlu app — admin mendaftarkan & mengoperasikan atas nama nasabah |
| Angka bunga belum fix | 20% per 3 Nov 2026; ganti via 1 migration + 1 konstanta |
| Ketergantungan Supabase cloud | Skema SQL standar Postgres → bisa migrasi self-host kapan pun |
| Nasabah numpuk → aplikasi lambat | Sudah dicegah di M20: paginasi + agregasi server + 12 index. Sisa: Dashboard masih menarik semua loans/profiles/payments (butuh angka agregat) — kalau lambat, bikin RPC `dashboard_ringkasan()` dengan pola yang sama |
| Email dummy nabrak saat NIK dobel | Dicegah di FR-B10: cek `profiles.nik` sebelum `createUser` → 409 + auto-recover akun yatim |
| Hapus nasabah salah klik / hapus yang masih berutang | Modal konfirmasi custom (M16) + 2 guard di `delete-nasabah` (FR-B9) |
| Setoran malam kecatat hari berikutnya | Dibetulkan di M20: agregasi pakai `Asia/Jakarta`, bukan UTC |
| Sisa kode/kolom petugas bikin error | Dibersihkan total di M21–M22: enum, fungsi, tabel, kolom, policy, dan RPC ikut menyesuaikan |

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
- [x] **9336fb7 Fix create-nasabah (5 Nov 2026)** — error "A user with this email address has already been registered": akar masalah `auth.admin.createUser()` tidak cek duplikat, email dummy `nNIK@danaku.test` nabrak saat NIK sudah pernah didaftarkan atau percobaan gagal di tengah (akun auth kebuat tapi profil gagal). Fix: edge function cek `profiles.nik` DULU → 409 `nik_exists` dengan nama pemilik NIK + auto-recover akun yatim (`recovered: true`); frontend kirim `nik`, tampilkan pesan jelas + link "Cari di daftar Users". Deploy + uji live: NIK Budi → 409, NIK baru → 200, retry → 200 recovered, tanpa token → 401.
- [x] **M14 Foto & lokasi nasabah (5 Nov 2026)** — revisi klien: nasabah tidak perlu email (email dummy `nNIK@danaku.test` dibuat otomatis & **disembunyikan dari UI**), foto nasabah/KTP/jaminan + koordinat shareloc harus tersimpan & tampil di detail. Migrasi `20261105090000_nasabah_dokumen.sql`: tabel **nasabah_documents**, `profiles.foto_path`, `kyc_documents.storage_path` → text (simpan URL Cloudinary). `supabase db push` awalnya gagal (migration history remote tak cocok) → `migration repair --status reverted` 39 ID → sukses. Frontend: NasabahBaru simpan foto ke Cloudinary + URL ke DB; UserDetail grid Foto Nasabah / Foto KTP / Jaminan + section Detail Jaminan + koordinat `home_lat/lng` & `office_lat/lng` dengan link Google Maps; Users hapus kolom Email (ganti Telepon). **Bug ketemu & fix:** foto KTP tidak tampil karena frontend simpan ke `kyc_documents` tapi detail baca `nasabah_documents` → KTP kini disimpan ke KEDUA tabel. Uji live e2e: 3 foto HTTP 200 image/png, render di browser ✅.
- [x] **M15 Hapus Calon Nasabah + fitur hapus nasabah (5 Nov 2026)** — revisi klien. Hapus nav `/calon` (Layout), route + import (App), file `CalonNasabah.tsx`, fungsi calon dari api.ts, action `convert-calon` dari edge function. **Tabel `calon_nasabah` dibiarkan di DB** (data historis aman). Tambah action **`delete-nasabah`**: `auth.admin.deleteUser` + `ON DELETE CASCADE`, dengan 2 guard — (a) tidak bisa hapus akun sendiri (cegah admin terkunci), (b) tolak 409 jika masih ada pinjaman `active|disbursed|under_review|submitted` (histori utang tidak boleh hilang). UI Users: kolom Aksi + tombol Hapus per baris. Uji live: convert-calon → 400, delete tanpa user_id → 400, hapus diri sendiri → 400, hapus nasabah tanpa pinjaman → 200 cascade bersih, hapus Budi (ada pinjaman) → 409, `/calon` redirect dashboard ✅.
- [x] **M16 Modal konfirmasi custom (5 Nov 2026)** — revisi klien: "buat apapun yang meminta konfirmasi di dalem aplikasi, dibuatin aja pop up box yang bukan bawaan dari browser". Komponen baru `admin/src/components/ConfirmDialog.tsx` (`ConfirmProvider` + `useConfirm`), API promise-based (`await confirm({...})`) supaya pemanggil tidak perlu refactor jadi state-driven. Fitur: tone `danger` (merah) / `primary` (hijau), Escape = batal, klik backdrop = batal, fokus otomatis ke tombol Batal (Enter tidak langsung eksekusi aksi merusak), opsi `requireText` untuk konfirmasi ketik-teks. Provider di-mount sekali di `App.tsx`. Scan seluruh `admin/src`: hanya 1 tempat pakai `window.confirm` (`Users.tsx`) → diganti. Mobile Flutter sudah pakai `AlertDialog` native (tidak diubah). Uji live: `window.confirm` calls = **0**, modal muncul dengan judul/pesan/tombol benar, Batal/Escape/backdrop semua nutup tanpa menghapus, konfirmasi benar-benar menghapus baris ✅.
- [x] **M17 Minimum pinjaman Rp50.000 (5 Nov 2026)** — revisi klien: "untuk minimum peminjaman nya itu paling kecil 50 ribu rupiah". Migrasi `20261105100000_min_pinjaman_50rb.sql`: `loans_amount_check` → `between 50000 and 20000000`; `approve_loan()` & `admin_create_loan()` validasi 50000..20000000. Body fungsi di-copy **verbatim** dari schema.sql (hanya angka batas bawah + pesan error yang berubah) supaya perilaku lain tidak berubah. schema.sql 3 tempat; admin `LoanNew.tsx` (validasi + min/step + hint) & `LoanDetail.tsx` (validasi nominal final); mobile `_minAmount = 50000` + quick chips tambah 50rb/100rb/500rb. Uji live RPC: 49.999 → 400, 50.000 → 200 disbursed (cicilan 15.000 ×4), 20.000.000 → 200, 20.000.001 → 400 ✅.
- [x] **M18 Teks limit pinjaman mobile yang kelewat (5 Nov 2026)** — saat verifikasi M17 ditemukan 2 teks marketing masih nulis Rp500.000: `login_screen.dart` ("Rp500.000 - Rp20.000.000") & `home_screen.dart` ("mulai Rp500 ribu"). Keduanya teks info, bukan validasi, tapi membingungkan user. Diperbaiki → Rp50.000. Verifikasi: `dart analyze lib/` bersih (4 info deprecation pre-existing di `kyc_screen.dart`), `flutter build apk --debug` sukses, dan string dicek **di dalam APK** — teks baru ADA, teks lama HILANG ✅.
- [x] **M19 Hilangkan N+1 query (5 Nov 2026)** — keluhan klien: menu Laporan lambat. Diagnosis terukur di browser: **36 request REST** per buka halaman, 30 di antaranya `installments` — cicilan di-fetch satu-per-satu per pinjaman dengan `await` di dalam `for` loop (berurutan, bukan paralel). Fix: `fetchInstallmentsForLoans(loanIds)` — satu query `in.(...)` lalu di-group jadi `Map<loanId, Installment[]>`, chunk 200 ID. Diterapkan di 3 halaman dengan pola sama: **Laporan** (36→6 request), **Dashboard** (nunggak per pinjaman), **UserDetail** (`Promise.all` per pinjaman). Angka laporan diverifikasi ulang independen dan **identik** (56.130.000 / 12.669.583 / 43.460.417 / 8.280.000 / 1 nunggak); jumlah cicilan via batch = 67 = via N+1 ✅.
- [x] **M20 Fondasi skala besar (5 Nov 2026)** — revisi klien: "jangan lihat kondisi sekarang tapi harus udah di siapin untuk nasabah yang banyak biar ke depan nya ga banyak yang di upgrade". Audit menemukan 5 masalah: index kurang, Laporan hitung di browser, Users tanpa paginasi, badge telat N+1, Setoran narik 2000 payment. Migrasi `20261105110000_skala_besar.sql`: **12 index baru** + **3 RPC** (`laporan_ringkasan()`, `list_nasabah(page,pageSize,search,role,kyc)`, `setoran_harian(page,pageSize,dari,sampai)`) — agregasi & paginasi pindah ke Postgres. Frontend: Laporan pakai RPC; Users paginasi 50/halaman + search ter-debounce (nama/email/telepon/NIK) + badge telat dari server; Setoran agregasi server + rincian transaksi **on-demand** saat baris di-expand. **Bug timezone ikut dibetulkan:** agregasi setoran lama memakai `paid_at.slice(0,10)` = tanggal **UTC**, sehingga setoran malam hari (≥ 17:00 UTC) tercatat di hari berikutnya di WIB — sekarang dikonversi ke `Asia/Jakarta`. Verifikasi: angka Laporan identik, Users 11 user + search "budi" → 2 hasil, Setoran 5 grup + expand jalan, RPC tanpa login → 401, request per halaman Laporan 6→4 ✅.

- [x] **M21 Hapus 3 peran + hapus mobile app (5 Nov 2026)** — revisi klien (verbatim): "3 peran itu hilang karena yang menggunakan aplikasi nya cuma admin/owner aja." Klien konfirmasi: hapus semua jejak petugas/nasabah dari mobile/DB/admin web + **hapus mobile app sepenuhnya**. Migrasi `20261105120000_hapus_peran_petugas.sql`: enum `user_role` → `('admin','nasabah')` (nasabah = penanda pemilik data, bukan pengguna login); drop tabel `collection_routes` & `calon_nasabah`; drop fungsi `is_petugas()`; kolom `payments.petugas_id` / `loans.collected_by` / `installments.paid_by` → **`dicatat_oleh`** (nilai historis disalin dulu, 43 payments utuh); drop `profiles.petugas_id` & `profiles.wilayah`; RLS disederhanakan ke `is_admin()` untuk semua tulis; `record_cash_payment` / `void_payment` / `void_and_repay` body di-copy verbatim dari schema.sql (hanya cek peran + nama kolom yang berubah). Mobile app Flutter **dihapus total dari repo** (`git rm -r mobile`, 7.063 file / 3.9GB). Frontend admin: `api.ts` (Payment.petugas_id → dicatat_oleh, join `payments_dicatat_oleh_fkey`, SetoranHarianRow pencatatId/pencatatNama), Dashboard (buang kartu petugas), Setoran (petugasId → pencatatId, judul "Setoran Harian"), UserDetail (hapus baris Role, rename EmergencyContacts). schema.sql disinkronkan penuh (683 baris). Uji live: role DB = 1 admin + 10 nasabah; 5 kolom petugas HILANG; 3 kolom `dicatat_oleh` ADA; 2 tabel HILANG; 43 payments + 18 loans + 67 installments utuh; `record_cash_payment` → 204 + `dicatat_oleh` = Administrator; `void_payment` → 204; `convert-calon` → 400; `setoran_harian` & `list_nasabah` jalan; tanpa token ditolak.
- [x] **M22 RPC M20 ikut menyesuaikan (5 Nov 2026)** — setelah M21, `list_nasabah()` & `setoran_harian()` error `column pg.petugas_id does not exist` / `column pm.petugas_id does not exist` (RPC M20 masih merujuk kolom yang sudah dibuang). Migrasi `20261105130000_rpc_dicatat_oleh.sql`: `list_nasabah` buang `pg.petugas_id` dari output; `setoran_harian` ganti `pm.petugas_id` → `pm.dicatat_oleh` dan output `petugasId/petugasNama` → `pencatatId/pencatatNama`. Uji live: setoran 2026-11-05 Administrator 15.000 (3x), list_nasabah total=11 ✅.

- [x] **M23 Model SWFinance + Arus Kas + redesign UI (5 Nov 2026)** — keputusan klien (5 poin): (1) **alur approval dihapus** — pinjaman langsung cair; (2) **cicilan bertahap dipertahankan** (parsial, 1–52 minggu / 1–3 bulanan, mockup hanya dipakai sebagai acuan tampilan); (3) **Arus Kas ditambah**; (4) min pinjaman tetap Rp50.000 (M17); (5) semua sekaligus. Migrasi `20261105140000_model_danamodal.sql`: tabel `cash_transactions` (kas masuk/keluar + RLS `is_admin()`), enum `status_keandalan` + kolom `profiles.status_keandalan` + `hitung_status_keandalan()` + 2 trigger auto-refresh, enum `loan_status` → `('disbursed','active','completed','rejected')` (status historis approval → disbursed), `approve_loan`/`reject_loan` dibuang, `admin_create_loan` ditulis ulang (langsung disbursed + generate cicilan + catat kas keluar), `record_cash_payment`/`void_payment` ikut menulis kas, RPC `kas_harian()`. **Urutan migrasi kritis:** policy `own loans ins` (yang mengunci `status='submitted'`) harus di-drop SEBELUM enum di-drop, kalau tidak Postgres menolak karena dependency. **Redesign UI sesuai mockup acuan** `danamodal_aplikasi_manajemen_peminjaman_dana_modal.html`: design system emerald + Plus Jakarta Sans + dark navbar (`@theme` di index.css), Layout sidebar → top navbar + tab, Login gaya mockup (badge "Akses Terbatas Khusus Admin & Owner"), Dashboard baru (4 metrik eksekutif + 2 tabel urgent: Mendekati Jatuh Tempo H-3 dengan aksi WA & Rute Maps, Telat Bayar dengan aksi Rumah/Kantor), halaman baru **Arus Kas** (ringkasan masuk/keluar/net, filter tanggal, pemilih tanggal, detail transaksi, modal catat kas manual), semua halaman di-restyle ke tema SWFinance (143 substitusi kelas). **Bug ketemu & fix:** email dummy `nNIK@danaku.test` masih bocor di Loans/LoanDetail/LoanNew (pelanggaran M14) → diganti NIK + telepon, `fetchLoans` select `nik` bukan `email`. Uji live: buat pinjaman 1jt/4 minggu → 200 + 4 cicilan 300rb + status disbursed + kas keluar 1jt; batas nominal 49.999→400 / 50.000→200 / 20jt→200 / 20jt+1→400; tenor monthly 2 → 400; bayar 250rb → 204 + kas masuk 250rb; void → 204 + kas keluar koreksi 250rb; `kas_harian` agregasi benar; `approve_loan` → 404 (fungsi dibuang); `list_nasabah`/`setoran_harian`/`laporan_ringkasan` tetap jalan; status keandalan terisi (1 MACET, 1 PERINGATAN, 9 LANCAR); build + TSC lolos; browser verify semua halaman.

- [x] **M24 Kartu Nasabah & Jaminan (5 Nov 2026)** — permintaan klien: "untuk tampilan di menu nasabah, bisa ga lo ikutin tampilan nasabahnya kyk file yang tadi gw attach di menu nasabah & jaminan, karena informasi yang di dapet lebih bagus". Tabel lama cuma 7 kolom (Nama/Telepon/Role/KYC/Telat/Terdaftar/Aksi) — informasi yang dibutuhkan kolektor lapangan (alamat, shareloc, agunan) tidak terlihat sama sekali. Migrasi `20261105150000_kartu_nasabah.sql`: `list_nasabah()` sekarang juga mengembalikan `status_keandalan`, `alamat_rumah` + `home_lat`/`home_lng`, `alamat_kantor` + `office_lat`/`office_lng`, `pinjaman_aktif` (count loan disbursed/active), dan `jaminan` (jsonb array tipe+detail+status dari pinjaman berjalan). CTE `aktif` mengagregasi sekali per halaman, bukan per baris. `Users.tsx` ditulis ulang jadi grid kartu (PAGE_SIZE 50→12 biar kartu tidak terlalu padat): avatar foto atau fallback inisial gradient emerald, NIK mono, badge status keandalan (Lancar/Perhatian/Macet), badge "N Pinjaman Aktif", badge Telat Bayar, blok Alamat Rumah & Alamat Kantor dengan link "📍 Lihat di Maps" (hanya muncul kalau shareloc terisi), blok "Agunan / Jaminan Ditahan" (list, atau "Tidak ada agunan"), footer aksi Detail & Riwayat / WA / Hapus. Search (nama/telepon/NIK), paginasi, realtime subscribe, dan hapus via ConfirmDialog dipertahankan. Legenda status keandalan ditambah di bawah grid. **Catatan data:** `foto_path` kosong untuk semua nasabah existing (foto hanya terisi saat registrasi baru via Cloudinary), dan shareloc hanya ada untuk nasabah yang registrasi setelah fitur shareloc ada — jadi link Maps & foto tampil bertahap sesuai data masuk.

- [x] **M25 Nominal pinjaman di kartu Nasabah (5 Nov 2026)** — permintaan klien: "bisa tambahin informasi ga? 'si nasabah ini lagi punya berapa pinjaman ke owner'". Kartu M24 cuma menampilkan jumlah ("2 Pinjaman Aktif") tanpa nominal — owner tidak bisa melihat berapa uang yang sedang keluar. Migrasi `20261105160000_nominal_pinjaman_nasabah.sql`: `list_nasabah()` menambah `total_dipinjam`, `total_tagihan`, `total_sisa`, `total_dibayar`, dan `pinjaman_detail[]` (pokok/tagihan/sisa/dibayar/frekuensi/tenor/tanggal/status/tipe/detail per pinjaman). Field `jaminan[]` M24 **dibuang** — agunan nempel di tiap entri `pinjaman_detail`, menghindari dua array paralel yang bisa desinkron. Sisa dihitung dari **total cicilan** (`sum(installments.amount) - sum(amount_paid)`), bukan dari pokok, supaya bunga flat ikut terlihat. Kartu dapat blok "Pinjaman ke Owner" (nominal besar di header dark + 3 metrik Tagihan/Sisa/Dibayar) dan blok "Rincian Pinjaman & Agunan" (per pinjaman: nominal, frekuensi × tenor, sisa merah/hijau, lunas, agunan dengan ikon 🔒). Nominal diformat ringkas (`Rp 1,5 jt`, `Rp 120 rb`) karena kartu sempit. **Bug data ketemu & dibersihkan:** 1 pinjaman orphan (`1830fa89`, 1jt weekly/10, dibuat 2 Nov saat testing M23) tanpa cicilan sama sekali → tagihan Rp 0 di kartu; dihapus manual setelah dipastikan tidak ada payments/cash_transactions terkait. Cross-check agregasi RPC vs hitung langsung dari tabel loans+installments: dipinjam 38.850.000 = OK, sisa 41.977.086 = OK, dibayar 2.952.917 = OK.

- [x] **M26 Laporan Bulanan + ekspor PDF/CSV (5 Nov 2026)** — permintaan klien: "fungsi laporan bulanan bentuk pdf / csv bisa ga? dalam laporan nya yang menarik tapi jangan cuma kyc table list aja". Halaman Laporan lama cuma 4 kartu angka + 2 tabel daftar — tidak ada gambaran bulanan sama sekali. Migrasi `20261105170000_laporan_bulanan.sql` + `20261105200000_laporan_bulanan_v3.sql`: RPC **`laporan_bulanan(p_bulan, p_tahun)`** (security definer, guard `is_admin()`) mengembalikan 8 seksi dalam satu call — `periode`, `ringkasan` (12 metrik), `tren` (6 bulan), `status` (sebaran keandalan), `top_nasabah` (5 piutang terbesar), `arus_kas`, `metode`, `kinerja`. Semua agregasi di Postgres; batas periode pakai WIB (`Asia/Jakarta`) supaya bulannya sesuai kalender lokal, bukan UTC. `Laporan.tsx` ditulis ulang: pemilih bulan/tahun, bar kolektibilitas berwarna (hijau ≥80%, kuning ≥50%, merah), donat status keandalan, bar chart tren 6 bulan (Pencairan/Terkumpul/Jatuh Tempo), bar-list 5 piutang terbesar, metode pembayaran, kinerja pencatat, dan blok "Perlu Tindakan" berisi nasabah nunggak. **Ekspor PDF** = `window.print()` + `@media print` di `index.css`: kop laporan khusus cetak (`hidden print:block`), `.no-print` buang pemilih & tombol, `.print-block` `break-inside: avoid` biar kartu/grafik tidak terpotong antar halaman, `@page` A4 margin 14mm/12mm. Teks tetap bisa di-select (bukan gambar), tanpa dependency tambahan. **Ekspor CSV** = Blob + BOM UTF-8 (Excel Windows aman), 3 berkas: `laporan_<th>-<bl>_ringkasan.csv`, `_tren.csv`, `_top_nasabah.csv`; escaping koma/kutip/newline. **Backfill `cash_transactions`** (migrasi `20261105180000_backfill_kas.sql`, guard idempoten `count(*)=0`): tabel kas kosong 0 baris sisa cleanup M23 padahal `payments` punya 44 event → tanpa backfill laporan nunjukin Rp 0. **Dua bug angka ketemu saat verifikasi:** (1) `pencairan` ikut menghitung pinjaman `rejected` (3.750.000 padahal tidak pernah cair) → ditambah `and l.status <> 'rejected'`; (2) `terkumpul` bruto memasukkan pembayaran yang di-void → ditambah field `koreksi` & `terkumpul_bersih` (= terkumpul − koreksi), dan kolektibilitas pakai yang bersih. Cross-check RPC vs hitung langsung dari tabel (Nov-2026): pencairan 46.850.000 = OK, jatuh tempo 21.403.333 = OK, terkumpul 12.402.917 = OK, koreksi 3.423.334 = OK, terkumpul bersih 8.979.583 = OK, sisa piutang 35.977.086 = OK, total modal 37.850.000 = OK, nasabah baru 10 = OK.

- [x] **M27 Rebrand ke SWFinance (6 Nov 2026)** — permintaan operator: nama aplikasi ganti dari DanaModal ke **SWFinance**. Titel browser (`admin/index.html`), wordmark + logo mark Login (DM → SW, hero menyala), wordmark navbar Layout, kop PDF Laporan (judul + footer print), header CSV ringkasan, copyright Login, comment design-token di `index.css`, dan header `supabase/schema.sql` — semua ke SWFinance.

> **Catatan brand vs infrastruktur (M27).** Yang diganti cuma yang *tampil ke user*. Identifier backend sengaja TIDAK di-rename dan harus dibiarkan begitu: Edge Function `supabase/functions/danaku-api` (+ URL `/functions/v1/danaku-api`, command deploy, endpoint di `api.ts`), email dummy `nNIK@danaku.test` (dibuat server-side, terikat auth.users), folder storage `danaku/` di Cloudinary + `admin/server/index.mjs`, cron job `danaku-mark-overdue` (terjadwal live di DB), dan akun demo `admin@danaku.id`. Merename itu berarti migrasi data + deploy ulang tanpa manfaat apa pun karena tidak terlihat user.

- [x] **M28 Kulit "Vault" — login forest + frame forest (6 Nov 2026)** — permintaan operator: template login lama "nggak nunjukin aplikasinya mahal". **Login** (`Login.tsx`) ditulis ulang jadi full-screen gaya private-desk: latar forest deep-green (`#04150f`→`#0a2f22`) dengan dua layer cahaya emerald drift pelan (45s) + film grain, headline serif **Marcellus** "Modal kerja, dikelola dengan presisi.", monogram `SW` kotak gold hairline, input underline emas (bukan box), CTA bone dengan sheen hover, dan **jam WIB realtime** (`Intl.DateTimeFormat` Asia/Jakarta, tick 15s) di footer — logika auth (signInWithPassword, `busy`, `isConfigured`, error) tidak diubah sedikit pun. **Frame app** (`Layout.tsx` + `index.css`): token `admin-dark` pindah ke forest `#07231a`; navbar desktop & bottom bar mobile dikuliti gradient forest + hairline gold `rgba(201,164,76,.28)` + monogram emas bernapas (`v-glow` 4.5s, "SW" glow bone, "Finance" glow emerald — minta eksplisit operator); tab menu diganti **pil whisper** bone 7% di tray inset `#04150f/60` (perbaikan keluhan "tombol nempel semua karena outline gelap gak jelas" — fill, bukan outline), tab aktif emerald + gold ring, CTA "+ Pinjaman Baru" tetap emerald solid; label bottom bar pake hex custom (`#9fb3a6`/`#4ade80`) — sekalian nyembuhin bug lama override global `.text-slate-400{#374151!important}` yang merusak label di bar gelap. Font Marcellus ditambahkan di `admin/index.html`. **Keputusan desain tercatat:** full-dark untuk halaman dalam DITOLAK — operator uji sendiri ganti bg hijau/gelap dan menilai tidak nyaman; final = frame gelap + konten terang (keterbacaan angka finansial outdoor tetap AA). `prefers-reduced-motion`: pulse glow jadi statis. Verifikasi: tsc + build bersih, audit geometri 1440×900 + 390×844 (nol overflow/console error), computed-style probe (hairline, glow, whisper fill), uji live password-salah → pesan error tampil, login benar → dashboard, mobile 390px (judul 42px, CTA ≥44px, no overflow). **Catatan operasional:** percobaan login gagal berulang dari IP sama memicu throttle eksponensial goTrue — penundaan itu perilaku server, bukan bug UI.

**Status board (6 Nov 2026):** ✅ SEMUA M SELESAI (M0–M28). Admin web live, satu peran (admin/owner), fondasi skala besar (index, paginasi, agregasi server) sudah masuk. Mobile app dihapus. Identitas visual SWFinance (login Vault + frame forest) terpasang; konten halaman tetap terang demi keterbacaan. File `docs/PRD.md` duplikat lama (v1.0 pinjol) — acuan resmi `PRD.md` root.

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

1. ✅ **SELESAI M13 (5 Nov 2026)** — Convert calon 1-klik (Edge Function `convert-calon` + assign rute otomatis ke petugas pendaftar). *Catatan: UI/API-nya dihapus di M15; tabel `calon_nasabah` dibuang total di M21.*
2. ✅ **SELESAI M13 (5 Nov 2026)** — Status overdue otomatis (`pg_cron` 00:00 WIB + notifikasi `tagihan`). **Sisa:** denda nominal saat angka final disepakati klien (`loans.late_fee` masih 0).
3. Push notification (FCM) + pengingat H-3/H-1 ke nasabah. *Sebagian: notifikasi in-app `tagihan` sudah terbit dari job harian; FCM belum.*
4. Plafon naik otomatis untuk nasabah lancar.
5. Cetak kartu angsuran fisik (PDF/thermal) dari jadwal.
6. Multi-wilayah + multi-owner (cabang).
7. Audit log UI (siapa ubah/void apa). *Catatan: `payments.void_of/void_reason/voided_at` sudah menyimpan jejak koreksi, belum ada layar khusus.*
8. **RPC `dashboard_ringkasan()`** — Dashboard masih menarik semua loans/profiles/payments karena butuh angka agregat. Kalau sudah lambat, ikutin pola M20 (agregasi di Postgres). *Belum diperlukan pada skala sekarang.*
9. **Filter role & KYC di halaman Users** — parameter `p_role` / `p_kyc` sudah ada di RPC `list_nasabah` (M20), tinggal dipasang UI-nya kalau dibutuhkan. *Sejak M21 hanya ada role `admin` & `nasabah`, jadi filter ini opsional.*

---

*Dokumen ini adalah kontrak pembangunan. Perubahan skema tabel/RPC wajib update schema.sql + kedua app + bagian §8 PRD ini bersamaan.*
