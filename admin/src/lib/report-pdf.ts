// Generator PDF Laporan Bulanan — jsPDF + autotable, tanpa browser print.
//
// Kenapa tidak window.print(): WebView Android tidak punya implementasi print,
// jadi tombol "Unduh PDF" tidak melakukan apa pun tanpa error. Di sini laporan
// dirender langsung ke byte PDF supaya jalur web dan APK sama-sama bekerja.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LaporanBulanan } from './api'
import { fmtDate, fmtRp } from './format'

export interface PdfOpsi {
  kolektibilitas: number
  kasMasuk: number
  kasKeluar: number
}

/** jspdf-autotable menempelkan finalY ke instance doc; tipenya tidak diekspor. */
const lastY = (doc: jsPDF): number =>
  (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

/**
 * PDF laporan dibuat dengan jsPDF, bukan window.print().
 *
 * Kenapa: tombol "Unduh PDF" sebelumnya memanggil window.print(). Di WebView
 * Android tidak ada implementasi print, jadi tombolnya tidak melakukan apa pun
 * (tanpa error). jsPDF menghasilkan byte PDF asli yang bisa langsung ditulis ke
 * Documents dan dibagikan, sama di web maupun APK.
 */
export function buatPdf(lap: LaporanBulanan, opts: PdfOpsi) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  // Palet sama dengan UI
  const INK: [number, number, number] = [15, 23, 42]
  const MUTED: [number, number, number] = [100, 116, 139]
  const GREEN: [number, number, number] = [5, 150, 105]
  const RED: [number, number, number] = [220, 38, 38]
  const LINE: [number, number, number] = [226, 232, 240]

  let y = M

  // ---- Kop ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...INK)
  doc.text('SW', M, y + 6)
  const swW = doc.getTextWidth('SW')
  doc.setTextColor(...GREEN)
  doc.text('Finance', M + swW, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('Laporan Manajemen Peminjaman Dana & Modal Usaha', M, y + 11)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text('LAPORAN BULANAN', W - M, y + 4, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`${lap.periode.nama_bulan} ${lap.periode.tahun}`, W - M, y + 9, { align: 'right' })
  doc.text(`Dicetak ${fmtDate(new Date().toISOString())}`, W - M, y + 13.5, { align: 'right' })

  y += 18
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.4)
  doc.line(M, y, W - M, y)
  y += 7

  const rk = lap.ringkasan

  // ---- Metrik utama (2x2) ----
  const cards: [string, string, string][] = [
    ['Modal Dipinjamkan', fmtRp(rk.pencairan), `${rk.pinjaman_baru} pinjaman baru · ${rk.nasabah_baru} nasabah baru`],
    ['Tagihan Jatuh Tempo', fmtRp(rk.jatuh_tempo), `${lap.periode.hari_berjalan} dari ${lap.periode.jumlah_hari} hari berjalan`],
    ['Terkumpul Bersih', fmtRp(rk.terkumpul_bersih), `dari ${rk.nasabah_aktif} nasabah aktif bayar`],
    ['Laba Bunga', fmtRp(rk.laba_bunga), 'flat 20% per periode'],
  ]
  const cw = (W - M * 2 - 6) / 2
  cards.forEach(([label, value, sub], i) => {
    const cx = M + (i % 2) * (cw + 6)
    const cy = y + Math.floor(i / 2) * 24
    doc.setDrawColor(...LINE)
    doc.setFillColor(250, 250, 250)
    doc.roundedRect(cx, cy, cw, 21, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), cx + 4, cy + 6)
    doc.setFontSize(12)
    doc.setTextColor(...INK)
    doc.text(value, cx + 4, cy + 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(sub, cx + 4, cy + 17.5)
  })
  y += 50

  // ---- Kolektibilitas ----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...INK)
  doc.text('Kolektibilitas Periode', M, y)
  doc.text(`${opts.kolektibilitas}%`, W - M, y, { align: 'right' })
  y += 3
  const barW = W - M * 2
  doc.setFillColor(...LINE)
  doc.roundedRect(M, y, barW, 4, 1.6, 1.6, 'F')
  const pct = Math.min(opts.kolektibilitas, 100) / 100
  const colour: [number, number, number] =
    opts.kolektibilitas >= 80 ? GREEN : opts.kolektibilitas >= 50 ? [245, 158, 11] : RED
  if (pct > 0) {
    doc.setFillColor(...colour)
    doc.roundedRect(M, y, Math.max(barW * pct, 2), 4, 1.6, 1.6, 'F')
  }
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    `${fmtRp(rk.terkumpul_bersih)} terkumpul dari ${fmtRp(rk.jatuh_tempo)} jatuh tempo` +
      (rk.koreksi > 0 ? ` (setelah koreksi ${fmtRp(rk.koreksi)})` : ''),
    M,
    y,
  )
  y += 8

  // ---- Arus kas ----
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Arus Kas', 'Nilai']],
    body: [
      ['Kas masuk — pembayaran', fmtRp(lap.arus_kas.masuk_pembayaran)],
      ['Kas masuk — lainnya', fmtRp(lap.arus_kas.masuk_lain)],
      ['Kas keluar — pencairan', fmtRp(lap.arus_kas.keluar_pencairan)],
      ['Kas keluar — lainnya', fmtRp(lap.arus_kas.keluar_lain)],
      ['Kas bersih', fmtRp(opts.kasMasuk - opts.kasKeluar)],
    ],
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    theme: 'grid',
  })

  // ---- Tren 6 bulan ----
  y = lastY(doc) + 8
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Bulan', 'Pencairan', 'Terkumpul', 'Jatuh Tempo']],
    body: lap.tren.map((t) => [t.label_panjang, fmtRp(t.pencairan), fmtRp(t.terkumpul), fmtRp(t.jatuh_tempo)]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    theme: 'grid',
  })

  // ---- Top piutang ----
  y = lastY(doc) + 8
  if (lap.top_nasabah.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['#', 'Nasabah', 'NIK', 'Status', 'Pinjaman', 'Sisa Piutang']],
      body: lap.top_nasabah.map((t, i) => [i + 1, t.nama, t.nik, t.status, t.pinjaman, fmtRp(t.sisa)]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59] },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      theme: 'grid',
    })
  }

  // ---- Metode bayar + kinerja ----
  y = lastY(doc) + 8
  if (lap.metode.length || lap.kinerja.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Metode Bayar', 'Transaksi', 'Total']],
      body: lap.metode.map((m) => [m.metode, `${m.jumlah}x`, fmtRp(m.total)]),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59] },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    })
  }

  // ---- Footer tiap halaman ----
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    const h = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(
      'Angka dihitung server-side (RPC laporan_bulanan); terkumpul bersih sudah memperhitungkan koreksi pembayaran.',
      M,
      h - 8,
    )
    doc.text(`Halaman ${p} / ${pages}`, W - M, h - 8, { align: 'right' })
  }

  return doc.output('arraybuffer') as ArrayBuffer
}
