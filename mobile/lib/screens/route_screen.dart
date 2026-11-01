import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// FR-P1/P2/P3 — Rute tagihan petugas: daftar cicilan unpaid milik nasabah
/// dalam rute + input bayar TUNAI (penuh/parsial) + tandai nunggak.
/// Dipakai hanya untuk role petugas (dicabang dari root_shell).
class RouteScreen extends StatefulWidget {
  const RouteScreen({super.key});

  @override
  State<RouteScreen> createState() => _RouteScreenState();
}

class _RouteScreenState extends State<RouteScreen> {
  final _svc = SupabaseService.instance;

  List<RouteTask>? _tasks;
  String? _error;
  bool _loading = true;
  final Set<String> _busyIds = {};

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
      _tasks = await _svc.fetchRouteTasks();
    } catch (e) {
      _error = e.toString();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _isOverdue(RouteTask t) =>
      t.installment.dueDate.isBefore(DateTime.now()) &&
      t.installment.status != 'paid';

  Future<void> _payDialog(RouteTask t) async {
    final sisa = t.installment.remaining;
    final ctrl = TextEditingController(text: '$sisa');
    var isFull = true;
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setD) => AlertDialog(
          title: Text('Terima tunai — ${t.borrowerName}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Cicilan ke-${t.installment.seq} • jatuh tempo ${dateFormat.format(t.installment.dueDate)}\n'
                'Nominal cicilan: ${rupiahText(t.installment.amount)}\n'
                'Sudah terkumpul: ${rupiahText(t.installment.amountPaid)}\n'
                'Sisa: ${rupiahText(sisa)}',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  ChoiceChip(
                    label: const Text('Lunas'),
                    selected: isFull,
                    onSelected: (_) {
                      setD(() {
                        isFull = true;
                        ctrl.text = '$sisa';
                      });
                    },
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Sebagian'),
                    selected: !isFull,
                    onSelected: (_) => setD(() => isFull = false),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: ctrl,
                keyboardType: TextInputType.number,
                enabled: !isFull,
                decoration: const InputDecoration(
                  labelText: 'Nominal diterima (Rp)',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: note,
                decoration: const InputDecoration(
                  labelText: 'Catatan (opsional)',
                  hintText: 'cth: bayar di warung',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ],
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

    final nominal =
        int.tryParse(ctrl.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
    if (nominal <= 0) {
      if (mounted) showError(context, 'Nominal harus lebih dari 0.');
      return;
    }
    if (nominal > sisa) {
      if (mounted) {
        showError(context, 'Nominal melebihi sisa Rp${rupiahText(sisa)}.');
      }
      return;
    }

    setState(() => _busyIds.add(t.installment.id));
    try {
      await _svc.recordCashPayment(
        installmentId: t.installment.id,
        amount: nominal,
        note: note.text.trim().isEmpty ? 'Tunai lapangan' : note.text.trim(),
      );
      if (!mounted) return;
      showInfo(context, 'Pembayaran ${rupiahText(nominal)} tercatat. Mantap! 💪');
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busyIds.remove(t.installment.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Rute Hari Ini 🛵')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final tasks = _tasks ?? [];
    // nunggak (lewat due) di atas
    tasks.sort((a, b) {
      final ao = _isOverdue(a) ? 0 : 1;
      final bo = _isOverdue(b) ? 0 : 1;
      if (ao != bo) return ao.compareTo(bo);
      return a.installment.dueDate.compareTo(b.installment.dueDate);
    });
    final overdueCount = tasks.where(_isOverdue).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rute Hari Ini 🛵'),
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
        child: _error != null
            ? ListView(
                padding: const EdgeInsets.all(24),
                children: [
                  Text('Gagal memuat rute: $_error',
                      style: TextStyle(color: cs.error)),
                ],
              )
            : tasks.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: const [
                      SizedBox(height: 60),
                      Icon(Icons.check_circle_outline_rounded,
                          size: 64, color: Colors.green),
                      SizedBox(height: 16),
                      Text(
                        'Rute bersih! 🎉\nTidak ada tagihan untuk hari ini.',
                        textAlign: TextAlign.center,
                      ),
                    ],
                  )
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: tasks.length + 1,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, i) {
                      if (i == 0) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            '${tasks.length} tagihan • $overdueCount nunggak',
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium
                                ?.copyWith(
                                  color: cs.onSurfaceVariant,
                                  fontWeight: FontWeight.w600,
                                ),
                          ),
                        );
                      }
                      final t = tasks[i - 1];
                      final overdue = _isOverdue(t);
                      final busy = _busyIds.contains(t.installment.id);
                      return Card(
                        color: overdue
                            ? cs.errorContainer.withValues(alpha: 0.35)
                            : null,
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: overdue
                                ? cs.error
                                : cs.primary,
                            child: Text(
                              '${t.installment.seq}',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold),
                            ),
                          ),
                          title: Text(
                            t.borrowerName,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  '${t.borrowerAddress} • ${t.borrowerPhone}'),
                              const SizedBox(height: 2),
                              Text(
                                '${t.frequency == 'weekly' ? 'Mingguan' : 'Bulanan'} • '
                                'Jatuh tempo ${dateFormat.format(t.installment.dueDate)}'
                                '${t.installment.amountPaid > 0 ? ' • terkumpul ${rupiahText(t.installment.amountPaid)}' : ''}',
                                style: TextStyle(
                                  color: overdue ? cs.error : null,
                                  fontWeight: overdue
                                      ? FontWeight.w600
                                      : FontWeight.normal,
                                ),
                              ),
                              Text(
                                'Sisa: ${rupiahText(t.installment.remaining)} '
                                'dari ${rupiahText(t.installment.amount)}',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                          isThreeLine: true,
                          trailing: busy
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2),
                                )
                              : FilledButton(
                                  onPressed: () => _payDialog(t),
                                  child: const Text('Terima'),
                                ),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}
