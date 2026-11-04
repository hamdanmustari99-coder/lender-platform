import 'package:flutter/material.dart';

import '../../services/supabase_service.dart';
import '../../widgets/common.dart';

/// Halaman Login + Register (tab). Saat [placeholder] true (konfigurasi
/// Supabase belum diisi), semua tombol auth di-disable dengan pesan.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.placeholder = false});

  final bool placeholder;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 2, vsync: this);

  final _loginForm = GlobalKey<FormState>();
  final _regForm = GlobalKey<FormState>();

  final _email = TextEditingController();
  final _password = TextEditingController();
  final _fullName = TextEditingController();
  final _phone = TextEditingController();

  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tab.addListener(() {
      if (mounted) setState(() {}); // ganti form saat tab berpindah
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _fullName.dispose();
    _phone.dispose();
    _tab.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_loginForm.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await SupabaseService.instance
          .signIn(_email.text.trim(), _password.text);
      // RootShell menggantikan halaman ini lewat AuthGate; tidak perlu pop.
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _register() async {
    if (!_regForm.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      await SupabaseService.instance.signUp(
        _email.text.trim(),
        _password.text,
        fullName: _fullName.text.trim(),
        phone: _phone.text.trim(),
      );
      if (mounted) {
        showInfo(
          context,
          'Pendaftaran berhasil! Kalau diminta verifikasi email, cek inbox '
          'Anda dulu sebelum masuk.',
        );
        _tab.animateTo(0);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _emailValidator(String? v) =>
      (v == null || !v.contains('@') || !v.contains('.')) || v.length < 5
          ? 'Email tidak valid'
          : null;

  String? _passwordValidator(String? v) =>
      (v == null || v.length < 6) ? 'Password minimal 6 karakter' : null;

  String? _required(String? v, String label) =>
      (v == null || v.trim().isEmpty) ? '$label wajib diisi' : null;

  String? _phoneValidator(String? v) =>
      (v == null || v.trim().isEmpty)
          ? 'No. HP wajib diisi'
          : (RegExp(r'^[0-9+\-\s]{8,16}$').hasMatch(v.trim())
              ? null
              : 'No. HP tidak valid');

  InputDecoration _dec(String label, {IconData? icon, String? hint}) =>
      InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: icon == null ? null : Icon(icon),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final disabled = widget.placeholder;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Logo sederhana dari ikon Material.
                  Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      color: cs.primary,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: const Icon(Icons.handshake_rounded,
                        color: Colors.white, size: 40),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Danaku',
                    style: Theme.of(context)
                        .textTheme
                        .headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    'Pinjaman online yang jujur & jelas',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 24),
                  if (disabled)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(
                        'Login & pendaftaran dinonaktifkan sampai konfigurasi '
                        'Supabase diisi.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: cs.error, fontSize: 12),
                      ),
                    ),
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        TabBar(
                          controller: _tab,
                          tabs: const [
                            Tab(text: 'Masuk'),
                            Tab(text: 'Daftar'),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: [
                            Form(
                              key: _loginForm,
                              child: Column(
                                children: [
                                  TextFormField(
                                    controller: _email,
                                    keyboardType: TextInputType.emailAddress,
                                    decoration: _dec('Email',
                                        icon: Icons.mail_outline_rounded),
                                    validator: _emailValidator,
                                    enabled: !disabled,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _password,
                                    obscureText: true,
                                    decoration: _dec('Password',
                                        icon: Icons.lock_outline_rounded),
                                    validator: _passwordValidator,
                                    enabled: !disabled,
                                    onFieldSubmitted: (_) => _login(),
                                  ),
                                  const SizedBox(height: 16),
                                  SizedBox(
                                    width: double.infinity,
                                    child: FilledButton.icon(
                                      onPressed:
                                          (disabled || _busy) ? null : _login,
                                      icon: const Icon(Icons.login_rounded),
                                      label: const Text('Masuk'),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Form(
                              key: _regForm,
                              child: Column(
                                children: [
                                  TextFormField(
                                    controller: _fullName,
                                    decoration: _dec('Nama lengkap',
                                        icon: Icons.person_outline_rounded),
                                    validator: (v) => _required(v, 'Nama'),
                                    enabled: !disabled,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _phone,
                                    keyboardType: TextInputType.phone,
                                    decoration: _dec('No. HP',
                                        icon: Icons.phone_rounded,
                                        hint: '08xxxxxxxxxx'),
                                    validator: _phoneValidator,
                                    enabled: !disabled,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _email,
                                    keyboardType: TextInputType.emailAddress,
                                    decoration: _dec('Email',
                                        icon: Icons.mail_outline_rounded),
                                    validator: _emailValidator,
                                    enabled: !disabled,
                                  ),
                                  const SizedBox(height: 12),
                                  TextFormField(
                                    controller: _password,
                                    obscureText: true,
                                    decoration: _dec(
                                      'Password',
                                      icon: Icons.lock_outline_rounded,
                                      hint: 'Minimal 6 karakter',
                                    ),
                                    validator: _passwordValidator,
                                    enabled: !disabled,
                                  ),
                                  const SizedBox(height: 16),
                                  SizedBox(
                                    width: double.infinity,
                                    child: FilledButton.tonalIcon(
                                      onPressed:
                                          (disabled || _busy) ? null : _register,
                                      icon: const Icon(Icons.person_add_rounded),
                                      label: const Text('Daftar'),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ][_tab.index],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Bunga flat 10%/tahun • Tenor 1-12 bulan\nRp50.000 - Rp20.000.000',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
