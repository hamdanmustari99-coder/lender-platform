import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// Tab Beranda: sapaan, status KYC + banner, ringkasan pinjaman, aksi cepat.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.profile,
    required this.loading,
    required this.error,
    required this.reload,
    required this.onOpenKyc,
    required this.onGoApply,
    required this.onGoLoans,
  });

  final AppProfile? profile;
  final bool loading;
  final String? error;
  final Future<void> Function() reload;
  final Future<void> Function() onOpenKyc;
  final VoidCallback onGoApply;
  final VoidCallback onGoLoans;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _svc = SupabaseService.instance;
  List<Loan>? _loans;
  String? _loansError;

  @override
  void initState() {
    super.initState();
    _loadLoans();
  }

  Future<void> _loadLoans() async {
    try {
      final loans = await _svc.fetchMyLoans();
      if (!mounted) return;
      setState(() {
        _loans = loans;
        _loansError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loansError = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final p = widget.profile;
    final name = (p?.fullName.isNotEmpty ?? false) ? p!.fullName : 'Sobat Danaku';

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: cs.primary,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.handshake_rounded,
                  color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            const Text('Danaku'),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () async {
              await widget.reload();
              await _loadLoans();
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await widget.reload();
          await _loadLoans();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Hai, $name 👋',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(
              'Butuh dana cepat? Ajukan pinjaman mulai Rp50 ribu.',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: cs.onSurfaceVariant),
            ),
            const SizedBox(height: 16),
            _kycCard(context),
            const SizedBox(height: 16),
            _statsCard(context),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: widget.onGoApply,
                    icon: const Icon(Icons.post_add_rounded),
                    label: const Text('Ajukan Pinjaman'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: widget.onGoLoans,
                    icon: const Icon(Icons.receipt_long_rounded),
                    label: const Text('Riwayat'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _kycCard(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (widget.loading) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    if (widget.error != null && widget.profile == null) {
      return Card(
        child: ListTile(
          leading: Icon(Icons.error_outline_rounded, color: cs.error),
          title: const Text('Gagal memuat profile'),
          subtitle: Text(widget.error!),
          onTap: widget.reload,
        ),
      );
    }

    final p = widget.profile!;
    final status = p.kycStatus;

    if (p.isKycVerified) {
      return Card(
        color: cs.primaryContainer,
        child: ListTile(
          leading: Icon(Icons.verified_rounded, color: cs.primary),
          title: Text('KYC Terverifikasi ✅',
              style: TextStyle(color: cs.onPrimaryContainer)),
          subtitle: Text('Nama: ${p.fullName.isEmpty ? '-' : p.fullName}\nNIK: ${p.nik.isEmpty ? '-' : p.nik}',
              style: TextStyle(color: cs.onPrimaryContainer)),
          isThreeLine: true,
        ),
      );
    }

    if (status == 'rejected') {
      return Card(
        color: cs.errorContainer,
        child: ListTile(
          leading: Icon(Icons.cancel_outlined, color: cs.error),
          title: Text('KYC Ditolak',
              style: TextStyle(color: cs.onErrorContainer)),
          subtitle: Text(
            'Dokumen Anda ditolak. Periksa ulang foto KTP & selfie, lalu ajukan lagi.',
            style: TextStyle(color: cs.onErrorContainer),
          ),
          trailing: FilledButton(
            onPressed: widget.onOpenKyc,
            child: const Text('Ajukan ulang'),
          ),
        ),
      );
    }

    // pending: dorong user menyelesaikan/menunggu verifikasi.
    final hasDocs = p.nik.isNotEmpty;
    return Card(
      color: cs.tertiaryContainer,
      child: ListTile(
        leading: Icon(Icons.schedule_rounded, color: cs.onTertiaryContainer),
        title: Text(
          hasDocs ? 'KYC dalam peninjauan ⏳' : 'Lengkapi KYC dulu yuk 📝',
          style: TextStyle(color: cs.onTertiaryContainer),
        ),
        subtitle: Text(
          hasDocs
              ? 'Dokumen Anda sedang diverifikasi tim Danaku. Pengajuan pinjaman '
                  'baru bisa dilakukan setelah KYC disetujui.'
              : 'Verifikasi identitas (NIK, KTP, selfie) untuk bisa mengajukan '
                  'pinjaman. Cuma butuh 5 menit!',
          style: TextStyle(color: cs.onTertiaryContainer),
        ),
        isThreeLine: true,
        trailing: hasDocs
            ? null
            : FilledButton(
                onPressed: widget.onOpenKyc,
                child: const Text('Mulai'),
              ),
      ),
    );
  }

  Widget _statsCard(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (_loansError != null) {
      return Card(
        child: ListTile(
          leading: Icon(Icons.error_outline_rounded, color: cs.error),
          title: const Text('Gagal memuat pinjaman'),
          subtitle: Text(_loansError!),
          onTap: _loadLoans,
        ),
      );
    }

    if (_loans == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    final loans = _loans!;
    final active = loans
        .where((l) =>
            l.status == 'disbursed' || l.status == 'active')
        .toList();
    final inProgress = loans
        .where((l) => l.status == 'submitted' || l.status == 'under_review')
        .length;
    final totalActive = active.fold<int>(0, (s, l) => s + l.totalPayment);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ringkasan Pinjaman',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _stat(
                    context,
                    icon: Icons.receipt_long_rounded,
                    label: 'Pinjaman aktif',
                    value: '${active.length}',
                  ),
                ),
                Expanded(
                  child: _stat(
                    context,
                    icon: Icons.schedule_rounded,
                    label: 'Dalam proses',
                    value: '$inProgress',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _stat(
              context,
              icon: Icons.account_balance_wallet_rounded,
              label: 'Total tagihan aktif',
              value: active.isEmpty ? '-' : rupiahText(totalActive),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(BuildContext context,
      {required IconData icon, required String label, required String value}) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, color: cs.primary, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: cs.onSurfaceVariant)),
              Text(value,
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ],
    );
  }
}
