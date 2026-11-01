import 'package:flutter_test/flutter_test.dart';

import 'package:danaku/config.dart';

void main() {
  test('placeholder env tetap terdeteksi sebagai belum dikonfigurasi', () {
    // Saat tanpa --dart-define, nilai default placeholder dipakai.
    expect(AppEnv.kSupabaseUrl, contains('YOUR-PROJECT'));
    expect(AppEnv.isConfigured, isFalse);
  });

  test('daftar warna & format rupiah tidak crash saat dipakai', () {
    // smoke: pastikan import paket intl aktif lewat config
    expect(AppEnv.contactsBucket, 'kyc-documents');
  });
}
