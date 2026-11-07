import 'package:flutter/material.dart';

import '../../format.dart';
import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';

/// Setoran harian — pembayaran valid hari ini (WIB), void sudah dibuang.
class SetoranScreen extends StatefulWidget {
  const SetoranScreen({super.key});

  @override
  State<SetoranScreen> createState() => _SetoranScreenState();
}

class _SetoranScreenState extends State<SetoranScreen> {
  final _api = ApiService.instance;

  List<Payment> _rows = [];
  List<Loan> _loans = [];
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
        _api.fetchPaymentsToday(),
        _api.fetchLoans(limit: 200),
      ]);
      if (!mounted) return;
      setState(() {
        _rows = results[0] as List<Payment>;
        _loans = results[1] as List<Loan>;
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

  String _namaNasabah(String? nasabahId) {
    if (nasabahId == null) return '-';
    for (final l in _loans) {
      if (l.userId == nasabahId) return l.nasabahName;
    }
    return '-';
  }

  @override
  Widget build(BuildContext context) {
    final total = _rows.fold<int>(0, (a, p) => a + p.amount);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppTheme.brand,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Total setoran hari ini',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  Fmt.rupiah(total),
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${_rows.length} transaksi • ${Fmt.tanggal(DateTime.now().toIso8601String())}',
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.white.withValues(alpha: 0.75),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Text(_error!, style: const TextStyle(fontSize: 12))
          else if (_rows.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 40),
              child: Center(
                child: Text(
                  'Belum ada pembayaran hari ini.',
                  style: TextStyle(
                      fontSize: 12, color: Colors.grey.shade500),
                ),
              ),
            )
          else
            for (final p in _rows)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    radius: 18,
                    backgroundColor:
                        AppTheme.accent.withValues(alpha: 0.14),
                    child: const Icon(Icons.south_west,
                        size: 18, color: AppTheme.accent),
                  ),
                  title: Text(
                    Fmt.rupiah(p.amount),
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    '${_namaNasabah(p.nasabahId)} • ${Fmt.jam(p.paidAt)}',
                    style: const TextStyle(fontSize: 11),
                  ),
                  trailing: p.note?.isNotEmpty ?? false
                      ? ConstrainedBox(
                          constraints:
                              const BoxConstraints(maxWidth: 100),
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
              ),
        ],
      ),
    );
  }
}
