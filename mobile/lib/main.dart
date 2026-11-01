import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'screens/auth/login_screen.dart';
import 'screens/root_shell.dart';
import 'services/supabase_service.dart';
import 'widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseService.instance.initialize(configured: AppEnv.isConfigured);
  runApp(const DanakuApp());
}

class DanakuApp extends StatelessWidget {
  const DanakuApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF00897B); // teal 600
    return MaterialApp(
      title: 'Danaku',
      debugShowCheckedModeBanner: false,
      theme: _theme(ColorScheme.fromSeed(seedColor: seed)),
      darkTheme: _theme(
        ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark),
      ),
      home: const AuthGate(),
    );
  }

  ThemeData _theme(ColorScheme scheme) => ThemeData(
        useMaterial3: true,
        colorScheme: scheme,
        appBarTheme: const AppBarTheme(centerTitle: false),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          isDense: true,
        ),
      );
}

/// Pilih halaman awal berdasarkan status konfigurasi & sesi Supabase.
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  @override
  Widget build(BuildContext context) {
    final svc = SupabaseService.instance;

    // Mode placeholder: app tetap jalan, banner tampil, tombol auth mati.
    if (!svc.isConfigured) {
      return Scaffold(
        body: Column(
          children: [
            const UnconfiguredBanner(),
            const Expanded(child: LoginScreen(placeholder: true)),
          ],
        ),
      );
    }

    return StreamBuilder<AuthState>(
      stream: svc.onAuthStateChange,
      builder: (context, snap) {
        final state = snap.data;
        final loggedIn = state?.session != null || svc.isLoggedIn;
        // Belum ada event sama sekali & belum tahu ada sesi -> splash singkat.
        if (state == null &&
            !svc.isLoggedIn &&
            snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        return loggedIn ? const RootShell() : const LoginScreen();
      },
    );
  }
}
