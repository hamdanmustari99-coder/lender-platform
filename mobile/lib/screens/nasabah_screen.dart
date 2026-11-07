import 'package:flutter/material.dart';

import '../../format.dart';
import '../../models/models.dart';
import '../../services/supabase_service.dart';
import '../../widgets/common.dart';
import 'nasabah_detail_screen.dart';

/// Daftar nasabah dengan pencarian nama/NIK.
class NasabahScreen extends StatefulWidget {
  const NasabahScreen({super.key});

  @override
  State<NasabahScreen> createState() => _NasabahScreenState();
}

class _NasabahScreenState extends State<NasabahScreen> {
  final _api = ApiService.instance;
  final _search = TextEditingController();

  List<Profile> _all = [];
  List<Profile> _shown = [];
  bool _loading = true;
  String? _error;

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
      final rows = await _api.fetchNasabah();
      if (!mounted) return;
      setState(() {
        _all = rows;
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
      _shown = _all.where((p) {
        if (q.isEmpty) return true;
        return p.fullName.toLowerCase().contains(q) ||
            (p.nik?.contains(q) ?? false) ||
            (p.phone?.contains(q) ?? false);
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
            hintText: 'Cari nama / NIK / HP…',
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
                                child: Text('Tidak ada nasabah yang cocok.'),
                              ),
                            ],
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                            itemCount: _shown.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(height: 8),
                            itemBuilder: (_, i) => _nasabahCard(_shown[i]),
                          ),
          ),
        ),
      ],
    );
  }

  Widget _nasabahCard(Profile p) {
    return Card(
      child: ListTile(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => NasabahDetailScreen(userId: p.id),
          ),
        ),
        leading: InitialAvatar(p.initials),
        title: Text(
          p.fullName.isEmpty ? '(tanpa nama)' : p.fullName,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          [
            if (p.nik?.isNotEmpty ?? false) 'NIK ${Fmt.nik(p.nik)}',
            if (p.phone?.isNotEmpty ?? false) p.phone!,
          ].join(' • '),
          style: const TextStyle(fontSize: 11),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            StatusChip(
              kycStatusLabel(p.kycStatus),
              color: StatusChip.forKyc(p.kycStatus),
            ),
            const SizedBox(height: 4),
            Text(
              statusKeandalanLabel(p.statusKeandalan),
              style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
            ),
          ],
        ),
      ),
    );
  }
}
