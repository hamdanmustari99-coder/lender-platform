import 'package:flutter/material.dart';

import '../../format.dart';
import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';
import '../../main.dart' show signOutGlobal;

/// Profil admin yang login + tombol keluar.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.onKeluar});

  final VoidCallback onKeluar;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _api = ApiService.instance;

  Profile? _me;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final me = await _api.fetchMe();
      if (!mounted) return;
      setState(() {
        _me = me;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 8),
          Center(
            child: Column(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppTheme.brand,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Text(
                    'SW',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 22,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'SW Finance',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 2),
                Text(
                  'Panel Operasional • Mobile',
                  style: TextStyle(
                      fontSize: 12, color: Colors.grey.shade600),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_error != null)
            Text(_error!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12))
          else if (me != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Akun',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    InfoRow('Nama', me.fullName.isEmpty ? '-' : me.fullName),
                    InfoRow('Peran', me.role == UserRole.admin ? 'Admin / Owner' : 'Nasabah'),
                    InfoRow('Bergabung', Fmt.tanggal(me.createdAt)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Sesi',
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    Text(
                      'Setiap akses dan perubahan data tercatat dalam audit trail sistem.',
                      style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade600,
                          height: 1.5),
                    ),
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      onPressed: _konfirmasiKeluar,
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('Keluar'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(44),
                        foregroundColor: AppTheme.danger,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
          Center(
            child: Text(
              '© 2026 SW Finance Core System',
              style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _konfirmasiKeluar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar dari akun?'),
        content: const Text('Sesi di perangkat ini akan diakhiri.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Keluar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await signOutGlobal();
    widget.onKeluar();
  }
}
