// Uji generator PDF terhadap data contoh nyata (bentuk sama dengan RPC laporan_bulanan)
import { buatPdf } from '../src/lib/report-pdf.ts'
import { writeFileSync } from 'node:fs'

const lap = {
  periode: {
    bulan: 11, tahun: 2026, nama_bulan: 'November',
    dari: '2026-11-01', sampai: '2026-11-30',
    jumlah_hari: 30, hari_berjalan: 7, sudah_lewat: false,
  },
  ringkasan: {
    pencairan: 47500000, pinjaman_baru: 9, nasabah_baru: 6,
    jatuh_tempo: 12300000, terkumpul: 9800000, koreksi: 300000,
    terkumpul_bersih: 9500000, laba_bunga: 4750000, sisa_piutang: 51200000,
    total_modal: 38000000, pinjaman_berjalan: 23, nasabah_aktif: 17,
  },
  tren: [
    { urutan: 1, label_panjang: 'Juni 2026', pencairan: 30000000, terkumpul: 27000000, jatuh_tempo: 29000000 },
    { urutan: 2, label_panjang: 'Juli 2026', pencairan: 34000000, terkumpul: 31000000, jatuh_tempo: 33000000 },
    { urutan: 3, label_panjang: 'Agustus 2026', pencairan: 29000000, terkumpul: 30500000, jatuh_tempo: 31000000 },
    { urutan: 4, label_panjang: 'September 2026', pencairan: 41000000, terkumpul: 38000000, jatuh_tempo: 39000000 },
    { urutan: 5, label_panjang: 'Oktober 2026', pencairan: 44000000, terkumpul: 41000000, jatuh_tempo: 42000000 },
    { urutan: 6, label_panjang: 'November 2026', pencairan: 47500000, terkumpul: 9500000, jatuh_tempo: 12300000 },
  ],
  status: [
    { kode: 'LANCAR', label: 'Lancar', urutan: 1, jumlah: 17, sisa: 22000000 },
    { kode: 'PERINGATAN', label: 'Peringatan', urutan: 2, jumlah: 4, sisa: 15200000 },
    { kode: 'MACET', label: 'Macet', urutan: 3, jumlah: 2, sisa: 14000000 },
  ],
  top_nasabah: [
    { nama: 'Siti Aminah', nik: '3216016102900003', status: 'LANCAR', pinjaman: 3, sisa: 12500000 },
    { nama: 'Budi Santoso', nik: '3201020304850002', status: 'PERINGATAN', pinjaman: 2, sisa: 9800000 },
    { nama: 'Rina Wulandari', nik: '3273011507920004', status: 'LANCAR', pinjaman: 1, sisa: 7200000 },
    { nama: 'Agus Pratama', nik: '3174052206880001', status: 'MACET', pinjaman: 2, sisa: 6500000 },
    { nama: 'Dewi Lestari', nik: '3517010309940005', status: 'LANCAR', pinjaman: 1, sisa: 5100000 },
  ],
  arus_kas: { masuk_pembayaran: 9800000, masuk_lain: 0, keluar_pencairan: 47500000, keluar_lain: 500000 },
  metode: [
    { metode: 'Tunai', jumlah: 34, total: 7100000 },
    { metode: 'Transfer', jumlah: 12, total: 2700000 },
  ],
  kinerja: [{ nama: 'Admin SWFinance', transaksi: 46, total: 9800000 }],
}

const opts = {
  kolektibilitas: 77.2,
  kasMasuk: lap.arus_kas.masuk_pembayaran + lap.arus_kas.masuk_lain,
  kasKeluar: lap.arus_kas.keluar_pencairan + lap.arus_kas.keluar_lain,
}

const t0 = Date.now()
const buf = buatPdf(lap, opts)
const ms = Date.now() - t0
const out = 'C:/Users/simpl/AppData/Local/hermes/cache/scratch/ocrtest/laporan.pdf'
writeFileSync(out, Buffer.from(buf))

// --- verifikasi isi PDF ---
const raw = Buffer.from(buf).toString('latin1')
const checks = {
  'header %PDF': raw.startsWith('%PDF-'),
  'ada EOF': raw.trimEnd().endsWith('%%EOF'),
  'ada objek halaman': /\/Type\s*\/Page[^s]/.test(raw),
  'judul korporat SWFinance': raw.includes('SW') && raw.includes('Finance'),
  'judul laporan': raw.includes('LAPORAN BULANAN'),
  'periode November 2026': raw.includes('November 2026'),
  'seksi arus kas': raw.includes('Kas bersih'),
  'seksi tren': raw.includes('Juni 2026'),
  'top nasabah Siti Aminah': raw.includes('Siti Aminah'),
  'NIK tercetak': raw.includes('3216016102900003'),
  'kolektibilitas 77.2': raw.includes('77.2'),
  'footer halaman': raw.includes('Halaman 1 /'),
}

console.log(`PDF ${Buffer.from(buf).length} bytes, ${ms}ms -> ${out}`)
console.log(`pages: ${(raw.match(/\/Type\s*\/Page[^s]/g) || []).length}`)
let ok = 0
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? 'OK  ' : 'FAIL'}  ${k}`)
  if (v) ok++
}
console.log(`\n${ok}/${Object.keys(checks).length} checks passed`)
process.exit(ok === Object.keys(checks).length ? 0 : 1)
