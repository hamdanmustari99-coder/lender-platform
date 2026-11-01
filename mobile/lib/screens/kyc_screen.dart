import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// Onboarding KYC model koperasi: full data KTP (14 field) + nomor HP utama
/// + 2 kontak darurat + foto KTP & selfie.
///
/// Data profil di-update ke tabel profiles; kontak darurat di-upsert ke
/// tabel emergency_contacts; foto ke bucket private 'kyc-documents'.
class KycScreen extends StatefulWidget {
  const KycScreen({super.key, required this.profile, required this.onCompleted});

  final AppProfile? profile;
  final Future<void> Function() onCompleted;

  @override
  State<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends State<KycScreen> {
  final _svc = SupabaseService.instance;
  final _form = GlobalKey<FormState>();

  // --- KTP ---
  final _nama = TextEditingController();
  final _nik = TextEditingController();
  final _tempatLahir = TextEditingController();
  DateTime? _birthDate;
  String _jk = '';
  final _address = TextEditingController();
  final _rtRw = TextEditingController();
  final _kelurahan = TextEditingController();
  final _kecamatan = TextEditingController();
  final _kota = TextEditingController();
  final _provinsi = TextEditingController();
  final _agama = TextEditingController();
  final _statusKawin = TextEditingController();
  final _pekerjaan = TextEditingController();
  final _kewarganegaraan = TextEditingController(text: 'WNI');

  // --- Kontak ---
  final _phone = TextEditingController();
  final _ec1Nama = TextEditingController();
  final _ec1Hub = TextEditingController();
  final _ec1No = TextEditingController();
  final _ec2Nama = TextEditingController();
  final _ec2Hub = TextEditingController();
  final _ec2No = TextEditingController();

  File? _ktpFile;
  File? _selfieFile;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    if (p != null) {
      _nama.text = p.fullName;
      _nik.text = p.nik;
      _tempatLahir.text = p.tempatLahir;
      _birthDate = p.birthDate;
      _jk = p.jenisKelamin;
      _address.text = p.address;
      _rtRw.text = p.rtRw;
      _kelurahan.text = p.kelurahan;
      _kecamatan.text = p.kecamatan;
      _kota.text = p.kota;
      _provinsi.text = p.provinsi;
      _agama.text = p.agama;
      _statusKawin.text = p.statusKawin;
      _pekerjaan.text = p.pekerjaan;
      _kewarganegaraan.text = p.kewarganegaraan.isEmpty ? 'WNI' : p.kewarganegaraan;
      _phone.text = p.phone;
    }
    // preload kontak darurat bila sudah pernah isi
    _svc.fetchEmergencyContacts().then((list) {
      if (!mounted) return;
      for (final c in list) {
        if (c.seq == 1) {
          _ec1Nama.text = c.nama;
          _ec1Hub.text = c.hubungan;
          _ec1No.text = c.nomor;
        } else if (c.seq == 2) {
          _ec2Nama.text = c.nama;
          _ec2Hub.text = c.hubungan;
          _ec2No.text = c.nomor;
        }
      }
      setState(() {});
    }).catchError((_) {});
  }

