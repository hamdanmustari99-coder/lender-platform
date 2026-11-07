import 'package:flutter/material.dart';

import '../../format.dart';
import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';
import 'loan_detail_screen.dart';

/// Detail nasabah: data KTP, kontak darurat, dan pinjaman miliknya.
class NasabahDetailScreen extends StatefulWidget {
  const NasabahDetailScreen({super.key, required this.userId});

  final String userId;

  @override
  State<NasabahDetailScreen> createState() => _NasabahDetailScreenState();
}

class _NasabahDetailScreenState extends State<NasabahDetailScreen> {
  final _api = ApiService.instance;

  Profile? _p;
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
        _api.fetchNasabahById(widget.userId),
        _api.fetchLoans(limit: 200),
      ]);
      if (!mounted) return;
      final all = results[1] as List<Loan>;
      setState(() {
        _p = results[0] as Profile;
        _loans = all.where((l) => l.userId == widget.userId).toList();
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
    final p = _p;
    return Scaffold(
      appBar: AppBar(title: const Text('Detail Nasabah')),
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
                      _identitasCard(p!),
                      const SizedBox(height: 12),
                      _kontakCard(p),
                      const SizedBox(height: 12),
                      _dataKtpCard(p),
                      const SizedBox(height: 20),
                      Text('Pinjaman (${_loans.length})',
                          style: const TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      if (_loans.isEmpty)
                        Text('Belum ada pinjaman.',
                            style: TextStyle(
                                fontSize: 12, color: Colors.grey.shade500))
                      else
                        for (final l in _loans)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Card(
                              child: ListTile(
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        LoanDetailScreen(loanId: l.id),
                                  ),
                                ),
                                title: Text(Fmt.rupiah(l.amount),
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                  '${loanFrequencyLabel(l.frequency)} • ${Fmt.tenorLabel(l.tenorMonths, l.frequency.name)} • ${Fmt.tanggal(l.createdAt)}',
                                  style: const TextStyle(fontSize: 11),
                                ),
                                trailing: StatusChip(
                                  loanStatusLabel(l.status),
                                  color: StatusChip.forLoan(l.status),
                                ),
                              ),
                            ),
                          ),
                    ],
                  ),
                ),
    );
  }

  Widget _identitasCard(Profile p) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                InitialAvatar(p.initials, size: 50),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.fullName.isEmpty ? '(tanpa nama)' : p.fullName,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          StatusChip(
                            kycStatusLabel(p.kycStatus),
                            color: StatusChip.forKyc(p.kycStatus),
                          ),
                          const SizedBox(width: 6),
                          StatusChip(
                            statusKeandalanLabel(p.statusKeandalan),
                            color: _warnaKeandalan(p.statusKeandalan),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            ContactButtons(
              p.phone,
              pesan: 'Selamat siang, kami dari SW Finance mengenai pinjaman Bapak/Ibu.',
            ),
          ],
        ),
      ),
    );
  }

  Widget _kontakCard(Profile p) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Alamat',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(
              p.displayAddress ?? '-',
              style: const TextStyle(fontSize: 12, height: 1.5),
            ),
            if ((p.rtRw?.isNotEmpty ?? false) ||
                (p.kelurahan?.isNotEmpty ?? false)) ...[
              const SizedBox(height: 6),
              Text(
                [
                  if (p.rtRw?.isNotEmpty ?? false) 'RT/RW ${p.rtRw}',
                  if (p.kelurahan?.isNotEmpty ?? false) p.kelurahan!,
                  if (p.kecamatan?.isNotEmpty ?? false) p.kecamatan!,
                  if (p.kota?.isNotEmpty ?? false) p.kota!,
                  if (p.provinsi?.isNotEmpty ?? false) p.provinsi!,
                ].join(', '),
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
            ],
            if (p.officeAddress?.isNotEmpty ?? false) ...[
              const SizedBox(height: 10),
              const Text('Alamat Kantor',
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(p.officeAddress!,
                  style: const TextStyle(fontSize: 12, height: 1.5)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _dataKtpCard(Profile p) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Data KTP',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            InfoRow('NIK', Fmt.nik(p.nik)),
            InfoRow('Tempat Lahir', p.tempatLahir ?? '-'),
            InfoRow('Tanggal Lahir', Fmt.tanggal(p.birthDate)),
            InfoRow(
              'Jenis Kelamin',
              p.jenisKelamin == 'L'
                  ? 'Laki-laki'
                  : p.jenisKelamin == 'P'
                      ? 'Perempuan'
                      : '-',
            ),
            InfoRow('Agama', p.agama ?? '-'),
            InfoRow('Status Kawin', p.statusKawin ?? '-'),
            InfoRow('Pekerjaan', p.pekerjaan ?? '-'),
            InfoRow('Kewarganegaraan', p.kewarganegaraan ?? '-'),
          ],
        ),
      ),
    );
  }

  Color _warnaKeandalan(StatusKeandalan s) {
    switch (s) {
      case StatusKeandalan.lancar:
        return AppTheme.accent;
      case StatusKeandalan.peringatan:
        return AppTheme.gold;
      case StatusKeandalan.macet:
        return AppTheme.danger;
    }
  }
}
