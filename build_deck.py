#!/usr/bin/env python3
"""Danaku deck v2 — custom polished design, dark emerald + white cards."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

BG = "0B2E23"
CARD = "FFFFFF"
CARD2 = "10382B"
ACC = "10B981"
GOLD = "F59E0B"
RED = "EF4444"
WHITE = "FFFFFF"
MUTED = "9DB8AB"
DARK = "10281C"
INK = "1A2E26"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]

def hexcolor(h):
    return RGBColor(int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))

def bg(slide, color=BG):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = hexcolor(color)

def shape(slide, left, top, w, h, fill, line=None, radius=None, shape_type=MSO_SHAPE.ROUNDED_RECTANGLE):
    shp = slide.shapes.add_shape(shape_type, Inches(left), Inches(top), Inches(w), Inches(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = hexcolor(fill)
    if line:
        shp.line.color.rgb = hexcolor(line)
        shp.line.width = Pt(1.25)
    else:
        shp.line.fill.background()
    if radius is not None:
        try: shp.adjustments[0] = radius
        except Exception: pass
    return shp

def textbox(slide, left, top, w, h, text, size=14, bold=False, color=WHITE, align=PP_ALIGN.LEFT, font="Calibri"):
    tx = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(w), Inches(h))
    tf = tx.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(size)
    p.font.bold = bold
    p.font.color.rgb = hexcolor(color)
    p.font.name = font
    p.alignment = align
    return tx

def card_text(shp, title, body, title_size=13, body_size=10.5):
    tf = shp.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.18); tf.margin_right = Inches(0.18)
    tf.margin_top = Inches(0.1); tf.margin_bottom = Inches(0.1)
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(title_size); p.font.bold = True
    p.font.color.rgb = hexcolor(INK); p.font.name = "Calibri"
    p2 = tf.add_paragraph()
    p2.text = body
    p2.font.size = Pt(body_size); p2.font.color.rgb = hexcolor("3A4A44"); p2.font.name = "Calibri"
    p2.space_before = Pt(4)

def kicker(slide, top, text):
    textbox(slide, 0.7, top, 11.9, 0.35, text, size=11, bold=True, color=ACC, align=PP_ALIGN.LEFT)

def title(slide, top, text, size=32):
    textbox(slide, 0.7, top, 11.9, 0.9, text, size=size, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

def sub(slide, top, text, size=13.5):
    textbox(slide, 0.7, top, 11.9, 0.6, text, size=size, bold=False, color=MUTED, align=PP_ALIGN.LEFT)

def footer(slide, left_text="Danaku  •  Bank Keliling Digital", right_text=""):
    textbox(slide, 0.7, 7.0, 8, 0.3, left_text, size=8.5, color="C4D4CB")
    textbox(slide, 10.2, 7.0, 2.4, 0.3, right_text or "", size=8.5, color="C4D4CB", align=PP_ALIGN.RIGHT)

def accent_bar(slide, top=0.0):
    shape(slide, 0, top, 13.333, 0.07, ACC, shape_type=MSO_SHAPE.RECTANGLE)

# ---------- 1 COVER ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
textbox(s, 0.7, 1.5, 2.2, 0.35, "BANK KELILING  •  V2.0", size=12, bold=True, color=ACC)
title(s, 1.9, "Danaku", size=54)
textbox(s, 0.7, 3.15, 11.9, 0.7, "Bank Keliling Digital", size=30, bold=False, color=WHITE)
sub(s, 4.05, "Petugas lapangan  •  Owner  •  Nasabah  —  satu platform operasional", size=15)
shape(s, 0.7, 4.9, 1.6, 0.02, ACC, shape_type=MSO_SHAPE.RECTANGLE)
textbox(s, 0.7, 5.15, 7.5, 1.2,
        "Pengganti buku catatan: rute tagihan, terima tunai 1-klik,\nrekap setoran, dan laporan — realtime.",
        size=13, color=MUTED)
# right card
c = shape(s, 8.9, 1.4, 3.75, 4.5, CARD)
tf = c.text_frame; tf.word_wrap = True
tf.margin_left = Inches(0.3); tf.margin_right = Inches(0.3); tf.margin_top = Inches(0.15)
rows = [("Rp1 jt / 10 minggu", "Rp115 rb/minggu"), ("3 peran", "1 aplikasi + web"), ("15%", "bunga flat / periode")]
for i,(a,b) in enumerate(rows):
    p = tf.paragraphs[0] if i==0 else tf.add_paragraph()
    p.space_before = Pt(10) if i>0 else Pt(0)
    p.text = a; p.font.size=Pt(11); p.font.color.rgb=hexcolor("5B6F66"); p.font.name="Calibri"
    q = tf.add_paragraph(); q.text=b; q.font.size=Pt(20); q.font.bold=True; q.font.color.rgb=hexcolor(INK); q.font.name="Calibri"
footer(s, right_text="1 / 10")

# ---------- 2 MASALAH ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "01  —  MASALAH"); title(s, 0.8, "Buku Fisik Sudah Tidak Cukup", size=30)
sub(s, 1.65, "Empat bocor operasional yang setiap hari terjadi di lapangan", size=13)
items = [("📒", "Buku hilang", "Catatan petugas hilang = histori hilang. Tidak ada backup, tidak ada rekap."),
         ("💸", "Owner buta setoran", "Tidak tahu duit berapa yang dibawa tiap petugas sampai setor sore."),
         ("⏰", "Nunggak telat ketahuan", "Baru sadar pas buku dihitung — penagihan selalu terlambat."),
         ("🧾", "Nasabah buta sisa", "Hanya kartu fisik. Tanya sisa utang = telepon petugas.")]
for i,(icon,t,b) in enumerate(items):
    x = 0.7 + i*3.08
    cd = shape(s, x, 2.6, 2.85, 3.9, CARD)
    textbox(s, x+0.2, 2.8, 2.45, 0.6, icon, size=30, align=PP_ALIGN.LEFT)
    textbox(s, x+0.2, 3.45, 2.45, 0.6, t, size=14, bold=True, color=INK)
    textbox(s, x+0.2, 4.05, 2.45, 1.9, b, size=11, color="3A4A44")
footer(s, right_text="2 / 10")

# ---------- 3 PERAN ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "02  —  SOLUSI"); title(s, 0.8, "3 Peran, 1 Platform", size=30)
sub(s, 1.65, "Satu aplikasi mobile dua mode otomatis (dari role login) + web owner", size=13)
roles = [("🛵", "PETUGAS LAPANGAN", "Bang Udin", "Rute hari ini • terima tunai 1-klik • rekap setoran • daftarkan nasabah baru", ACC),
         ("🖥️", "OWNER", "Pak Haji", "Setoran per petugas • approve • rekonsiliasi • laporan piutang & laba", GOLD),
         ("🧺", "NASABAH", "Bu Ani", "Sisa utang • jadwal • riwayat bayar • notifikasi", "38BDF8")]
for i,(icon,r,n,d,col) in enumerate(roles):
    x = 0.7 + i*4.05
    cd = shape(s, x, 2.6, 3.8, 3.9, CARD)
    shape(s, x, 2.6, 3.8, 0.12, col, shape_type=MSO_SHAPE.ROUNDED_RECTANGLE)
    textbox(s, x+0.25, 2.95, 3.3, 0.5, f"{icon}  {r}", size=12, bold=True, color=col)
    textbox(s, x+0.25, 3.45, 3.3, 0.45, n, size=16, bold=True, color=INK)
    textbox(s, x+0.25, 4.0, 3.3, 2.0, d, size=11, color="3A4A44")
footer(s, right_text="3 / 10")

# ---------- 4 SKEMA ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "03  —  SKEMA"); title(s, 0.8, "Pinjaman Mingguan / Bulanan", size=30)
sub(s, 1.65, "Bunga flat 15% per periode (sementara) — transparan di depan", size=13)
bullets = [("Plafon", "Rp500 ribu – Rp20 juta"), ("Mingguan", "1 – 52 minggu  •  due tiap 7 hari"),
           ("Bulanan", "1 – 12 bulan  •  due tiap bulan"), ("Denda", "Rp0 (kolom siap, menunggu keputusan)")]
for i,(k,v) in enumerate(bullets):
    y = 2.6 + i*1.02
    shape(s, 0.7, y, 6.0, 0.9, CARD)
    textbox(s, 0.95, y+0.08, 2.2, 0.75, k, size=13, bold=True, color=INK)
    textbox(s, 2.9, y+0.08, 3.5, 0.75, v, size=12, color="3A4A44")
ex = shape(s, 7.2, 2.6, 5.4, 3.9, CARD)
tf = ex.text_frame; tf.word_wrap=True
tf.margin_left=Inches(0.35); tf.margin_right=Inches(0.35); tf.margin_top=Inches(0.3)
pp=tf.paragraphs[0]; pp.text="CONTOH HITUNGAN"; pp.font.size=Pt(11); pp.font.bold=True; pp.font.color.rgb=hexcolor(ACC); pp.font.name="Calibri"
q=tf.add_paragraph(); q.text="Pinjam Rp1.000.000 • 10 minggu"; q.font.size=Pt(14); q.font.bold=True; q.font.color.rgb=hexcolor(INK); q.font.name="Calibri"
q=tf.add_paragraph(); q.text="Rp115.000 / minggu"; q.font.size=Pt(30); q.font.bold=True; q.font.color.rgb=hexcolor("0B6B4F"); q.font.name="Calibri"
q=tf.add_paragraph(); q.text="Total kembali Rp1.150.000  (pokok + 15%)"; q.font.size=Pt(12); q.font.color.rgb=hexcolor("3A4A44"); q.font.name="Calibri"
footer(s, right_text="4 / 10")

# ---------- 5 PETUGAS ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "04  —  HP PETUGAS"); title(s, 0.8, "Buku Catatan Digital", size=30)
sub(s, 1.65, "Yang tadinya 5 menit per nasabah jadi < 30 detik", size=13)
feats = [("🗺️ Rute Hari Ini", "Nama–alamat–nominal.\nNunggak merah di atas."),
         ("💵 Terima Tunai 1-Klik", "Lunas / sebagian + catatan.\nLangsung tercatat."),
         ("🔀 Kelebihan Mengalir", "Bayar lebih? Otomatis ke\ncicilan berikutnya."),
         ("✏️ Koreksi Beraudit", "Salah input? Reversal +\ninput benar, jejak utuh."),
         ("📝 Daftar Nasabah", "Foto KTP di tempat.\nOwner convert jadi akun.")]
for i,(t,b) in enumerate(feats):
    x = 0.7 + (i%5)*2.46
    cd = shape(s, x, 2.6, 2.28, 3.9, CARD)
    tt = t.split(" ",1)
    textbox(s, x+0.18, 2.8, 1.95, 1.0, tt[0], size=26, align=PP_ALIGN.LEFT)
    textbox(s, x+0.18, 3.55, 1.95, 0.6, tt[1], size=12.5, bold=True, color=INK)
    textbox(s, x+0.18, 4.15, 1.95, 1.9, b, size=10.5, color="3A4A44")
footer(s, right_text="5 / 10")

# ---------- 6 OWNER ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "05  —  WEB OWNER"); title(s, 0.8, "Semua Terpantau", size=30)
sub(s, 1.65, "Buka pagi hari: siapa setor berapa, siapa nunggak, sisa piutang", size=13)
own = [("💰 Setoran Hari Ini", "Per petugas per hari.\nRincian + tombol Koreksi.", ACC),
       ("⚠️ Blok Nunggak", "Telat siapa, berapa,\nriwayat bayarnya.", RED),
       ("📊 Laporan", "Tagihan vs masuk vs sisa.\nLaba kotor + piutang.", GOLD),
       ("✅ Operasional", "KYC • calon nasabah •\napprove • detail pinjaman.", "38BDF8")]
for i,(t,b,col) in enumerate(own):
    x = 0.7 + i*3.08
    cd = shape(s, x, 2.6, 2.85, 3.9, CARD)
    shape(s, x+0.22, 2.85, 0.5, 0.5, col, shape_type=MSO_SHAPE.OVAL)
    textbox(s, x+0.22, 3.55, 2.4, 0.7, t, size=13, bold=True, color=INK)
    textbox(s, x+0.22, 4.2, 2.4, 1.8, b, size=11, color="3A4A44")
footer(s, right_text="6 / 10")

# ---------- 7 KEAMANAN ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "06  —  KEAMANAN"); title(s, 0.8, "Data KTP & Kas Dijaga Berlapis", size=30)
secs = [("🔒 Akses bertingkat", "Nasabah: hanya datanya. Petugas: hanya rutenya. Selain itu kosong."),
        ("📸 Dokumen private", "Foto KTP di bucket private — dibuka via link 10 menit."),
        ("↩️ Kas anti-hapus", "Koreksi = transaksi lawan. Tidak ada edit/hapus diam-diam."),
        ("⚙️ Logika di database", "Bunga, jadwal, guard — di server, bukan di HP.")]
for i,(t,b) in enumerate(secs):
    x = 0.7 + (i%2)*6.15; y = 2.6 + (i//2)*2.05
    cd = shape(s, x, y, 5.9, 1.85, CARD)
    textbox(s, x+0.25, y+0.2, 5.4, 0.5, "✓  " + t, size=13, bold=True, color="0B6B4F")
    textbox(s, x+0.25, y+0.75, 5.4, 0.9, b, size=11, color="3A4A44")
footer(s, right_text="7 / 10")

# ---------- 8 TERUJI ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "07  —  BUKTI"); title(s, 0.8, "Teruji Live, Bukan Sekadar Tampil", size=30)
mets = [("40+", "kasus uji\nlolos semua"), ("100%", "rekonsiliasi\nkas = jadwal"), ("0", "akses silang\nantar user"), ("3", "peran + RLS\nterisolasi")]
for i,(big,small) in enumerate(mets):
    x = 0.7 + i*3.08
    cd = shape(s, x, 2.6, 2.85, 2.2, ACC)
    textbox(s, x, 2.85, 2.85, 0.9, big, size=36, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    textbox(s, x, 3.75, 2.85, 0.9, small, size=11.5, color=WHITE, align=PP_ALIGN.CENTER)
textbox(s, 0.7, 5.2, 11.9, 1.5,
        "End-to-end live: daftar → KYC → ajukan → approve → bayar tunai → lunas.   •   Contoh nyata di DB: Budi nunggak, Candra pola macet, Dedi hasil convert.",
        size=12.5, color=MUTED, align=PP_ALIGN.LEFT)
footer(s, right_text="8 / 10")

# ---------- 9 ROADMAP ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
kicker(s, 0.45, "08  —  NEXT"); title(s, 0.8, "Roadmap & Butuh dari Bapak/Ibu", size=30)
rm = [("1  Convert calon 1-klik", "Sekarang 2 langkah → jadi 1 tombol."),
      ("2  Overdue otomatis + denda", "Status telat jalan sendiri saat angka fix."),
      ("3  Pengingat H-3/H-1", "WhatsApp/SMS ke nasabah sebelum jatuh tempo."),
      ("4  Plafon naik otomatis", "Nasabah lancar → limit naik sendiri."),
      ("5  Kartu angsuran cetak", "Jadwal → PDF/thermal untuk kartu fisik.")]
for i,(t,b) in enumerate(rm):
    y = 2.5 + i*0.92
    shape(s, 0.7, y, 6.4, 0.8, CARD)
    textbox(s, 0.95, y+0.1, 6.0, 0.65, f"{t}  —  {b}", size=12, bold=False, color=INK)
ask = shape(s, 7.5, 2.5, 5.1, 4.0, GOLD)
tf = ask.text_frame; tf.word_wrap=True
tf.margin_left=Inches(0.35); tf.margin_right=Inches(0.35); tf.margin_top=Inches(0.3)
pp=tf.paragraphs[0]; pp.text="❓  MINTA KEPUTUSAN"; pp.font.size=Pt(12); pp.font.bold=True; pp.font.color.rgb=hexcolor(INK); pp.font.name="Calibri"
for line in ["• Angka bunga & denda final", "• Jumlah petugas awal", "• Butuh kartu cetak?", "• Kapan mulai produksi?"]:
    q=tf.add_paragraph(); q.text=line; q.font.size=Pt(13); q.font.bold=True; q.font.color.rgb=hexcolor(INK); q.font.name="Calibri"; q.space_before=Pt(8)
footer(s, right_text="9 / 10")

# ---------- 10 CLOSING ----------
s = prs.slides.add_slide(blank); bg(s); accent_bar(s)
textbox(s, 0.7, 1.6, 11.9, 0.4, "DANAKU  •  BANK KELILING DIGITAL", size=12, bold=True, color=ACC, align=PP_ALIGN.CENTER)
textbox(s, 0.7, 2.1, 11.9, 1.2, "Terima kasih", size=54, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
textbox(s, 0.7, 3.4, 11.9, 0.6, "Siap demo live: HP petugas  •  Web owner  •  HP nasabah", size=15, color=MUTED, align=PP_ALIGN.CENTER)
c1 = shape(s, 4.15, 4.5, 2.4, 0.9, ACC); c1.text_frame.paragraphs[0].text="▶  Mulai Demo"
c1.text_frame.paragraphs[0].font.size=Pt(14); c1.text_frame.paragraphs[0].font.bold=True; c1.text_frame.paragraphs[0].font.color.rgb=hexcolor(WHITE); c1.text_frame.paragraphs[0].alignment=PP_ALIGN.CENTER; c1.text_frame.vertical_anchor=MSO_ANCHOR.MIDDLE
c2 = shape(s, 6.8, 4.5, 2.4, 0.9, CARD); c2.text_frame.paragraphs[0].text="Tanya Jawab"
c2.text_frame.paragraphs[0].font.size=Pt(14); c2.text_frame.paragraphs[0].font.bold=True; c2.text_frame.paragraphs[0].font.color.rgb=hexcolor(INK); c2.text_frame.paragraphs[0].alignment=PP_ALIGN.CENTER; c2.text_frame.vertical_anchor=MSO_ANCHOR.MIDDLE
footer(s, left_text="Danaku  •  disiapkan untuk presentasi klien", right_text="10 / 10")

prs.save("C:/Users/simpl/lender-platform/Danaku-Presentasi-Klien.pptx")
print("saved OK — 10 slides custom design")
