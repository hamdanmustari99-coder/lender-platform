/// Konfigurasi Supabase untuk aplikasi Danaku.
///
/// Nilai diambil dari compile-time environment (--dart-define-from-file),
/// contoh:
///   dart_defines.json = {
///     "SUPABASE_URL": "https://xxxx.supabase.co",
///     "SUPABASE_ANON_KEY": "eyJhbGciOi..."
///   }
///   flutter run --dart-define-from-file=dart_defines.json
///
/// Selama nilai masih placeholder (default di bawah), app tetap build & jalan
/// dalam mode demo: banner konfigurasi tampil dan tombol auth di-disable.
class AppEnv {
  AppEnv._();

  static const kSupabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://YOUR-PROJECT.supabase.co',
  );

  static const kSupabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'YOUR-ANON-KEY',
  );

  /// true kalau user sudah mengisi URL & key sungguhan.
  static bool get isConfigured =>
      !kSupabaseUrl.contains('YOUR-PROJECT') &&
      !kSupabaseAnonKey.contains('YOUR-ANON') &&
      kSupabaseUrl.startsWith('http') &&
      kSupabaseAnonKey.isNotEmpty;

  static const contactsBucket = 'kyc-documents';
}
