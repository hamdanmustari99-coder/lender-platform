# Checklist Demo Danaku ke Klien (M8)

**Durasi:** ±20 menit. **Akun:** admin web `admin@danaku.id / admin123` (http://localhost:5173),
HP petugas login `petugas.udin@danaku.test / Test1234!`, HP nasabah `borrower.b@danaku.test / Test1234!` (Budi).

## Skenario A — Operasional harian petugas (5 menit, HP)
1. Login sebagai **Udin** → tab **Rute**: tunjukkan Budi merah (nunggak 5 hari, sisa Rp431.250).
2. Ketuk **Terima** → Lunas → Simpan. Rute Budi hilang dari daftar (lunas).
3. Tab **Setoran**: total hari ini nambah Rp431.250 + baris transaksi baru.
4. Tab **Daftar**: tunjukkan form calon (jangan submit — biar data demo bersih).

## Skenario B — Koreksi salah input (3 menit, HP)
1. Di Rute Ajeng (kalau ada tagihan) input nominal ngaco → simpan.
2. Tab Setoran → **Koreksi** → isi alasan + nominal benar → "Koreksi + Catat Benar".
3. Tunjukkan baris merah −nominal + baris benar. Tekankan: transaksi salah TIDAK hilang.

## Skenario C — Owner monitoring (7 menit, admin web)
1. **Dashboard**: kartu setoran hari ini (nambah dari skenario A) + blok Nunggak (klik Budi → cicilan telat + riwayat bayar + link detail).
2. **Setoran**: rincian per petugas → contoh koreksi (kalau skenario B dilakukan) + tombol Koreksi versi web.
3. **Laporan**: 4 kartu + tabel nunggak + piutang per nasabah.
4. **Calon Nasabah**: tunjukkan Dedi (jadi_nasabah, link UUID) sebagai contoh convert.
5. **Pinjaman → detail Budi**: total tagihan / sudah dibayar / sisa hutang + jadwal.

## Skenario D — Nasabah (2 menit, HP kedua / Chrome)
1. Login sebagai **Budi** → Beranda (sisa hutang) → Pinjaman → detail (progress + sisa per angsuran).

## Data contoh di DB (1 Nov 2026)
| Tokoh | Peran | Cerita demo |
|---|---|---|
| Administrator | admin/owner | login admin web |
| Udin Kolektor | petugas (Cibiru) | rute: Budi (nunggak), Candra (lunas), Dedi, Ajeng |
| Petugas Asing | petugas (Cileunyi, tanpa rute) | contoh petugas baru / isolasi RLS |
| Andi Pratama | nasabah | history kaya: completed + rejected (uji AC) |
| Budi Hartono | nasabah | **nunggak**: monthly 1,5jt/4 (4×431.250), seq1 telat 5 hari |
| Candra Wijaya | nasabah | weekly 1jt/10 lunas + monthly 2jt/3 (contoh macet+parsial+koreksi) |
| Dedi Kurniawan | nasabah | hasil convert calon_nasabah (contoh rekrutmen) |
| Ajeng Lestari | nasabah | completed (contoh lunas penuh) |

## Catatan untuk klien
- Data `@danaku.test` = data contoh, dihapus sebelum produksi.
- Bunga 20% + denda 0.
- Skema: Rp1jt/10 minggu = Rp120rb/minggu (total kembali Rp1,2jt).
- Yang belum ada: convert calon 1-klik (sekarang 2 langkah), status overdue otomatis, FCM.
