import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

const int _minAmount = 500000;
const int _maxAmount = 20000000;
const double _rate = 20.0; // v3.0: bunga flat 20% per periode

/// Hitung cicilan per periode bunga flat v3.0: (amount + amount * 20%) / tenor.
/// Server (trigger loans_guard) memakai rumus sama dengan pembulatan ke atas.
int estimatePeriodicPayment(int amount, int tenor) =>
    ((amount + amount * _rate / 100) / tenor).round();

/// Tab Ajukan: form pengajuan pinjaman. Hanya bisa dipakai jika KYC verified.
class ApplyLoanScreen extends StatefulWidget {
  const ApplyLoanScreen({
    super.key,
    required this.profile,
    required this.profileLoading,
    required this.reloadProfile,
    required this.onOpenKyc,
  });

  final AppProfile? profile;
  final bool profileLoading;
  final Future<void> Function() reloadProfile;
  final Future<void> Function() onOpenKyc;

  @override
  State<ApplyLoanScreen> createState() => _ApplyLoanScreenState();
}

class _ApplyLoanScreenState extends State<ApplyLoanScreen> {
  final _svc = SupabaseService.instance;
  final _purpose = TextEditingController();
  // v3.0: jaminan (teks; foto di halaman detail pinjaman setelah loan terbit)
  final _collType = TextEditingController();
  final _collDetail = TextEditingController();

  double _amount = 2000000; // nilai slider (Rp)
  int _tenor = 10;
  String _frequency = 'weekly'; // weekly | monthly (v2.0)
  bool _busy = false;

  @override
  void dispose() {
    _purpose.dispose();
    _collType.dispose();
    _collDetail.dispose();
    super.dispose();
  }

  /// Tenor maksimal mengikuti frekuensi: mingguan s/d 52, bulanan 1|3 (v3.0).
  int get _maxTenor => _frequency == 'weekly' ? 52 : 3;

  /// Opsi tenor yang ditampilkan: mingguan 1-52, bulanan cuma 1 & 3 (v3.0).
  List<int> get _tenorOptions =>
      _frequency == 'weekly' ? List.generate(52, (i) => i + 1) : [1, 3];

  int get _amountRounded => (_amount / 50000).round() * 50000;
  int get _periodic => estimatePeriodicPayment(_amountRounded, _tenor);

  String get _freqLabel => _frequency == 'weekly' ? 'minggu' : 'bulan';