  @override
  void dispose() {
    for (final c in [
      _nama, _nik, _tempatLahir, _address, _rtRw, _kelurahan, _kecamatan,
      _kota, _provinsi, _agama, _statusKawin, _pekerjaan, _kewarganegaraan,
      _phone, _ec1Nama, _ec1Hub, _ec1No, _ec2Nama, _ec2Hub, _ec2No,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate ?? DateTime(now.year - 25),
      firstDate: DateTime(1940),
      lastDate: DateTime(now.year - 17),
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _pickImage({required String docType}) async {
    final fromCamera = await showModalBottomSheet<bool>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_rounded),
              title: const Text('Ambil foto dengan kamera'),
              onTap: () => Navigator.pop(context, true),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_rounded),
              title: const Text('Pilih dari galeri'),
              onTap: () => Navigator.pop(context, false),
            ),
          ],
        ),
      ),
    );
    if (fromCamera == null) return;

    final picker = ImagePicker();
    final shot = await picker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 80,
      preferredCameraDevice:
          docType == 'selfie' ? CameraDevice.front : CameraDevice.rear,
    );
    if (shot == null) return;
    setState(() {
      if (docType == 'ktp') {
        _ktpFile = File(shot.path);
      } else {
        _selfieFile = File(shot.path);
      }
    });
  }

  String? _req(String? v, String label) =>
      (v == null || v.trim().isEmpty) ? '$label wajib diisi' : null;

  String? _phoneValidator(String? v) {
    if (v == null || v.trim().isEmpty) return 'Nomor HP wajib diisi';
    if (!SupabaseService.isValidIdPhone(v)) {
      return 'Format salah — contoh: 081234567890';
    }
    return null;
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (_jk.isEmpty) {
      showError(context, 'Jenis kelamin belum dipilih.');
      return;
    }
    if (_birthDate == null) {
      showError(context, 'Tanggal lahir belum dipilih.');
      return;
    }
    if (_ktpFile == null || _selfieFile == null) {
      showError(context, 'Foto KTP dan selfie wajib di-upload dulu ya.');
      return;
    }

    setState(() => _busy = true);
    try {
      // 1) Data KTP + nomor utama.
      await _svc.updateKycData(
        fullName: _nama.text.trim(),
        nik: _nik.text.trim(),
        tempatLahir: _tempatLahir.text.trim(),
        birthDate: _birthDate!,
        jenisKelamin: _jk,
        address: _address.text.trim(),
        rtRw: _rtRw.text.trim(),
        kelurahan: _kelurahan.text.trim(),
        kecamatan: _kecamatan.text.trim(),
        kota: _kota.text.trim(),
        provinsi: _provinsi.text.trim(),
        agama: _agama.text.trim(),
        statusKawin: _statusKawin.text.trim(),
        pekerjaan: _pekerjaan.text.trim(),
        kewarganegaraan: _kewarganegaraan.text.trim().isEmpty
            ? 'WNI'
            : _kewarganegaraan.text.trim(),
        phone: _phone.text.trim(),
      );
      // 2) Kontak darurat.
      await _svc.upsertEmergencyContacts(
        first: EmergencyContactInput(
          seq: 1,
          nama: _ec1Nama.text,
          hubungan: _ec1Hub.text,
          nomor: _ec1No.text,
        ),
        second: EmergencyContactInput(
          seq: 2,
          nama: _ec2Nama.text,
          hubungan: _ec2Hub.text,
          nomor: _ec2No.text,
        ),
      );
      // 3) Upload dokumen + catat.
      await _svc.uploadKycDocument(
        docType: 'ktp',
        file: _ktpFile!,
        contentType: 'image/jpeg',
      );
      await _svc.uploadKycDocument(
        docType: 'selfie',
        file: _selfieFile!,
        contentType: 'image/jpeg',
      );
      await widget.onCompleted();
      if (!mounted) return;
      showInfo(context, 'KYC terkirim! Tim koperasi akan memverifikasi data Anda.');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verifikasi Identitas (KYC)')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Isi sesuai KTP Anda. Data ini dipakai koperasi untuk '
              'memverifikasi identitas dan menghubungi Anda bila perlu.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),

            _section('Data KTP'),
            _field(_nama, 'Nama sesuai KTP', Icons.person_outline,
                (v) => _req(v, 'Nama')),
            _field(_nik, 'NIK (16 digit)', Icons.badge_outlined,
                (v) => (v == null || !RegExp(r'^\d{16}$').hasMatch(v.trim()))
                    ? 'NIK harus 16 digit angka'
                    : null,
                keyboard: TextInputType.number, maxLen: 16),
            _field(_tempatLahir, 'Tempat lahir', Icons.place_outlined,
                (v) => _req(v, 'Tempat lahir')),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(8),
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Tanggal lahir',
                  prefixIcon: Icon(Icons.cake_rounded),
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                child: Text(
                  _birthDate == null
                      ? 'Pilih tanggal lahir'
                      : dateFormat.format(_birthDate!),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Jenis kelamin',
                style: TextStyle(fontSize: 12, color: Colors.black54)),
            Row(
              children: [
                Expanded(
                  child: RadioListTile<String>(
                    title: const Text('Laki-laki'),
                    value: 'L',
                    groupValue: _jk.isEmpty ? null : _jk,
                    onChanged: (v) => setState(() => _jk = v!),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                Expanded(
                  child: RadioListTile<String>(
                    title: const Text('Perempuan'),
                    value: 'P',
                    groupValue: _jk.isEmpty ? null : _jk,
                    onChanged: (v) => setState(() => _jk = v!),
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
            _field(_address, 'Alamat (jalan/no. rumah)', Icons.home_outlined,
                (v) => (v == null || v.trim().length < 10)
                    ? 'Alamat minimal 10 karakter'
                    : null,
                lines: 2),
            Row(
              children: [
                Expanded(
                    child: _field(_rtRw, 'RT/RW', null,
                        (v) => _req(v, 'RT/RW'))),
                const SizedBox(width: 12),
                Expanded(
                    child: _field(_kelurahan, 'Kel/Desa', null,
                        (v) => _req(v, 'Kelurahan'))),
              ],
            ),
            Row(
              children: [
                Expanded(
                    child: _field(_kecamatan, 'Kecamatan', null,
                        (v) => _req(v, 'Kecamatan'))),
                const SizedBox(width: 12),
                Expanded(
                    child:
                        _field(_kota, 'Kota/Kab', null, (v) => _req(v, 'Kota'))),
              ],
            ),
            Row(
              children: [
                Expanded(
                    child: _field(_provinsi, 'Provinsi', null,
                        (v) => _req(v, 'Provinsi'))),
                const SizedBox(width: 12),
                Expanded(
                    child:
                        _field(_agama, 'Agama', null, (v) => _req(v, 'Agama'))),
              ],
            ),
            Row(
              children: [
                Expanded(
                    child: _field(_statusKawin, 'Status kawin', null,
                        (v) => _req(v, 'Status kawin'))),
                const SizedBox(width: 12),
                Expanded(
                    child: _field(_pekerjaan, 'Pekerjaan', null,
                        (v) => _req(v, 'Pekerjaan'))),
              ],
            ),
            _field(_kewarganegaraan, 'Kewarganegaraan', Icons.flag_outlined,
                (v) => _req(v, 'Kewarganegaraan')),

            _section('Nomor HP Utama'),
            _field(_phone, 'Contoh: 081234567890', Icons.phone_outlined,
                _phoneValidator,
                keyboard: TextInputType.phone),

            _section('Kontak Darurat 1 (wajib)'),
            _field(_ec1Nama, 'Nama kontak 1', Icons.person_outline,
                (v) => _req(v, 'Nama kontak 1')),
            Row(
              children: [
                Expanded(
                    child: _field(_ec1Hub, 'Hubungan (mis. Istri)', null,
                        (v) => _req(v, 'Hubungan'))),
                const SizedBox(width: 12),
                Expanded(
                    child: _field(_ec1No, 'Nomor HP', null, _phoneValidator,
                        keyboard: TextInputType.phone)),
              ],
            ),

            _section('Kontak Darurat 2 (wajib)'),
            _field(_ec2Nama, 'Nama kontak 2', Icons.person_outline,
                (v) => _req(v, 'Nama kontak 2')),
            Row(
              children: [
                Expanded(
                    child: _field(_ec2Hub, 'Hubungan (mis. Ortu)', null,
                        (v) => _req(v, 'Hubungan'))),
                const SizedBox(width: 12),
                Expanded(
                    child: _field(_ec2No, 'Nomor HP', null, _phoneValidator,
                        keyboard: TextInputType.phone)),
              ],
            ),

            _section('Dokumen'),
            _docPicker(
              title: 'Foto KTP',
              hint: 'Pastikan seluruh KTP terlihat & tulisan terbaca.',
              file: _ktpFile,
              onPick: () => _pickImage(docType: 'ktp'),
            ),
            const SizedBox(height: 16),
            _docPicker(
              title: 'Foto Selfie',
              hint: 'Wajah Anda tanpa kacamata gelap & tanpa topi.',
              file: _selfieFile,
              onPick: () => _pickImage(docType: 'selfie'),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _busy ? null : _submit,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_rounded),
              label: Text(_busy ? 'Mengirim...' : 'Kirim untuk verifikasi'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Text(title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      );

  Widget _field(
    TextEditingController c,
    String label,
    IconData? icon,
    String? Function(String?) validator, {
    TextInputType keyboard = TextInputType.text,
    int? maxLen,
    int lines = 1,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          keyboardType: keyboard,
          maxLength: maxLen,
          maxLines: lines,
          decoration: InputDecoration(
            labelText: label,
            counterText: maxLen != null ? '' : null,
            prefixIcon: icon != null ? Icon(icon) : null,
          ),
          validator: validator,
        ),
      );

  Widget _docPicker({
    required String title,
    required String hint,
    required File? file,
    required VoidCallback onPick,
  }) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: file == null
                ? Container(
                    color: cs.surfaceContainerHighest,
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.add_a_photo_outlined,
                              size: 40, color: cs.onSurfaceVariant),
                          const SizedBox(height: 8),
                          Text(hint,
                              textAlign: TextAlign.center,
                              style: Theme.of(context)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(color: cs.onSurfaceVariant)),
                        ],
                      ),
                    ),
                  )
                : Image.file(file, fit: BoxFit.cover),
          ),
          ListTile(
            title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(file == null ? 'Belum ada foto' : 'Foto siap dikirim'),
            trailing: FilledButton.tonal(
              onPressed: onPick,
              child: Text(file == null ? 'Pilih foto' : 'Ganti'),
            ),
          ),
        ],
      ),
    );
  }
}
