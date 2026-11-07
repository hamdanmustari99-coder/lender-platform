import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:swfinance_mobile/format.dart';
import 'package:swfinance_mobile/models/models.dart';

/// Unit test untuk helper murni — tanpa perlu Supabase atau widget tree.
void main() {
  // Fmt pakai DateFormat locale 'id_ID' — tanpa ini semua test tanggal
  // melempar LocaleDataException, dan bug yang sama bikin layar kosong di device.
  initializeDateFormatting('id_ID');

  group('Fmt.rupiah', () {
    test('format penuh tanpa desimal', () {
      expect(Fmt.rupiah(1500000), 'Rp1.500.000');
      expect(Fmt.rupiah(0), 'Rp0');
    });

    test('format compact', () {
      expect(Fmt.rupiahCompact(1500000), 'Rp1.5 jt');
      expect(Fmt.rupiahCompact(2500000000), 'Rp2.5 M');
      expect(Fmt.rupiahCompact(50000), 'Rp50 rb');
    });
  });

  group('Fmt.nik', () {
    test('mengelompokkan 16 digit jadi grup 4', () {
      expect(Fmt.nik('3201234567890001'), '3201 2345 6789 0001');
    });

    test('mengembalikan apa adanya kalau bukan 16 digit', () {
      expect(Fmt.nik('123'), '123');
      expect(Fmt.nik(null), '-');
    });
  });

  group('Fmt.telHref', () {
    test('memetakan 08… ke E.164 +62', () {
      expect(Fmt.telHref('081234567890'), 'tel:+6281234567890');
    });

    test('menerima 62… dan +62…', () {
      expect(Fmt.telHref('6281234567890'), 'tel:+6281234567890');
      expect(Fmt.telHref('+62 812-3456-7890'), 'tel:+6281234567890');
    });

    test('null untuk input terlalu pendek atau format asing', () {
      expect(Fmt.telHref('12345'), null);
      expect(Fmt.telHref(null), null);
      expect(Fmt.telHref(''), null);
    });
  });

  group('Fmt.tanggal / jam', () {
    test('tanggal ISO jadi format Indonesia', () {
      expect(Fmt.tanggal('2026-01-15T10:00:00Z'), '15 Jan 2026');
    });

    test('jam memakai zona lokal, bukan UTC', () {
      // 10:00Z = 17:00 WIB
      expect(Fmt.jam('2026-01-15T10:00:00Z'), '17:00');
    });

    test('tanggalJam menggabung tanggal dan jam', () {
      expect(Fmt.tanggalJam('2026-01-15T10:00:00Z'), '15 Jan 2026 17:00');
    });

    test('input kosong atau tidak valid jadi "-"', () {
      expect(Fmt.tanggal(null), '-');
      expect(Fmt.tanggal(''), '-');
      expect(Fmt.tanggal('bukan-tanggal'), '-');
      expect(Fmt.jam(null), '-');
    });
  });

  group('Fmt.waHref', () {
    test('membuat link wa.me dengan pesan ter-encode', () {
      final url = Fmt.waHref('081234567890', pesan: 'Halo pak');
      expect(url, startsWith('https://wa.me/6281234567890?text='));
      expect(url, contains('Halo%20pak'));
    });
  });

  group('Installment.sisa', () {
    test('sisa = amount - amount_paid', () {
      const i = Installment(
        id: 'x',
        loanId: 'l',
        seq: 1,
        dueDate: '2026-01-01',
        amount: 200000,
        amountPaid: 50000,
        status: InstallmentStatus.unpaid,
      );
      expect(i.sisa, 150000);
      expect(i.isPaid, false);
    });

    test('lunas kalau amount_paid >= amount', () {
      const i = Installment(
        id: 'x',
        loanId: 'l',
        seq: 2,
        dueDate: '2026-01-08',
        amount: 200000,
        amountPaid: 200000,
        status: InstallmentStatus.paid,
      );
      expect(i.sisa, 0);
      expect(i.isPaid, true);
    });
  });

  group('Payment.isValidRow', () {
    test('baris normal valid', () {
      const p = Payment(id: 'p', amount: 100, paidAt: '2026-01-01T00:00:00Z');
      expect(p.isValidRow, true);
    });

    test('baris reversal (void_of terisi) tidak valid', () {
      const p = Payment(
        id: 'p',
        amount: -100,
        paidAt: '2026-01-01T00:00:00Z',
        voidOf: 'asli',
      );
      expect(p.isValidRow, false);
    });

    test('baris yang sudah dibatalkan (voided_at) tidak valid', () {
      const p = Payment(
        id: 'p',
        amount: 100,
        paidAt: '2026-01-01T00:00:00Z',
        voidedAt: '2026-01-02T00:00:00Z',
      );
      expect(p.isValidRow, false);
    });
  });

  group('Profile.initials', () {
    test('dua huruf dari nama depan & belakang', () {
      const p = Profile(
        id: 'u',
        role: UserRole.nasabah,
        email: 'a@b.c',
        fullName: 'Budi Santoso',
        createdAt: '2026-01-01',
      );
      expect(p.initials, 'BS');
    });

    test('satu huruf untuk nama tunggal', () {
      const p = Profile(
        id: 'u',
        role: UserRole.nasabah,
        email: 'a@b.c',
        fullName: 'Budi',
        createdAt: '2026-01-01',
      );
      expect(p.initials, 'B');
    });
  });
}
