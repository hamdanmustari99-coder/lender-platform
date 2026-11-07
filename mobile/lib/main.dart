import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'config.dart';
import 'screens/auth/login_screen.dart';
import 'screens/root_shell.dart';
import 'services/supabase_service.dart';
import 'widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Wajib sebelum DateFormat dengan locale non-default dipakai.
  initializeDateFormatting('id_ID');
  if (AppEnv.isConfigured) {
    await Supabase.initialize(
      url: AppEnv.kSupabaseUrl,
      // ignore: deprecated_member_use
      anonKey: AppEnv.kSupabaseAnonKey,
    );
  }
  runApp(const SwFinanceApp());
}

class SwFinanceApp extends StatelessWidget {
  const SwFinanceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SW Finance — Panel Operasional',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: AppEnv.isConfigured ? const AuthGate() : const ConfigScreen(),
    );
  }
}

/// Pilih halaman awal berdasarkan sesi Supabase yang tersimpan.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = snapshot.data?.session;
        if (session != null) return const RootShell();
        return const LoginScreen();
      },
    );
  }
}

/// Layar kalau dart-define belum diisi — supaya app tidak crash diam-diam.
class ConfigScreen extends StatelessWidget {
  const ConfigScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 56,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppTheme.brand,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text(
                  'SW',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 20,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'SW Finance Mobile',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text(
                'Supabase belum dikonfigurasi.\n\n'
                'Jalankan dengan:\n'
                'flutter run --dart-define-from-file=dart_defines.json',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade700, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Dipakai oleh tombol keluar di halaman Profil.
Future<void> signOutGlobal() async {
  await ApiService.instance.signOut();
}
