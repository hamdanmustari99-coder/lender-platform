import 'package:flutter/material.dart';

import '../../format.dart';
import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';
import 'loan_detail_screen.dart';

/// Daftar pinjaman dengan pencarian + filter status.
class LoansScreen extends StatefulWidget {
  const LoansScreen({super.key});

  @override
  State<LoansScreen> createState() => _LoansScreenState();
}

class _LoansScreenState extends State<LoansScreen> {
  final _api = ApiService.instance;
  final _search = TextEditingController();

  List<Loan> _all = [];
  List<Loan> _shown = [];
  bool _loading = true;
  String? _error;
  LoanStatus? _filter;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final loans = await _api.fetchLoans();
      if (!mounted) return;
      setState(() {
        _all = loans;
        _loading = false;
      });
      _apply();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _apply() {
    final q = _search.text.trim().toLowerCase();
    setState(() {
      _shown = _all.where((l) {
        if (_filter != null && l.status != _filter) return false;
        if (q.isEmpty) return true;
        return l.nasabahName.toLowerCase().contains(q) ||
            (l.profile?.nik?.contains(q) ?? false) ||
            (l.purpose?.toLowerCase().contains(q) ?? false);
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: SearchBar(
            controller: _search,
            hintText: 'Cari nama / NIK / tujuan…',
            leading: const Icon(Icons.search, size: 20),
            trailing: [
              if (_search.text.isNotEmpty)
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () {
                    _search.clear();
                    _apply();
                  },
                ),
            ],
            onChanged: (_) => _apply(),
          ),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              _chip('Semua', null),
              const SizedBox(width: 6),
              _chip('Berjalan', LoanStatus.active),
              const SizedBox(width: 6),
              _chip('Baru cair', LoanStatus.disbursed),
              const SizedBox(width: 6),
              _chip('Lunas', LoanStatus.completed),
              const SizedBox(width: 6),
              _chip('Telat', null, overdue: true),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? ListView(
                        children: [
                          const SizedBox(height: 80),
                          Center(
                            child: Text(_error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 12)),
                          ),
                        ],
                      )
                    : _shown.isEmpty
                        ? ListView(
                            children: const [
                              SizedBox(height: 80),
                              Center(
                                child: Text('Tidak ada pinjaman yang cocok.'),
                              ),
                            ],
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                            itemCount: _shown.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (_, i) => _loanCard(_shown[i]),
                          ),
          ),
        ),
      ],
    );
  }

  Widget _chip(String label, LoanStatus? status, {bool overdue = false}) {
    final active = overdue ? _overdueFilter : _filter == status;
    return FilterChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      selected: active,
      onSelected: (_) {
        setState(() {
          if (overdue) {
            _overdueFilter = !_overdueFilter;
          } else {
            _overdueFilter = false;
            _filter = _filter == status ? null : status;
          }
        });
        _apply();
      },
    );
  }

  bool _overdueFilter = false;

  Widget _loanCard(Loan l) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => LoanDetailScreen(loanId: l.id),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  InitialAvatar(l.profile?.initials ?? '?', size: 38),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l.nasabahName,
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${Fmt.rupiah(l.amount)} • ${Fmt.tenorLabel(l.tenorMonths, l.frequency.name)}',
                          style: TextStyle(
                              fontSize: 11, color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  ),
                  StatusChip(
                    loanStatusLabel(l.status),
                    color: StatusChip.forLoan(l.status),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  _stat('Cicilan', Fmt.rupiahCompact(l.monthlyPayment)),
                  _stat('Bunga', '${l.interestRate}%'),
                  _stat('Cair', Fmt.tanggal(l.createdAt)),
                ],
              ),
              if (l.purpose?.isNotEmpty ?? false) ...[
                const SizedBox(height: 8),
                Text(
                  l.purpose!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 11, color: Colors.grey.shade500),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value,
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700)),
          Text(label,
              style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
        ],
      ),
    );
  }
}
