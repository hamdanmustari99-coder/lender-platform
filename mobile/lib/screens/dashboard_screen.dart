import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';
import '../../format.dart';
import 'loan_detail_screen.dart';

/// Beranda: ringkasan kas + setoran hari ini + pinjaman terbaru.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key, required this.onLihatPinjaman});

  final VoidCallback onLihatPinjaman;

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _api = ApiService.instance;

  LaporanRingkasan? _ringkasan;
  List<Payment> _paymentsToday = [];
  List<Loan> _loansTerbaru = [];
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
        _api.fetchRingkasan(),
        _api.fetchPaymentsToday(),
        _api.fetchLoans(limit: 6),
      ]);
      if (!mounted) return;
      setState(() {
        _ringkasan = results[0] as LaporanRingkasan;
        _paymentsToday = results[1] as List<Payment>;
        _loansTerbaru = results[2] as List<Loan>;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _humanError(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final masuk = _paymentsToday.fold<int>(0, (a, p) => a + p.amount);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) _errorBox(_error!, _load),
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(top: 80),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            _kasCard(masuk),
            const SizedBox(height: 16),
            _sectionTitle('Setoran hari ini', '${_paymentsToday.length} transaksi'),
            const SizedBox(height: 8),
            if (_paymentsToday.isEmpty)
              _empty('Belum ada pembayaran hari ini.')
            else
              Card(
                child: Column(
                  children: [
                    for (final p in _paymentsToday.take(5))
                      ListTile(
                        dense: true,
                        leading: const Icon(Icons.south_west, size: 18),
                        title: Text(Fmt.rupiah(p.amount),
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 13)),
                        subtitle: Text(Fmt.jam(p.paidAt),
                            style: const TextStyle(fontSize: 11)),
                        trailing: Text(
                          (p.note?.isNotEmpty ?? false) ? p.note! : '',
                          style: TextStyle(
                              fontSize: 10, color: Colors.grey.shade500),
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(child: _sectionTitle('Pinjaman terbaru', '')),
                TextButton(
                  onPressed: widget.onLihatPinjaman,
                  child: const Text('Lihat semua'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            for (final l in _loansTerbaru)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _loanMiniCard(l),
              ),
          ],
        ],
      ),
    );
  }

  Widget _kasCard(int masuk) {
    final r = _ringkasan;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.brand, AppTheme.brandDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Kas masuk hari ini',
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withValues(alpha: 0.8),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            Fmt.rupiah(masuk),
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              _kasStat('Sisa piutang', Fmt.rupiahCompact(r?.totalPiutang ?? 0)),
              _kasStat('Pokok berjalan', Fmt.rupiahCompact(r?.totalPinjaman ?? 0)),
              _kasStat('Nasabah aktif', '${r?.nasabahAktif ?? 0}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kasStat(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: Colors.white.withValues(alpha: 0.75),
            ),
          ),
        ],
      ),
    );
  }

  Widget _loanMiniCard(Loan l) {
    return Card(
      child: ListTile(
        onTap: () => _bukaDetail(l),
        leading: InitialAvatar(l.profile?.initials ?? '?'),
        title: Text(
          l.nasabahName,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          '${Fmt.rupiahCompact(l.amount)} • ${Fmt.tenorLabel(l.tenorMonths, l.frequency.name)}',
          style: const TextStyle(fontSize: 11),
        ),
        trailing: StatusChip(
          loanStatusLabel(l.status),
          color: StatusChip.forLoan(l.status),
        ),
      ),
    );
  }

  void _bukaDetail(Loan l) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => LoanDetailScreen(loanId: l.id)),
    );
  }
}

String _humanError(Object e) {
  final s = e.toString();
  return s.length > 160 ? '${s.substring(0, 160)}…' : s;
}

Widget _sectionTitle(String title, String trailing) => Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
        if (trailing.isNotEmpty)
          Text(trailing,
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
      ],
    );

Widget _empty(String text) => Container(
      padding: const EdgeInsets.symmetric(vertical: 28),
      alignment: Alignment.center,
      child: Text(text,
          style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
    );

Widget _errorBox(String msg, VoidCallback retry) => Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18, color: AppTheme.danger),
          const SizedBox(width: 8),
          Expanded(
            child: Text(msg,
                style: const TextStyle(fontSize: 12, color: AppTheme.danger)),
          ),
          TextButton(onPressed: retry, child: const Text('Ulangi')),
        ],
      ),
    );
