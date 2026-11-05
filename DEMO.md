# Checklist Demo Danaku ke Klien

**Durasi:** ±20 menit. **Akun:** admin web `admin@danaku.id / admin123` (http://localhost:5173),
HP petugas login `petugas.udin@danaku.test / Test1234!`, HP nasabah `borrower.b@danaku.test / Test1234!` (Budi).

> Diperbarui 5 Nov 2026 (M14–M20). Menu **Calon Nasabah sudah dihapus** (M15) — skenario C tidak lagi menampilkannya.

## Skenario A — Operasional harian petugas (5 menit, HP)

1. Login sebagai **Udin** → tab **Rute**: tunjukkan Budi merah (nunggak, sisa cicilan).
2. Ketuk **Terima** → Lunas → Simpan. Rute Budi hilang dari daftar (lunas).
3. Tab **Setoran**: total hari ini nambah + baris transaksi baru.
4. Tab **Daftar**: tunjukkan form pendaftaran nasabah baru (foto KTP + shareloc). Jangan submit — biar data demo bersih.

## Skenario B — Koreksi salah input (3 menit, HP)

1. Di Rute (kalau ada tagihan) input nominal ngaco → simpan.
2. Tab Setoran → **Koreksi** → isi alasan + nominal benar → "Koreksi + Catat Benar".
3. Tunjukkan baris merah −nominal + baris benar. Tekankan: transaksi salah TIDAK hilang.

## Skenario C — Owner monitoring (7 menit, admin web)

1. **Dashboard**: kartu setoran hari ini (nambah dari skenario A) + blok Nunggak (klik Budi → cicilan telat + riwayat bayar + link detail).
2. **Setoran**: rincian per pencatat per hari → contoh koreksi (kalau skenario B dilakukan) + tombol Koreksi versi web. Tekankan tanggal mengikuti WIB.
3. **Laporan**: 4 kartu (Total Tagihan / Sudah Masuk / Sisa Piutang / Laba Kotor) + tabel nunggak + piutang per nasabah.
4. **Users**: tunjukkan **paginasi** + **search** (cari nama/telepon/NIK) + badge **Telat/Lancar**. Ini bukti aplikasi siap untuk nasabah banyak.
5. **Hapus nasabah**: tekan Hapus pada nasabah contoh → muncul **popup konfirmasi custom** (bukan dialog browser) → Batal. Jelaskan guard: nasabah yang masih punya pinjaman berjalan **tidak bisa dihapus**.
6. **Pinjaman → detail Budi**: total tagihan / sudah dibayar / sisa hutang + jadwal.

## Skenario D — Nasabah (2 menit, HP kedua / Chrome)

1. Login sebagai **Budi** → Beranda (sisa hutang) → Pinjaman → detail (progress + sisa per angsuran).

## Skenario E — Pendaftaran nasabah baru (3 menit, admin web) — opsional

1. **Users → ➕ Daftarkan Nasabah**: isi data KTP + alamat + shareloc + upload **foto nasabah, foto KTP, foto jaminan**.
2. Simpan → buka **detail nasabah**: tunjukkan grid foto + koordinat lokasi dengan link Google Maps.
3. Tekankan: **nasabah tidak perlu email** — sistem yang membuatkan.

## Data contoh di DB

| Tokoh | Peran | Cerita demo |
|---|---|---|
| Administrator | admin/owner | login admin web |
| Udin Kolektor | petugas (Cibiru) | rute: Budi (nunggak), Candra, Dedi, Ajeng |
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
- Status **Terlambat** muncul otomatis tiap tengah malam WIB (job harian), jadi rute petugas pagi sudah benar tanpa admin menandai manual.
- **Semua konfirmasi pakai popup custom** — tidak ada dialog bawaan browser yang jelek.
- **Sudah siap untuk nasabah banyak**: daftar nasabah & setoran ber-paginasi, laporan dihitung di server, search nama/telepon/NIK.
- Yang belum ada: FCM push, denda nominal, cetak kartu angsuran, plafon naik otomatis.
