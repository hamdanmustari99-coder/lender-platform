/// Konfigurasi Supabase untuk SWFinance Mobile.
///
/// Nilai diambil dari compile-time environment (--dart-define-from-file):
///   dart_defines.json = {
///     "SUPABASE_URL": "https://xxxx.supabase.co",
///     "SUPABASE_ANON_KEY": "sb_publishable_..."
///   }
///   flutter run --dart-define-from-file=dart_defines.json
///
/// Selama nilai masih placeholder, app tetap build dan menampilkan layar
/// konfigurasi alih-alih error saat startup.
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

  /// true kalau URL dan key asli sudah diisi.
  static bool get isConfigured =>
      !kSupabaseUrl.contains('YOUR-PROJECT') &&
      !kSupabaseAnonKey.contains('YOUR-ANON') &&
      kSupabaseUrl.startsWith('http') &&
      kSupabaseAnonKey.isNotEmpty;
}
