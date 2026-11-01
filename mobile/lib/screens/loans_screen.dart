import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// Tab Pinjaman: daftar pinjaman milik user + badge status.
class LoansScreen extends StatefulWidget {
  const LoansScreen({super.key});

  @override
  State<LoansScreen> createState() => _LoansScreenState();
}

class _LoansScreenState extends State<LoansScreen> {
  final _svc = SupabaseService.instance;
  List<Loan>? _loans;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final loans = await _svc.fetchMyLoans();
      if (!mounted) return;
      setState(() {
        _loans = loans;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pinjaman Saya'),
        actions: [
          IconButton(onPressed: _load, icon: const Icon(Icons.refresh_rounded)),
        ],
      ),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_error != null) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Card(
              child: ListTile(
                leading: Icon(Icons.error_outline_rounded,
                    color: Theme.of(context).colorScheme.error),
                title: const Text('Gagal memuat data'),
                subtitle: Text(_error!),
                onTap: _load,
              ),
            ),
          ),
        ],
      );
    }
    if (_loans == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loans!.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.receipt_long_outlined,
                  size: 72, color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text('Belum ada pinjaman',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(
                'Ajukan pinjaman pertama Anda di tab Ajukan.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: () => Future<void>(_load),
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _loans!.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final loan = _loans![i];
          return _LoanCard(loan: loan);
        },
      ),
    );
  }
}

class _LoanCard extends StatelessWidget {
  const _LoanCard({required this.loan});