  Future<void> _submit() async {
    final amount = _amountRounded;
    if (amount < _minAmount || amount > _maxAmount) {
      showError(context,
          'Nominal harus antara ${rupiahText(_minAmount)} dan ${rupiahText(_maxAmount)}.');
      return;
    }
    if (_tenor < 1 || _tenor > _maxTenor) {
      showError(context, 'Tenor $_freqLabel harus 1–$_maxTenor.');
      return;
    }
    if (_purpose.text.trim().isEmpty) {
      showError(context, 'Tujuan pinjaman wajib diisi.');
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Kirim pengajuan?'),
        content: Text(
          'Pinjaman ${rupiahText(amount)} untuk $_tenor $_freqLabel (${_frequency == 'weekly' ? 'mingguan' : 'bulanan'}).\n'
          'Perkiraan cicilan ${rupiahText(_periodic)}/${_frequency == 'weekly' ? 'minggu' : 'bulan'} '
          '(bunga flat ${_rate.toStringAsFixed(0)}%).\n'
          'Nilai final dihitung oleh sistem saat disetujui. Lanjut kirim?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Periksa lagi'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Kirim'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _busy = true);
    try {
      await _svc.submitLoan(
        amount: amount,
        tenorMonths: _tenor,
        frequency: _frequency,
        purpose: _purpose.text.trim(),
        collateralType: _collType.text.trim(),
        collateralDetail: _collDetail.text.trim(),
      );
      if (!mounted) return;
      showInfo(context, 'Pengajuan terkirim! Pantau statusnya di menu Pinjaman.');
      setState(() {
        _purpose.clear();
        _amount = 2000000;
        _tenor = 10;
        _frequency = 'weekly';
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    // Profile masih dimuat.
    if (widget.profileLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Ajukan Pinjaman')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    // KYC belum verified -> gerbang.
    final p = widget.profile;
    if (p == null || !p.isKycVerified) {
      final rejected = p?.kycStatus == 'rejected';
      final pendingDocs = p != null && p.nik.isNotEmpty;
      return Scaffold(
        appBar: AppBar(title: const Text('Ajukan Pinjaman')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  rejected
                      ? Icons.cancel_outlined
                      : pendingDocs
                          ? Icons.hourglass_top_rounded
                          : Icons.lock_outline_rounded,
                  size: 64,
                  color: rejected ? cs.error : cs.onSurfaceVariant,
                ),
                const SizedBox(height: 16),
                Text(
                  rejected
                      ? 'KYC Anda ditolak'
                      : pendingDocs
                          ? 'KYC masih diproses ⏳'
                          : 'KYC belum selesai 🔒',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  rejected
                      ? 'Perbaiki dokumen KYC Anda dulu sebelum mengajukan pinjaman.'
                      : pendingDocs
                          ? 'Dokumen Anda sedang diverifikasi tim Danaku. '
                              'Pengajuan pinjaman terbuka setelah KYC disetujui.'
                          : 'Verifikasi identitas dulu (NIK, KTP, selfie) agar '
                              'bisa mengajukan pinjaman.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context)
                      .textTheme
                      .bodyMedium
                      ?.copyWith(color: cs.onSurfaceVariant),
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: widget.onOpenKyc,
                  icon: const Icon(Icons.verified_user_outlined),
                  label: Text(rejected ? 'Ajukan ulang KYC' : 'Lengkapi KYC'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Ajukan Pinjaman')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ---- Nominal ----
          Text('Berapa dana yang dibutuhkan?',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Center(
            child: Text(
              rupiahText(_amountRounded),
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(color: cs.primary, fontWeight: FontWeight.w800),
            ),
          ),
          Slider(
            value: _amount.toDouble(),
            min: _minAmount.toDouble(),
            max: _maxAmount.toDouble(),
            divisions: ((_maxAmount - _minAmount) / 50000).round(),
            label: rupiahText(_amountRounded),
            onChanged: (v) => setState(() => _amount = v),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(rupiahText(_minAmount),
                  style: Theme.of(context).textTheme.bodySmall),
              Text(rupiahText(_maxAmount),
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [1000000, 3000000, 5000000, 10000000, 20000000]
                .map((v) => ChoiceChip(
                      label: Text(rupiahText(v)),
                      selected: _amountRounded == v,
                      onSelected: (_) => setState(() => _amount = v.toDouble()),
                    ))
                .toList(),
          ),
          const SizedBox(height: 24),

          // ---- Frekuensi + Tenor (v2.0) ----
          Text('Frekuensi pembayaran',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ChoiceChip(
                  label: const Text('📅 Mingguan'),
                  selected: _frequency == 'weekly',
                  onSelected: (_) => setState(() {
                    _frequency = 'weekly';
                    if (_tenor > 52) _tenor = 52;
                  }),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ChoiceChip(
                  label: const Text('🗓️ Bulanan'),
                  selected: _frequency == 'monthly',
                  onSelected: (_) => setState(() {
                    _frequency = 'monthly';
                    if (_tenor > 12) _tenor = 12;
                  }),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text('Pilih tenor ($_freqLabel)',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: _tenorOptions.map((t) {
              return ChoiceChip(
                label: Text('$t'),
                selected: _tenor == t,
                onSelected: (_) => setState(() => _tenor = t),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),

          // ---- Tujuan ----
          TextFormField(
            controller: _purpose,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Tujuan pinjaman',
              hintText: 'Contoh: modal usaha, renovasi rumah, pendidikan',
              prefixIcon: Icon(Icons.flag_outlined),
            ),
          ),
          const SizedBox(height: 24),

          // ---- Jaminan (v3.0) ----
          Text('Jaminan',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          TextFormField(
            controller: _collType,
            decoration: const InputDecoration(
              labelText: 'Jenis jaminan',
              hintText: 'Contoh: BPKB motor, sertifikat, emas',
              prefixIcon: Icon(Icons.shield_outlined),
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _collDetail,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Detail jaminan (opsional)',
              hintText: 'Contoh: BPKB Beat 2021 nopol D 1234 AB',
              prefixIcon: Icon(Icons.description_outlined),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Foto jaminan bisa dilampirkan di halaman detail pinjaman setelah pengajuan terkirim.',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 24),

          // ---- Preview ----
          Card(
            color: cs.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Text('Perkiraan cicilan / ${_frequency == 'weekly' ? 'minggu' : 'bulan'}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: cs.onPrimaryContainer)),
                  const SizedBox(height: 4),
                  Text(
                    rupiahText(_periodic),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          color: cs.onPrimaryContainer,
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '$_tenor $_freqLabel • total kembali ± ${rupiahText(_periodic * _tenor)}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: cs.onPrimaryContainer),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Simulasi bunga flat ${_rate.toStringAsFixed(0)}% per periode. Angka final '
            'ditetapkan sistem saat pinjaman disetujui.',
            textAlign: TextAlign.center,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded)
            ,
            label: Text(_busy ? 'Mengirim...' : 'Ajukan sekarang'),
          ),
        ],
      ),
    );
  }
}
