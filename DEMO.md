# Checklist Demo SWFinance ke Klien

**Durasi:** ±20 menit. **Akun:** admin web `admin@danaku.id / admin123` (http://localhost:5173).

> Diperbarui 5 Nov 2026 (M14–M22). **Satu peran: admin/owner** — mobile app dihapus (M21), jadi semua skenario kini dijalankan dari browser.

## Skenario A — Operasional harian (7 menit, admin web)

1. Login sebagai **admin** → **Dashboard**: kartu setoran hari ini + blok **Nunggak** (klik Budi → cicilan telat + riwayat bayar + link detail).
2. **Pinjaman → detail Budi**: total tagihan / sudah dibayar / sisa hutang + jadwal cicilan.
3. **Catat Bayar** pada satu cicilan: isi nominal + catatan → simpan. Tunjukkan cicilan jadi lunas / parsial.
4. **Setoran**: rincian per pencatat per hari → tanggal mengikuti WIB. Tekankan: uang fisik vs tercatat bisa direkonsiliasi di sini.

## Skenario B — Koreksi salah input (3 menit, admin web)

1. Di **Setoran**, tekan **Koreksi** pada baris transaksi → isi alasan (+ nominal benar kalau perlu).
2. Tunjukkan baris merah −nominal + baris benar. Tekankan: transaksi salah **TIDAK hilang** — ada jejak audit (`void_of` / `void_reason`).

## Skenario C — Owner monitoring (7 menit, admin web)

1. **Laporan**: 4 kartu (Total Tagihan / Sudah Masuk / Sisa Piutang / Laba Kotor) + tabel nunggak + piutang per nasabah.
2. **Users**: tunjukkan **paginasi** + **search** (cari nama/telepon/NIK) + badge **Telat/Lancar**. Ini bukti aplikasi siap untuk nasabah banyak.
3. **Hapus nasabah**: tekan Hapus pada nasabah contoh → muncul **popup konfirmasi custom** (bukan dialog browser) → Batal. Jelaskan guard: nasabah yang masih punya pinjaman berjalan **tidak bisa dihapus**.
4. **Verifikasi KYC**: antrean pending → lihat dokumen (foto KTP via signed URL) → Verifikasi.

## Skenario D — Pendaftaran nasabah baru (3 menit, admin web) — opsional

1. **Users → ➕ Daftarkan Nasabah**: isi data KTP + alamat + shareloc + upload **foto nasabah, foto KTP, foto jaminan**.
2. Simpan → buka **detail nasabah**: tunjukkan grid foto + koordinat lokasi dengan link Google Maps.
3. Tekankan: **nasabah tidak perlu email** — sistem yang membuatkan (email dummy disembunyikan dari UI).

## Data contoh di DB

| Tokoh | Peran | Cerita demo |
|---|---|---|
| Administrator | admin/owner | login admin web |
| Andi Pratama | nasabah | history kaya: completed + rejected (uji AC) |
| Budi Hartono | nasabah | **nunggak**: monthly 1,5jt/4 (4×431.250), seq2 telat sejak 31 Okt |
| Candra Wijaya | nasabah | weekly 1jt/10 lunas + monthly 2jt/3 (contoh macet+parsial+koreksi) |
| Dedi Kurniawan | nasabah | contoh nasabah terdaftar, cicilan berjalan |
| Ajeng Lestari | nasabah | completed (contoh lunas penuh) |
| Siti Nurhaliza | nasabah | contoh detail lengkap: alamat + koordinat lokasi + link Maps |
| Anton Hadiyansah | nasabah | contoh nasabah terdaftar, pinjaman besar berjalan |
| Budi Santoso | nasabah | contoh nasabah terdaftar |
| Rizky Ramadhan | nasabah | contoh nasabah terdaftar |

**Catatan data demo (5 Nov 2026):** akun "Petugas Asing" sudah tidak ada di DB. Nunggak yang tampil di laporan = **Budi Hartono** (1 cicilan telat, sisa Rp431.250). Angka laporan live: Total Tagihan Rp56.130.000 · Sudah Masuk Rp12.669.583 · Sisa Piutang Rp43.460.417 · Laba Kotor Rp8.280.000.

## Catatan untuk klien

- Data `@danaku.test` = data contoh, dihapus sebelum produksi.
- **Bunga 20% flat per periode**, denda 0 (belum ditentukan).
- Skema: Rp1jt/10 minggu = Rp120rb/minggu (total kembali Rp1,2jt).
- **Minimum pinjaman Rp50.000** (revisi terbaru), maksimum Rp20.000.000.
- Frekuensi bayar **mingguan atau bulanan**, dipilih saat pengajuan.
- Status **Terlambat** muncul otomatis tiap tengah malam WIB (job harian), jadi daftar nunggak pagi sudah benar tanpa admin menandai manual.
- **Semua konfirmasi pakai popup custom** — tidak ada dialog bawaan browser yang jelek.
- **Sudah siap untuk nasabah banyak**: daftar nasabah & setoran ber-paginasi, laporan dihitung di server, search nama/telepon/NIK.
- Yang belum ada: FCM push, denda nominal, cetak kartu angsuran, plafon naik otomatis.