  final Loan loan;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => LoanDetailScreen(loanId: loan.id),
          ));
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      rupiahText(loan.amount),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: cs.primary,
                          ),
                    ),
                  ),
                  StatusChip(status: loan.status),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Cicilan ${rupiahText(loan.monthlyPayment)} x ${loan.tenorMonths} bulan'
                ' • bunga ${loan.interestRate.toStringAsFixed(0)}%',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              if (loan.purpose.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  'Tujuan: ${loan.purpose}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: cs.onSurfaceVariant),
                ),
              ],
              const SizedBox(height: 8),
              Text(
                'Diajukan ${dateTimeFormat.format(loan.createdAt.toLocal())}',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: cs.onSurfaceVariant),
              ),
              if (loan.status == 'rejected' &&
                  (loan.rejectReason?.isNotEmpty ?? false)) ...[
                const SizedBox(height: 8),
                Text(
                  'Alasan penolakan: ${loan.rejectReason}',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: cs.error),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Detail pinjaman + jadwal cicilan (installments) dengan status per angsuran.
class LoanDetailScreen extends StatefulWidget {
  const LoanDetailScreen({super.key, required this.loanId});

  final String loanId;

  @override
  State<LoanDetailScreen> createState() => _LoanDetailScreenState();
}

class _LoanDetailScreenState extends State<LoanDetailScreen> {
  final _svc = SupabaseService.instance;
  Loan? _loan;
  List<Installment>? _installments;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final loan = await _svc.fetchLoan(widget.loanId);
      final inst = await _svc.fetchInstallments(widget.loanId);
      if (!mounted) return;
      setState(() {
        _loan = loan;
        _installments = inst;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Detail Pinjaman')),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: Icon(Icons.error_outline_rounded,
                  color: Theme.of(context).colorScheme.error),
              title: const Text('Gagal memuat data'),
              subtitle: Text(_error!),
              onTap: _load,
            ),
          ),
        ],
      );
    }
    if (_loan == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final loan = _loan!;
    final cs = Theme.of(context).colorScheme;
    final insts = _installments ?? const [];
    final paid = insts.where((e) => e.status == 'paid').length;
    // v2.0: total tagihan = pokok + bunga + denda; bayar = sum amount_paid (parsial ikut)
    final totalTagihan = loan.amount +
        ((loan.amount * loan.interestRate / 100).round()) +
        loan.lateFee;
    final totalBayar =
        insts.fold<int>(0, (s, e) => s + e.amountPaid);
    final sisa = (totalTagihan - totalBayar).clamp(0, totalTagihan);
    final progress =
        totalTagihan == 0 ? 0.0 : (totalBayar / totalTagihan).clamp(0.0, 1.0);
    final freqLabel = loan.frequency == 'weekly' ? 'minggu' : 'bulan';

    return RefreshIndicator(
      onRefresh: () => Future<void>(_load),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: cs.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(rupiahText(loan.amount),
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  color: cs.onPrimaryContainer)),
                      StatusChip(status: loan.status),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Cicilan ${rupiahText(loan.monthlyPayment)}/$freqLabel',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: cs.onPrimaryContainer,
                        fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  // Ringkasan bayar (v2.0): sudah bayar vs sisa
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: cs.onPrimaryContainer.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Sudah dibayar',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                        color: cs.onPrimaryContainer)),
                            Text(rupiahText(totalBayar),
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                        color: Colors.green.shade100,
                                        fontWeight: FontWeight.w800)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Sisa hutang',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                        color: cs.onPrimaryContainer)),
                            Text(rupiahText(sisa),
                                style: Theme.of(context)
                                    .textTheme
                                    .titleMedium
                                    ?.copyWith(
                                        color: cs.onPrimaryContainer,
                                        fontWeight: FontWeight.w800)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Informasi',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  InfoRow(
                    label: 'Status',
                    value: StatusChip(status: loan.status),
                  ),
                  InfoRow(
                    label: 'Tenor',
                    value: Text(
                        '${loan.tenorMonths} ${loan.frequency == 'weekly' ? 'minggu' : 'bulan'} (${loan.frequencyLabel})'),
                  ),
                  InfoRow(
                    label: 'Bunga (flat)',
                    value: Text(
                        '${loan.interestRate.toStringAsFixed(2)}% per periode'),
                  ),
                  InfoRow(
                    label: 'Cicilan/${loan.frequency == 'weekly' ? 'minggu' : 'bulan'}',
                    value: Text(rupiahText(loan.monthlyPayment)),
                  ),
                  InfoRow(
                    label: 'Total tagihan',
                    value: Text(
                        '${rupiahText(totalTagihan)} (pokok + bunga${loan.lateFee > 0 ? ' + denda' : ''})'),
                  ),
                  InfoRow(
                    label: 'Sudah dibayar',
                    value: Text(rupiahText(totalBayar)),
                  ),
                  InfoRow(
                    label: 'Sisa hutang',
                    value: Text(rupiahText(sisa)),
                  ),
                  InfoRow(
                    label: 'Tujuan',
                    value: Text(
                        loan.purpose.isEmpty ? '-' : loan.purpose),
                  ),
                  InfoRow(
                    label: 'Diajukan',
                    value: Text(
                        dateTimeFormat.format(loan.createdAt.toLocal())),
                  ),
                  if (loan.status == 'rejected' &&
                      (loan.rejectReason?.isNotEmpty ?? false))
                    InfoRow(
                      label: 'Alasan ditolak',
                      value: Text(loan.rejectReason!,
                          style: TextStyle(color: cs.error)),
                    ),
                ],
              ),
            ),
          ),

          // ---- Jadwal cicilan ----
          const SizedBox(height: 8),
          Text('Jadwal Cicilan',
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (insts.isEmpty)
            Card(
              child: ListTile(
                leading: Icon(Icons.schedule_rounded, color: cs.onSurfaceVariant),
                title: const Text('Jadwal belum tersedia'),
                subtitle: const Text(
                    'Jadwal cicilan dibuat otomatis setelah pinjaman disetujui & dicairkan.'),
              ),
            )
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Terbayar $paid dari ${insts.length} angsuran'),
                        Text(
                          '${rupiahText(totalBayar)} / ${rupiahText(totalTagihan)}',
                          style:
                              Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    LinearProgressIndicator(value: progress),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            ...insts.map(
              (ins) => Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: cs.primary.withValues(alpha: 0.12),
                    child: Text(
                      '${ins.seq}',
                      style: TextStyle(
                          color: cs.primary, fontWeight: FontWeight.w700),
                    ),
                  ),
                  title: Text(rupiahText(ins.amount)),
                  subtitle: Text(
                      'Jatuh tempo ${dateFormat.format(ins.dueDate)}'
                      '${ins.amountPaid > 0 && ins.status != 'paid' ? ' • terbayar ${rupiahText(ins.amountPaid)}, sisa ${rupiahText(ins.remaining)}' : ''}'),
                  trailing: StatusChip(status: ins.status),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
