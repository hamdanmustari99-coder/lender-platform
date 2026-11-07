import 'package:intl/intl.dart';

/// Format angka & tanggal untuk SWFinance Mobile.
class Fmt {
  Fmt._();

  static final _rp = NumberFormat.currency(
    locale: 'id_ID',
    symbol: 'Rp',
    decimalDigits: 0,
  );

  static final _tanggal = DateFormat('d MMM yyyy', 'id_ID');
  static final _tanggalJam = DateFormat('d MMM yyyy HH:mm', 'id_ID');
  static final _jam = DateFormat('HH:mm', 'id_ID');

  static String rupiah(num value) => _rp.format(value);

  static String rupiahCompact(num value) {
    if (value >= 1000000000) {
      return 'Rp${(value / 1000000000).toStringAsFixed(1).replaceAll('.0', '')} M';
    }
    if (value >= 1000000) {
      return 'Rp${(value / 1000000).toStringAsFixed(1).replaceAll('.0', '')} jt';
    }
    if (value >= 1000) return 'Rp${(value / 1000).toStringAsFixed(0)} rb';
    return rupiah(value);
  }

  static String tanggal(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    final d = DateTime.tryParse(iso);
    if (d == null) return '-';
    return _tanggal.format(d.toLocal());
  }

  static String tanggalJam(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    final d = DateTime.tryParse(iso);
    if (d == null) return '-';
    return _tanggalJam.format(d.toLocal());
  }

  static String jam(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    final d = DateTime.tryParse(iso);
    if (d == null) return '-';
    return _jam.format(d.toLocal());
  }

  /// NIK tampil jadi grup 4 digit biar kebaca.
  static String nik(String? raw) {
    if (raw == null || raw.isEmpty) return '-';
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length != 16) return raw;
    final buf = StringBuffer();
    for (var i = 0; i < 16; i += 4) {
      if (i > 0) buf.write(' ');
      buf.write(digits.substring(i, i + 4));
    }
    return buf.toString();
  }

  /// Nomor HP jadi tel:+62… — input boleh 08…, 62…, atau +62….
  static String? telHref(String? phone) {
    if (phone == null) return null;
    var d = phone.replaceAll(RegExp(r'[^\d+]'), '');
    if (d.startsWith('+')) d = d.substring(1);
    if (d.startsWith('62')) {
      // sudah E.164 tanpa +
    } else if (d.startsWith('0')) {
      d = '62${d.substring(1)}';
    } else {
      return null;
    }
    if (d.length < 9) return null;
    return 'tel:+$d';
  }

  static String? waHref(String? phone, {String? pesan}) {
    final tel = telHref(phone);
    if (tel == null) return null;
    final number = tel.replaceFirst('tel:+', '');
    final q = pesan == null ? '' : '?text=${Uri.encodeComponent(pesan)}';
    return 'https://wa.me/$number$q';
  }

  static String tenorLabel(int n, String frequency) =>
      frequency == 'weekly' ? '$n minggu' : '$n bulan';
}
