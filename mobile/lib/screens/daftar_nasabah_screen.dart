import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// M6b — Petugas daftarkan calon nasabah di lapangan + tracking status.
/// Data masuk tabel calon_nasabah; owner meng-convert jadi akun via admin web.
class DaftarNasabahScreen extends StatefulWidget {
  const DaftarNasabahScreen({super.key});

  @override
  State<DaftarNasabahScreen> createState() => _DaftarNasabahScreenState();
}

class _DaftarNasabahScreenState extends State<DaftarNasabahScreen> {
  final _svc = SupabaseService.instance;
  final _form = GlobalKey<FormState>();

  final _nama = TextEditingController();
  final _nik = TextEditingController();
  final _phone = TextEditingController();
  final _alamat = TextEditingController();
  final _wilayah = TextEditingController();

  File? _ktpFile;
  bool _busy = false;

  List<CalonNasabah>? _riwayat;
  bool _loadingRiwayat = true;

  @override
  void initState() {
    super.initState();
    _loadRiwayat();
  }

  @override
  void dispose() {
    _nama.dispose();
    _nik.dispose();
    _phone.dispose();
    _alamat.dispose();
    _wilayah.dispose();
    super.dispose();
  }

  Future<void> _loadRiwayat() async {
    try {
      _riwayat = await _svc.fetchCalonSaya();
    } catch (_) {
      _riwayat = [];
    } finally {
      if (mounted) setState(() => _loadingRiwayat = false);
    }
  }

  Future<void> _pickKtp() async {
    final picker = ImagePicker();
    final shot = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      imageQuality: 80,
    );
    if (shot == null) return;
    setState(() => _ktpFile = File(shot.path));
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_ktpFile == null) {
      showError(context, 'Foto KTP calon wajib diambil dulu.');
      return;
    }
    setState(() => _busy = true);
    try {
      await _svc.submitCalon(
        nama: _nama.text,
        nik: _nik.text,
        phone: _phone.text,
        alamat: _alamat.text,
        wilayah: _wilayah.text,
        ktpFile: _ktpFile!,
      );
      if (!mounted) return;
      showInfo(context, 'Calon nasabah terkirim! Owner akan memprosesnya. 🤝');
      setState(() {
        _nama.clear();
        _nik.clear();
        _phone.clear();
        _alamat.clear();
        _ktpFile = null;
      });
      await _loadRiwayat();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'baru':
        return 'Baru — menunggu owner';
      case 'diproses':
        return 'Diproses owner';
      case 'jadi_nasabah':
        return 'Sudah jadi nasabah ✅';
      case 'ditolak':
        return 'Ditolak';
      default:
        return s;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: const Text('Daftarkan Nasabah 📝')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Isi data calon di tempat. Owner akan buatkan akunnya, '
              'lalu otomatis masuk rute tagihanmu.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: cs.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nama,
              decoration: const InputDecoration(
                labelText: 'Nama lengkap (sesuai KTP)',
                prefixIcon: Icon(Icons.person_outline),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Nama wajib diisi'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _nik,
              keyboardType: TextInputType.number,
              maxLength: 16,
              decoration: const InputDecoration(
                labelText: 'NIK (16 digit)',
                counterText: '',
                prefixIcon: Icon(Icons.badge_outlined),
              ),
              validator: (v) =>
                  (v == null || !RegExp(r'^\d{16}$').hasMatch(v.trim()))
                      ? 'NIK harus 16 digit angka'
                      : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'No. HP (08…)',
                prefixIcon: Icon(Icons.phone_outlined),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'No. HP wajib diisi';
                }
                if (!SupabaseService.isValidIdPhone(v)) {
                  return 'Format salah — contoh: 081234567890';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _alamat,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Alamat',
                prefixIcon: Icon(Icons.home_outlined),
              ),
              validator: (v) => (v == null || v.trim().length < 10)
                  ? 'Alamat minimal 10 karakter'
                  : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _wilayah,
              decoration: const InputDecoration(
                labelText: 'Wilayah (cth: Cibiru)',
                prefixIcon: Icon(Icons.map_outlined),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Wilayah wajib diisi'
                  : null,
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: _ktpFile == null
                    ? const Icon(Icons.add_a_photo_outlined, size: 36)
                    : Image.file(_ktpFile!,
                        width: 56, height: 40, fit: BoxFit.cover),
                title: const Text('Foto KTP calon'),
                subtitle: Text(
                    _ktpFile == null ? 'Belum ada foto' : 'Siap dikirim'),
                trailing: FilledButton.tonal(
                  onPressed: _pickKtp,
                  child: Text(_ktpFile == null ? 'Ambil foto' : 'Ulangi'),
                ),
              ),
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
                  : const Icon(Icons.send_rounded),
              label: Text(_busy ? 'Mengirim...' : 'Kirim ke owner'),
            ),
            const SizedBox(height: 24),
            Text('Riwayat pendaftaranmu',
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            if (_loadingRiwayat)
              const Center(child: CircularProgressIndicator())
            else if ((_riwayat ?? []).isEmpty)
              const Text('Belum ada calon yang didaftarkan.'),
            ...(_riwayat ?? []).map((c) => Card(
                  child: ListTile(
                    leading: Icon(
                      c.status == 'jadi_nasabah'
                          ? Icons.check_circle_rounded
                          : c.status == 'ditolak'
                              ? Icons.cancel_rounded
                              : Icons.hourglass_top_rounded,
                      color: c.status == 'jadi_nasabah'
                          ? Colors.green
                          : c.status == 'ditolak'
                              ? cs.error
                              : cs.primary,
                    ),
                    title: Text(c.nama,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                        '${c.phone} • ${c.wilayah}\n${_statusLabel(c.status)}'),
                    isThreeLine: true,
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
