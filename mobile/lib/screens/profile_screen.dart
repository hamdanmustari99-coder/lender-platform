import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// Tab Profil: data akun, edit nama & no. HP, status KYC, logout.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.profile,
    required this.loading,
    required this.reload,
    required this.onLogout,
    required this.onOpenKyc,
  });

  final AppProfile? profile;
  final bool loading;
  final Future<void> Function() reload;
  final Future<void> Function() onLogout;
  final Future<void> Function() onOpenKyc;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _svc = SupabaseService.instance;
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  bool _saving = false;

  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _fillFromProfile();
  }

  void _fillFromProfile() {
    final p = widget.profile;
    if (p != null && !_editing) {
      _name.text = p.fullName;
      _phone.text = p.phone;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await _svc.updateProfile(
        fullName: _name.text.trim(),
        phone: _phone.text.trim(),
      );
      await widget.reload();
      if (!mounted) return;
      setState(() => _editing = false);
      showInfo(context, 'Profil berhasil disimpan.');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Keluar?'),
        content: const Text('Sesi Anda akan diakhiri di perangkat ini.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (ok == true) await widget.onLogout();
  }

  String _kycLabel(String s) {
    switch (s) {
      case 'verified':
        return 'Terverifikasi';
      case 'rejected':
        return 'Ditolak';
      default:
        return 'Menunggu verifikasi';
    }
  }

  Color _kycColor(String s, ColorScheme cs) {
    switch (s) {
      case 'verified':
        return cs.primary;
      case 'rejected':
        return cs.error;
      default:
        return cs.tertiary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final p = widget.profile;
    final user = _svc.currentUser;
    final email = user?.email ?? p?.email ?? '-';

    if (widget.loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Profil')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (p == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Profil')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Profil belum ditemukan.'),
              const SizedBox(height: 8),
              FilledButton.tonal(
                onPressed: widget.reload,
                child: const Text('Muat ulang'),
              ),
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: _confirmLogout,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Keluar'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profil'),
        actions: [
          IconButton(
            onPressed: () {
              setState(() {
                _editing = !_editing;
                if (!_editing) _fillFromProfile();
              });
            },
            icon: Icon(_editing ? Icons.close_rounded : Icons.edit_rounded),
            tooltip: _editing ? 'Batal edit' : 'Edit profil',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ---- Header ----
          Center(
            child: Column(
              children: [
                CircleAvatar(
                  radius: 44,
                  backgroundColor: cs.primaryContainer,
                  child: Text(
                    p.fullName.isNotEmpty ? p.fullName[0].toUpperCase() : '?',
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w800,
                      color: cs.onPrimaryContainer,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  p.fullName.isEmpty ? 'Tanpa nama' : p.fullName,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(email,
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(color: cs.onSurfaceVariant)),
                const SizedBox(height: 8),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Chip(
                      avatar: Icon(
                        p.isAdmin
                            ? Icons.admin_panel_settings_rounded
                            : Icons.person_rounded,
                        size: 18,
                        color: cs.primary,
                      ),
                      label: Text(p.isAdmin ? 'Admin' : 'Peminjam'),
                      visualDensity: VisualDensity.compact,
                    ),
                    const SizedBox(width: 8),
                    Chip(
                      avatar: Icon(Icons.verified_user_rounded,
                          size: 18, color: _kycColor(p.kycStatus, cs)),
                      label: Text('KYC: ${_kycLabel(p.kycStatus)}'),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // ---- KYC CTA ----
          if (!p.isKycVerified)
            Card(
              color: p.kycStatus == 'rejected' ? cs.errorContainer : cs.tertiaryContainer,
              child: ListTile(
                leading: Icon(
                  p.kycStatus == 'rejected'
                      ? Icons.refresh_rounded
                      : Icons.verified_user_outlined,
                  color: p.kycStatus == 'rejected'
                      ? cs.onErrorContainer
                      : cs.onTertiaryContainer,
                ),
                title: Text(
                  p.kycStatus == 'rejected'
                      ? 'KYC ditolak — ajukan ulang'
                      : 'Lengkapi / periksa KYC',
                  style: TextStyle(
                    color: p.kycStatus == 'rejected'
                        ? cs.onErrorContainer
                        : cs.onTertiaryContainer,
                  ),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: widget.onOpenKyc,
              ),
            ),

          const SizedBox(height: 8),

          // ---- Form data ----
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Data Diri',
                        style: Theme.of(context)
                            .textTheme
                            .titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _name,
                      enabled: _editing,
                      decoration: const InputDecoration(
                        labelText: 'Nama lengkap',
                        prefixIcon: Icon(Icons.person_outline_rounded),
                      ),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'Nama wajib diisi'
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phone,
                      enabled: _editing,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'No. HP',
                        prefixIcon: Icon(Icons.phone_rounded),
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'No. HP wajib diisi';
                        }
                        if (!SupabaseService.isValidIdPhone(v)) {
                          return 'Format salah — contoh: 081234567890';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: email,
                      enabled: false,
                      decoration: const InputDecoration(
                        labelText: 'Email (tidak bisa diubah)',
                        prefixIcon: Icon(Icons.mail_outline_rounded),
                      ),
                    ),
                    const SizedBox(height: 12),
                    InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'NIK',
                        prefixIcon: Icon(Icons.badge_outlined),
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      child: Text(p.nik.isEmpty ? '-' : p.nik),
                    ),
                    const SizedBox(height: 12),
                    if (p.birthDate != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Tanggal lahir',
                            prefixIcon: Icon(Icons.cake_rounded),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          child: Text(dateFormat.format(p.birthDate!)),
                        ),
                      ),
                    if (p.address.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Alamat',
                            prefixIcon: Icon(Icons.home_outlined),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          child: Text(p.address),
                        ),
                      ),
                    if (_editing)
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: _saving ? null : _save,
                          icon: _saving
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.save_rounded),
                          label: Text(_saving ? 'Menyimpan...' : 'Simpan'),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ---- Logout ----
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _confirmLogout,
              style: OutlinedButton.styleFrom(
                foregroundColor: cs.error,
                side: BorderSide(color: cs.error.withValues(alpha: 0.5)),
              ),
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Keluar'),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              'Danaku • v1.0.0',
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: cs.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}
