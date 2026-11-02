import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// Onboarding KYC model koperasi v3.0: full data KTP (14 field) + nomor HP utama
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

  // --- v3.0: domisili + kantor + share location ---
  final _currentAddress = TextEditingController();
  final _officeAddress = TextEditingController();
  double? _homeLat;
  double? _homeLng;
  double? _officeLat;
  double? _officeLng;
  bool _locatingHome = false;
  bool _locatingOffice = false;

  // --- v3.0: OCR KTP ---
  bool _scanning = false;

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
      _currentAddress.text = p.currentAddress;
      _officeAddress.text = p.officeAddress;
      _homeLat = p.homeLat;
      _homeLng = p.homeLng;
      _officeLat = p.officeLat;
      _officeLng = p.officeLng;
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
      _currentAddress, _officeAddress,
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

  String? _addressValidator(String? v, String label) {
    if (v == null || v.trim().isEmpty) return '$label wajib diisi';
    if (v.trim().length < 10) return '$label minimal 10 karakter';
    return null;
  }

  String? _phoneValidator(String? v) {
    if (v == null || v.trim().isEmpty) return 'Nomor HP wajib diisi';
    if (!SupabaseService.isValidIdPhone(v)) {
      return 'Format salah — contoh: 081234567890';
    }
    return null;
  }

  // ------------------------------------------------------------------
  // v3.0: share location (GPS) — pola sama untuk tinggal & kantor.
  // ------------------------------------------------------------------

  Future<void> _useCurrentLocation({required bool forHome}) async {
    if (!mounted) return;
    setState(() {
      if (forHome) {
        _locatingHome = true;
      } else {
        _locatingOffice = true;
      }
    });
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied) {
        if (mounted) showError(context, 'Izin lokasi ditolak.');
        return;
      }
      if (perm == LocationPermission.deniedForever) {
        if (mounted) {
          showError(
            context,
            'Izin lokasi ditolak permanen. Aktifkan di pengaturan HP.',
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      if (!mounted) return;
      setState(() {
        if (forHome) {
          _homeLat = pos.latitude;
          _homeLng = pos.longitude;
        } else {
          _officeLat = pos.latitude;
          _officeLng = pos.longitude;
        }
      });
      if (mounted) showInfo(context, 'Lokasi tersimpan.');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) {
        setState(() {
          if (forHome) {
            _locatingHome = false;
          } else {
            _locatingOffice = false;
          }
        });
      }
    }
  }

  Future<void> _openMaps(double lat, double lng) async {
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=$lat,$lng',
    );
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        showError(context, 'Tidak bisa membuka aplikasi maps.');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  // ------------------------------------------------------------------
  // v3.0: OCR KTP — pindai otomatis dari foto KTP.
  // ------------------------------------------------------------------

  /// Jalankan ML Kit text recognition pada [imageFile], lalu isi
  /// controller NIK / nama / tanggal lahir bila pola cocok.
  ///
  /// Gagal OCR = snackbar error, form tetap bisa diisi manual.
  Future<void> _scanKtp(File imageFile) async {
    if (_scanning) return;
    setState(() => _scanning = true);
    try {
      final input = InputImage.fromFilePath(imageFile.path);
      final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
      RecognizedText result;
      try {
        result = await recognizer.processImage(input);
      } finally {
        await recognizer.close();
      }
      final filled = _applyOcrResult(result.text);
      if (!mounted) return;
      if (filled == 0) {
        showError(context, 'Teks KTP tidak terbaca jelas. Isi manual ya.');
      } else {
        showInfo(
          context,
          'Berhasil mengisi $filled field dari foto KTP. Cek lagi ya.',
        );
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  /// Parse teks mentah OCR -> isi controller. Return jumlah field terisi.
  int _applyOcrResult(String raw) {
    var filled = 0;
    final lines = raw
        .split('\n')
        .map((l) => l.trim().replaceAll(RegExp(r'\s+'), ' '))
        .where((l) => l.isNotEmpty)
        .toList();

    // --- NIK: 16 digit berurutan (toleransi spasi khas OCR). ---
    final digitsOnly = raw.replaceAll(RegExp(r'[^0-9]'), ' ');
    final nikMatch = RegExp(r'\b\d{16}\b').firstMatch(raw) ??
        RegExp(r'\b\d{16}\b').firstMatch(digitsOnly);
    if (nikMatch != null) {
      _nik.text = nikMatch.group(0)!;
      filled++;
    } else {
      // Fallback: sambungkan semua digit lalu ambil 16 pertama — umum
      // bila OCR menyisipkan spasi (mis. "3174 0612 3456 7890").
      final allDigits = raw.replaceAll(RegExp(r'[^0-9]'), '');
      if (allDigits.length >= 16) {
        _nik.text = allDigits.substring(0, 16);
        filled++;
      }
    }

    // --- Nama: heuristik baris setelah label "Nama". ---
    final namaIdx = lines.indexWhere(
      (l) => RegExp(r'\bnama\b', caseSensitive: false).hasMatch(l),
    );
    String? nama;
    if (namaIdx >= 0) {
      // Label bisa satu baris dengan nilai ("Nama : BUDI SANTOSO").
      final sameLine = RegExp(r'nama\s*:?\s*(.+)$', caseSensitive: false)
          .firstMatch(lines[namaIdx]);
      final afterColon = sameLine?.group(1)?.trim();
      if (afterColon != null &&
          afterColon.length > 2 &&
          !RegExp(r'^\d+$').hasMatch(afterColon)) {
        nama = afterColon;
      } else {
        // Nilai di baris berikutnya.
        for (var i = namaIdx + 1; i < lines.length && i < namaIdx + 3; i++) {
          final cand = lines[i];
          if (_looksLikeName(cand)) {
            nama = cand;
            break;
          }
        }
      }
    }
    if (nama != null) {
      _nama.text = _titleCase(nama);
      filled++;
    }

    // --- Tanggal lahir: pola dd-mm-yyyy (atau dd/mm/yyyy, dd.mm.yyyy). ---
    final dobMatch =
        RegExp(r'\b(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})\b').firstMatch(raw);
    if (dobMatch != null) {
      final d = int.tryParse(dobMatch.group(1)!);
      final m = int.tryParse(dobMatch.group(2)!);
      final y = int.tryParse(dobMatch.group(3)!);
      if (d != null && m != null && y != null) {
        try {
          final parsed = DateTime(y, m, d);
          // Validasi kasar: hari/bulan cocok (konstruktor DateTime
          // menormalisasi overflow seperti 31 Feb -> 3 Mar).
          if (parsed.year == y && parsed.month == m && parsed.day == d) {
            _birthDate = parsed;
            filled++;
          }
        } catch (_) {
          // Tanggal tidak valid → lewati, isi manual.
        }
      }
    }

    if (filled > 0) setState(() {});
    return filled;
  }

  bool _looksLikeName(String s) {
    if (s.length < 3) return false;
    if (RegExp(r'\d').hasMatch(s)) return false;
    return RegExp(r"^[A-Za-z.,'() \-]{3,}$").hasMatch(s) &&
        RegExp(r'[A-Za-z]{2,}').hasMatch(s);
  }

  String _titleCase(String s) => s
      .toLowerCase()
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');

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
        currentAddress: _currentAddress.text.trim(),
        officeAddress: _officeAddress.text.trim(),
        homeLat: _homeLat,
        homeLng: _homeLng,
        officeLat: _officeLat,
        officeLng: _officeLng,
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

            _section('Alamat Tinggal Saat Ini'),
            _field(
              _currentAddress,
              'Alamat tinggal saat ini',
              Icons.home_work_outlined,
              (v) => _addressValidator(v, 'Alamat tinggal'),
              lines: 3,
            ),
            _locationRow(
              lat: _homeLat,
              lng: _homeLng,
              locating: _locatingHome,
              onUseLocation: () => _useCurrentLocation(forHome: true),
            ),

            _section('Alamat Kantor'),
            _field(
              _officeAddress,
              'Alamat kantor',
              Icons.business_outlined,
              (v) => _addressValidator(v, 'Alamat kantor'),
              lines: 3,
            ),
            _locationRow(
              lat: _officeLat,
              lng: _officeLng,
              locating: _locatingOffice,
              onUseLocation: () => _useCurrentLocation(forHome: false),
            ),

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
            if (_ktpFile != null) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _scanning ? null : () => _scanKtp(_ktpFile!),
                icon: _scanning
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.document_scanner_outlined),
                label: Text(
                  _scanning ? 'Memindai...' : 'Pindai otomatis dari foto KTP',
                ),
              ),
            ],
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

  /// Baris "Gunakan lokasi saat ini" + tampilan koordinat + link buka maps.
  /// Dipakai ulang untuk alamat tinggal & alamat kantor.
  Widget _locationRow({
    required double? lat,
    required double? lng,
    required bool locating,
    required VoidCallback onUseLocation,
  }) {
    final cs = Theme.of(context).colorScheme;
    final hasCoord = lat != null && lng != null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OutlinedButton.icon(
            onPressed: locating ? null : onUseLocation,
            icon: locating
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.my_location_rounded),
            label: Text(
              locating ? 'Mengambil lokasi...' : 'Gunakan lokasi saat ini',
            ),
          ),
          if (hasCoord) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: cs.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.place_rounded, size: 18, color: cs.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  TextButton(
                    onPressed: () => _openMaps(lat, lng),
                    child: const Text('Buka maps'),
                  ),
                ],
              ),
            ),
          ],
        ],
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
