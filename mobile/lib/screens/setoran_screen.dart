import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// FR-P5/P6 — Rekap setoran harian petugas + riwayat pembayaran yang diinput.
/// Dipakai hanya untuk role petugas (dicabang dari root_shell).
class SetoranScreen extends StatefulWidget {
  const SetoranScreen({super.key});

  @override
  State<SetoranScreen> createState() => _SetoranScreenState();
}

class _SetoranScreenState extends State<SetoranScreen> {
  final _svc = SupabaseService.instance;

  List<Payment>? _items;
  String? _error;
  bool _loading = true;

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
      _items = await _svc.fetchPaymentsToday();
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Dialog koreksi salah input (reversal beraudit, alasan wajib).
  /// Opsional: isi nominal benar → koreksi + catat benar sekaligus (atomic).
  Future<void> _voidDialog(Payment p) async {
    final reason = TextEditingController();
    final correct = TextEditingController();
    var includeCorrect = false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setD) => AlertDialog(
          title: const Text('Koreksi transaksi?'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${rupiahText(p.amount)} • ${dateTimeFormat.format(p.paidAt.toLocal())}'
                  '${p.note.isNotEmpty ? '\n“${p.note}”' : ''}',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Transaksi TIDAK dihapus — sistem mencatat koreksi lawan '
                  'supaya jejak audit utuh.',
                  style: TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: reason,
                  decoration: const InputDecoration(
                    labelText: 'Alasan koreksi (wajib)',
                    hintText: 'cth: salah input, harusnya 50rb',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Checkbox(
                      value: includeCorrect,
                      onChanged: (v) =>
                          setD(() => includeCorrect = v ?? false),
                    ),
                    const Expanded(
                      child: Text(
                        'Langsung catat nominal yang benar',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
                if (includeCorrect)
                  TextField(
                    controller: correct,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Nominal yang benar (Rp)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Batal'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
    if (ok != true) return;
    if (reason.text.trim().isEmpty) {
      if (mounted) showError(context, 'Alasan koreksi wajib diisi.');
      return;
    }
    int correctAmount = 0;
    if (includeCorrect) {
      correctAmount =
          int.tryParse(correct.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
      if (correctAmount <= 0) {
        if (mounted) {
          showError(context, 'Nominal yang benar harus lebih dari 0.');
        }
        return;
      }
    }
    try {
      if (includeCorrect) {
        await _svc.voidAndRepay(
          paymentId: p.id,
          reason: reason.text,
          correctAmount: correctAmount,
          correctNote: 'koreksi + input benar',
        );
      } else {
        await _svc.voidPayment(paymentId: p.id, reason: reason.text);
      }
      if (!mounted) return;
      showInfo(context, 'Koreksi tercatat. Jejak audit aman. ✅');
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Setoran Hari Ini 💰')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final items = _items ?? [];
    final total = items.fold<int>(0, (s, p) => s + p.amount);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Setoran Hari Ini 💰'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: _load,
            tooltip: 'Muat ulang',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              color: cs.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text(
                      'Total tunai dibawa hari ini',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: cs.onPrimaryContainer),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      rupiahText(total),
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(
                            color: cs.onPrimaryContainer,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${items.length} transaksi • ${dateFormat.format(DateTime.now())}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: cs.onPrimaryContainer),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_error != null)
              Text('Gagal memuat: $_error',
                  style: TextStyle(color: cs.error)),
            if (items.isEmpty && _error == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Text(
                  'Belum ada setoran hari ini.\nMulai keliling dari menu Rute! 🛵',
                  textAlign: TextAlign.center,
                ),
              ),
            ...items.map((p) => Card(
                  child: ListTile(
                    leading: Icon(
                      p.amount < 0
                          ? Icons.undo_rounded
                          : Icons.payments_outlined,
                      color: p.amount < 0 ? cs.error : null,
                    ),
                    title: Text(
                      rupiahText(p.amount),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: p.amount < 0 ? cs.error : null,
                      ),
                    ),
                    subtitle: Text(
                      '${dateTimeFormat.format(p.paidAt.toLocal())}'
                      '${p.note.isNotEmpty ? ' • ${p.note}' : ''}',
                    ),
                    // koreksi hanya untuk transaksi positif (bukan baris koreksi)
                    trailing: p.amount > 0
                        ? TextButton(
                            onPressed: () => _voidDialog(p),
                            child: const Text('Koreksi'),
                          )
                        : null,
                  ),
                )),
            const SizedBox(height: 16),
            Text(
              'Rekap ini untuk dicocokkan dengan uang tunai saat setor ke owner. '
              'Pastikan jumlahnya sama ya! 🤝',
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: cs.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
