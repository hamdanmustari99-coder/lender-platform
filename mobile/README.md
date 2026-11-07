# SWFinance Mobile

Aplikasi Android (Flutter) untuk **admin/owner** SWFinance — satu peran, sama
seperti model aplikasi web/desktop saat ini.

## Status

Dibangun ulang dari nol pada 7 Nov 2026 setelah app Flutter lama (model
3-peran: petugas/nasabah/owner) dihapus di milestone M21. Source lama masih ada
di git history commit `2e29894^` sebagai referensi arsitektur, tapi **tidak bisa
di-restore** karena tabel dan fungsi pendukungnya sudah di-drop dari database
(`collection_routes`, `calon_nasabah`, `is_petugas()`, kolom `petugas_id`).

## Build

```bash
# 1. dependency
flutter pub get

# 2. build release (kredensial di-bake dari dart_defines.json)
flutter build apk --dart-define-from-file=dart_defines.json

# 3. test
flutter test
```

`dart_defines.json` (gitignored) berisi:

```json
{
  "SUPABASE_URL": "https://<project>.supabase.co",
  "SUPABASE_ANON_KEY": "sb_publishable_..."
}
```

Output: `build/app/outputs/flutter-apk/app-release.apk`
Salinan siap-install: `SWFinance-Mobile-1.0.0.apk` di root repo.

## Struktur

```
lib/
  config.dart                  # env dari --dart-define-from-file
  main.dart                    # bootstrap Supabase + AuthGate
  models/models.dart           # kontrak dengan supabase/schema.sql
  format.dart                  # rupiah, tanggal WIB, NIK, tel/wa href
  services/supabase_service.dart  # query & RPC (kolom eksplisit)
  widgets/common.dart          # tema, StatusChip, InitialAvatar, ContactButtons
  screens/
    auth/login_screen.dart     # email + password
    root_shell.dart            # bottom nav 5 tab
    dashboard_screen.dart      # kas masuk hari ini, piutang, pinjaman terbaru
    loans_screen.dart          # daftar + cari + filter status
    loan_detail_screen.dart    # jadwal cicilan + catat pembayaran
    nasabah_screen.dart        # daftar + cari
    nasabah_detail_screen.dart # KTP, alamat, pinjaman
    setoran_screen.dart        # setoran hari ini
    profile_screen.dart        # akun admin + keluar
```

## Aturan yang dipakai (sama seperti web)

- **Admin/owner saja.** Tidak ada login petugas atau nasabah. Nasabah adalah
  data, bukan pengguna aplikasi.
- **Email nasabah tidak pernah dibawa ke HP.** `ApiService` memilih kolom
  secara eksplisit; `email` dummy (`nNIK@danaku.test`) sengaja tidak di-select.
- **Agregat pembayaran membuang void + reversal.** Baris dengan `void_of` atau
  `voided_at` tidak ikut dihitung (`Payment.isValidRow`), sama seperti web.
- **Tanggal memakai Zona WIB.** Timestamptz dari PostgREST UTC digeser +7 jam
  sebelum dibucket harian.
- **Uang dihitung server-side.** Pencatatan pembayaran lewat RPC
  `record_cash_payment` / `void_payment` / `void_and_repay`; HP hanya mengirim
  nominal.
- **Tidak ada dialog browser.** Konfirmasi keluar pakai `AlertDialog` Material.

## Toolchain (host Windows)

- Flutter 3.47.9 stable, Dart 3.13.7 (`D:\Flutter\flutter`)
- Android SDK 36.0.0, JDK 17
- Gradle 9.3.1, AGP 9.1.0, Kotlin 2.4.0 (versi template resmi Flutter 3.47.9 —
  AGP 9 menolak DSL `kotlinOptions {}` yang lama)
