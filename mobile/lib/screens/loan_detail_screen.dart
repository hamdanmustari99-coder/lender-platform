import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../format.dart';
import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';

/// Detail pinjaman + jadwal cicilan + catat pembayaran tunai.
class LoanDetailScreen extends StatefulWidget {
  const LoanDetailScreen({super.key, required this.loanId});

  final String loanId;

  @override
  State<LoanDetailScreen> createState() => _LoanDetailScreenState();
}

class _LoanDetailScreenState extends State<LoanDetailScreen> {
  final _api = ApiService.instance;

  Loan? _loan;
  List<Installment> _insts = [];
  List<Payment> _payments = [];
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
      final results = await Future.wait([
        _api.fetchLoan(widget.loanId),
        _api.fetchInstallments(widget.loanId),
        _api.fetchPaymentsForLoan(widget.loanId),
      ]);
      if (!mounted) return;
      setState(() {
        _loan = results[0] as Loan;
        _insts = results[1] as List<Installment>;
        _payments = results[2] as List<Payment>;
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

  int get _sisaTotal => _insts.where((i) => !i.isPaid).fold(0, (a, i) => a + i.sisa);

  int get _terbayar => _insts.fold(0, (a, i) => a + i.amountPaid);

  @override
  Widget build(BuildContext context) {
    final loan = _loan;

    return Scaffold(
      appBar: AppBar(title: const Text('Detail Pinjaman')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_error!, textAlign: TextAlign.center),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _headerCard(loan!),
                      const SizedBox(height: 16),
                      _ringkasanCard(),
                      const SizedBox(height: 20),
                      const Text('Jadwal Cicilan',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      ..._insts.map(_installmentTile),
                      const SizedBox(height: 20),
                      const Text('Riwayat Pembayaran',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      if (_payments.isEmpty)
                        Text('Belum ada pembayaran.',
                            style: TextStyle(
                                fontSize: 12, color: Colors.grey.shade500))
                      else
                        Card(
                          child: Column(
                            children: [
                              for (final p in _payments)
                                ListTile(
                                  dense: true,
                                  leading: const Icon(Icons.receipt_long,
                                      size: 18),
                                  title: Text(Fmt.rupiah(p.amount),
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 13)),
                                  subtitle: Text(Fmt.tanggalJam(p.paidAt),
                                      style: const TextStyle(fontSize: 11)),
                                  trailing: p.note?.isNotEmpty ?? false
                                      ? ConstrainedBox(
                                          constraints:
                                              const BoxConstraints(maxWidth: 110),
                                          child: Text(
                                            p.note!,
                                            textAlign: TextAlign.end,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                                fontSize: 10,
                                                color: Colors.grey.shade500),
                                          ),
                                        )
                                      : null,
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
      floatingActionButton: _loading || _error != null
          ? null
          : FloatingActionButton.extended(
              onPressed: _formCatatPembayaran,
              icon: const Icon(Icons.add),
              label: const Text('Catat Bayar'),
            ),
    );
  }

  Widget _headerCard(Loan loan) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                InitialAvatar(loan.profile?.initials ?? '?'),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(loan.nasabahName,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text(
                        loan.profile?.nik != null
                            ? 'NIK ${Fmt.nik(loan.profile!.nik)}'
                            : 'NIK belum diisi',
                        style: TextStyle(
                            fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                StatusChip(
                  loanStatusLabel(loan.status),
                  color: StatusChip.forLoan(loan.status),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Text(
              Fmt.rupiah(loan.amount),
              style: const TextStyle(
                  fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 2),
            Text(
              '${loanFrequencyLabel(loan.frequency)} • ${Fmt.tenorLabel(loan.tenorMonths, loan.frequency.name)} • bunga ${loan.interestRate}%',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 12),
            ContactButtons(loan.profile?.phone),
          ],
        ),
      ),
    );
  }

  Widget _ringkasanCard() {
    final total = _insts.fold<int>(0, (a, i) => a + i.amount);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            _stat('Total tagihan', Fmt.rupiahCompact(total)),
            _stat('Terbayar', Fmt.rupiahCompact(_terbayar)),
            _stat('Sisa', Fmt.rupiahCompact(_sisaTotal)),
          ],
        ),
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Expanded(
      child: Column(
        children: [
          Text(value,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 2),
          Text(label,
              style:
                  TextStyle(fontSize: 10, color: Colors.grey.shade500)),
        ],
      ),
    );
  }

  Widget _installmentTile(Installment i) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: i.isPaid ? null : () => _formCatatPembayaran(preset: i),
        leading: CircleAvatar(
          radius: 16,
          backgroundColor: StatusChip.forInstallment(i.status)
              .withValues(alpha: 0.14),
          child: Text(
            '${i.seq}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: StatusChip.forInstallment(i.status),
            ),
          ),
        ),
        title: Text('${Fmt.rupiah(i.amount)}',
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700)),
        subtitle: Text(
          i.isPaid
              ? 'Lunas ${Fmt.tanggal(i.paidAt)}'
              : 'Jatuh tempo ${Fmt.tanggal(i.dueDate)} • sisa ${Fmt.rupiah(i.sisa)}',
          style: const TextStyle(fontSize: 11),
        ),
        trailing: StatusChip(
          installmentStatusLabel(i.status),
          color: StatusChip.forInstallment(i.status),
        ),
      ),
    );
  }

  // ---------- form catat pembayaran ----------

  Future<void> _formCatatPembayaran({Installment? preset}) async {
    final target = preset ?? _insts.firstWhere(
      (i) => !i.isPaid,
      orElse: () => _insts.last,
    );
    if (target.isPaid) {
      _toast('Semua cicilan sudah lunas.');
      return;
    }

    final nominalCtl = TextEditingController(
      text: target.sisa.toString(),
    );
    final noteCtl = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 8,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Catat pembayaran — cicilan #${target.seq}',
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  'Sisa cicilan ${Fmt.rupiah(target.sisa)} • jatuh tempo ${Fmt.tanggal(target.dueDate)}',
                  style:
                      TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: nominalCtl,
                  keyboardType: TextInputType.number,
                  autofocus: true,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Nominal diterima (Rp)',
                    prefixText: 'Rp ',
                  ),
                  validator: (v) {
                    final n = int.tryParse(v ?? '');
                    if (n == null || n <= 0) return 'Nominal harus lebih dari 0';
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: noteCtl,
                  decoration: const InputDecoration(
                    labelText: 'Catatan (opsional)',
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: () async {
                    if (!formKey.currentState!.validate()) return;
                    final n = int.parse(nominalCtl.text);
                    if (n > target.sisa) {
                      _toast('Nominal melebihi sisa cicilan ini.');
                      return;
                    }
                    try {
                      await _api.recordCashPayment(
                        target.id,
                        n,
                        note: noteCtl.text.trim(),
                      );
                      if (ctx.mounted) Navigator.of(ctx).pop(true);
                    } catch (e) {
                      _toast('Gagal: ${_short(e)}');
                    }
                  },
                  child: const Text('Simpan Pembayaran'),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (ok == true) {
      _toast('Pembayaran tercatat.');
      await _load();
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg)),
    );
  }

  String _short(Object e) {
    final s = e.toString().replaceFirst('PostgrestException: ', '');
    return s.length > 140 ? '${s.substring(0, 140)}…' : s;
  }
}
