import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../config.dart';
import '../models/models.dart';

/// Exception dengan pesan Indonesia siap-tampilkan ke user.
/// Membungkus AuthException / PostgrestException yang diterjemahkan.
class AppDataException implements Exception {
  final String message;
  AppDataException(this.message);
  @override
  String toString() => message;
}

String _friendly(Object e) {
  if (e is AuthException) {
    final m = e.message.toLowerCase();
    if (m.contains('invalid login credentials')) {
      return 'Email atau password salah.';
    }
    if (m.contains('already registered') || m.contains('already exists')) {
      return 'Email sudah terdaftar. Coba masuk.';
    }
    if (m.contains('email not confirmed')) {
      return 'Email belum diverifikasi. Cek inbox Anda.';
    }
    if (m.contains('rate limit') || m.contains('too many')) {
      return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
    }
    return e.message;
  }
  if (e is PostgrestException) {
    if (e.code == '23505') return 'Data sudah ada (duplikat).';
    if (e.code == '42501') return 'Tidak diizinkan. Periksa status login Anda.';
    if (e.code == '23514') return 'Data tidak memenuhi syarat (cek nominal/tenor).';
    return e.message;
  }
  if (e is SocketException) return 'Koneksi internet bermasalah. Coba lagi.';
  return e.toString();
}

/// Satu pintu untuk semua akses data Supabase (auth, DB, storage, realtime).
/// Hanya dipakai setelah [initialize] sukses dengan konfigurasi asli; di mode
/// placeholder (AppEnv.isConfigured == false) UI utama memang tidak memanggil
/// service ini.
class SupabaseService {
  SupabaseService._();
  static final SupabaseService instance = SupabaseService._();

  static const String bucket = AppEnv.contactsBucket;

  bool _configured = false;

  SupabaseClient get client {
    assert(
      _configured,
      'SupabaseService dipakai padahal konfigurasi masih placeholder',
    );
    return Supabase.instance.client;
  }

  /// Init Supabase. [configured] false = masih placeholder -> mode demo
  /// tanpa sentuhan jaringan.
  Future<void> initialize({required bool configured}) async {
    _configured = configured;
    if (!configured) return;
    await Supabase.initialize(
      url: AppEnv.kSupabaseUrl,
      publishableKey: AppEnv.kSupabaseAnonKey,
    );
  }

  bool get isConfigured => _configured;

  User? get currentUser => _configured ? client.auth.currentUser : null;

  /// true kalau ada sesi user aktif (dipakai main.dart untuk splash/login gate).
  bool get isLoggedIn => currentUser != null;

  String? get currentUserId => currentUser?.id;

  Stream<AuthState> get onAuthStateChange =>
      _configured ? client.auth.onAuthStateChange : const Stream.empty();

  // ============================ AUTH ====================================

  /// Login email+password.
  Future<void> signIn(String email, String password) async {
    try {
      await client.auth.signInWithPassword(email: email, password: password);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Register; full_name & phone dikirim via data (juga tersalin ke metadata
  /// oleh SDK) supaya trigger handle_new_user bisa bikin profile.
  Future<void> signUp(String email, String password,
      {required String fullName, required String phone}) async {
    try {
      await client.auth.signUp(
        email: email,
        password: password,
        data: {'full_name': fullName, 'phone': phone},
        emailRedirectTo: null,
      );
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  Future<void> signOut() async {
    if (!_configured) return;
    await client.auth.signOut();
  }

  // ============================ PROFILE =================================

  /// Ambil baris profile; kalau belum ada (trigger belum jalan / race)
  /// kembalikan null dan biarkan UI menampilkan pesan.
  Future<AppProfile?> fetchProfile() async {
    final uid = currentUserId;
    if (uid == null) return null;
    try {
      final rows = await client
          .from('profiles')
          .select()
          .eq('id', uid)
          .limit(1)
          .maybeSingle()
          .timeout(const Duration(seconds: 15));
      return rows == null ? null : AppProfile.fromJson(rows);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Update nama & no. HP (kolom lain dijaga trigger profiles_guard).
  /// Nomor HP wajib format Indonesia.
  Future<void> updateProfile({required String fullName, required String phone}) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    if (!isValidIdPhone(phone)) {
      throw AppDataException('Nomor HP tidak valid (format 08…).');
    }
    try {
      await client.from('profiles').update({
        'full_name': fullName,
        'phone': phone,
      }).eq('id', uid);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Regex nomor HP Indonesia: 08… / 628… / +628…, 9–15 digit.
  static final RegExp idPhoneRegex = RegExp(r'^(\+62|62|0)8[0-9]{7,12}$');

  static bool isValidIdPhone(String v) => idPhoneRegex.hasMatch(v.trim());

  /// Melengkapi data KTP full (model koperasi): 14 field.
  /// v3.0: + alamat tinggal saat ini + alamat kantor + share location (opsional).
  Future<void> updateKycData({
    required String fullName,
    required String nik,
    required String tempatLahir,
    required DateTime birthDate,
    required String jenisKelamin, // 'L' | 'P'
    required String address,
    required String rtRw,
    required String kelurahan,
    required String kecamatan,
    required String kota,
    required String provinsi,
    required String agama,
    required String statusKawin,
    required String pekerjaan,
    required String kewarganegaraan,
    required String phone,
    String currentAddress = '',
    String officeAddress = '',
    double? homeLat,
    double? homeLng,
    double? officeLat,
    double? officeLng,
  }) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    if (!isValidIdPhone(phone)) {
      throw AppDataException('Nomor HP utama tidak valid (format 08…).');
    }
    try {
      await client.from('profiles').update({
        'full_name': fullName,
        'nik': nik,
        'tempat_lahir': tempatLahir,
        'birth_date': birthDate.toIso8601String().substring(0, 10),
        'jenis_kelamin': jenisKelamin,
        'address': address,
        'rt_rw': rtRw,
        'kelurahan': kelurahan,
        'kecamatan': kecamatan,
        'kota': kota,
        'provinsi': provinsi,
        'agama': agama,
        'status_kawin': statusKawin,
        'pekerjaan': pekerjaan,
        'kewarganegaraan': kewarganegaraan,
        'phone': phone.trim(),
        'current_address': currentAddress.trim(),
        'office_address': officeAddress.trim(),
        'home_lat': homeLat,
        'home_lng': homeLng,
        'office_lat': officeLat,
        'office_lng': officeLng,
      }).eq('id', uid);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Upsert 2 kontak darurat (seq 1 & 2). Semua field wajib & nomor tervalidasi.
  Future<void> upsertEmergencyContacts({
    required EmergencyContactInput first,
    required EmergencyContactInput second,
  }) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    for (final c in [first, second]) {
      if (c.nama.trim().isEmpty || c.hubungan.trim().isEmpty) {
        throw AppDataException('Nama & hubungan kontak darurat #${c.seq} wajib diisi.');
      }
      if (!isValidIdPhone(c.nomor)) {
        throw AppDataException(
            'Nomor kontak darurat #${c.seq} tidak valid (format 08…).');
      }
    }
    try {
      for (final c in [first, second]) {
        final existing = await client
            .from('emergency_contacts')
            .select('id')
            .eq('user_id', uid)
            .eq('seq', c.seq)
            .limit(1);
        final row = {
          'user_id': uid,
          'seq': c.seq,
          'nama': c.nama.trim(),
          'hubungan': c.hubungan.trim(),
          'nomor': c.nomor.trim(),
        };
        if (existing.isEmpty) {
          await client.from('emergency_contacts').insert(row);
        } else {
          await client
              .from('emergency_contacts')
              .update(row)
              .eq('user_id', uid)
              .eq('seq', c.seq);
        }
      }
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Ambil kontak darurat milik sendiri.
  Future<List<EmergencyContact>> fetchEmergencyContacts() async {
    final uid = currentUserId;
    if (uid == null) return [];
    try {
      final rows = await client
          .from('emergency_contacts')
          .select()
          .eq('user_id', uid)
          .order('seq');
      return (rows as List)
          .map((e) => EmergencyContact.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  // ============================ KYC DOCS ================================

  /// Upload satu dokumen KYC ke bucket private 'kyc-documents' pada path
  /// {uid}/ktp.jpg atau {uid}/selfie.jpg, lalu catat di tabel kyc_documents.
  Future<void> uploadKycDocument({
    required String docType, // 'ktp' | 'selfie'
    required File file,
    required String contentType,
  }) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');

    final ext = contentType.contains('png') ? 'png' : 'jpg';
    final path = '$uid/$docType.$ext';
    try {
      await client.storage.from(bucket).upload(
            path,
            file,
            fileOptions: const FileOptions(cacheControl: '3600', upsert: true),
          );
      // Tabel kyc_documents tidak punya unique constraint (user_id, doc_type).
      // Cek dulu, lalu update; kalau race menyisipkan baris baru pun RLS tetap
      // membatasi ke user sendiri (kolom user_id diisi eksplisit).
      final existing = await client
          .from('kyc_documents')
          .select('id')
          .eq('user_id', uid)
          .eq('doc_type', docType)
          .limit(1);
      if (existing.isEmpty) {
        await client.from('kyc_documents').insert({
          'user_id': uid,
          'doc_type': docType,
          'storage_path': path,
        });
      } else {
        await client
            .from('kyc_documents')
            .update({'storage_path': path})
            .eq('user_id', uid)
            .eq('doc_type', docType);
      }
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Signed URL (exp 10 menit) untuk menampilkan dokumen; bucket private.
  Future<String> createKycSignedUrl(String storagePath) async {
    try {
      return await client.storage
          .from(bucket)
          .createSignedUrl(storagePath, 600);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  // ============================ LOANS ===================================

  /// Submit pinjaman baru (v3.0: tenor mingguan 1-52 / bulanan 1|3).
  /// requested_amount dicatat (usulan dari WA); amount final ditentukan admin.
  /// + jaminan (tipe + detail). interest_rate/status di-override server.
  Future<void> submitLoan({
    required int amount,
    required int tenorMonths,
    required String frequency, // 'weekly' | 'monthly'
    required String purpose,
    String collateralType = '',
    String collateralDetail = '',
  }) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    if (frequency != 'weekly' && frequency != 'monthly') {
      throw AppDataException('Frekuensi tidak valid.');
    }
    if (frequency == 'monthly' && tenorMonths != 1 && tenorMonths != 3) {
      throw AppDataException('Tenor bulanan: pilih 1 atau 3 bulan.');
    }
    if (frequency == 'weekly' && (tenorMonths < 1 || tenorMonths > 52)) {
      throw AppDataException('Tenor mingguan: 1–52 minggu.');
    }
    try {
      await client.from('loans').insert({
        'user_id': uid,
        'amount': amount,
        'requested_amount': amount,
        'tenor_months': tenorMonths,
        'frequency': frequency,
        'purpose': purpose,
        'collateral_type': collateralType.trim(),
        'collateral_detail': collateralDetail.trim(),
      });
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Daftar pinjaman milik user, terbaru dulu.
  Future<List<Loan>> fetchMyLoans() async {
    try {
      final rows = await client
          .from('loans')
          .select()
          .order('created_at', ascending: false)
          .timeout(const Duration(seconds: 15));
      return rows.map(Loan.fromJson).toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  Future<Loan> fetchLoan(String loanId) async {
    try {
      final row = await client
          .from('loans')
          .select()
          .eq('id', loanId)
          .limit(1)
          .maybeSingle()
          .timeout(const Duration(seconds: 15));
      if (row == null) throw AppDataException('Pinjaman tidak ditemukan.');
      return Loan.fromJson(row);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Jadwal cicilan suatu pinjaman.
  Future<List<Installment>> fetchInstallments(String loanId) async {
    try {
      final rows = await client
          .from('installments')
          .select()
          .eq('loan_id', loanId)
          .order('seq', ascending: true)
          .timeout(const Duration(seconds: 15));
      return rows.map(Installment.fromJson).toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  // ======================= NOTIFICATIONS ================================

  Future<List<AppNotification>> fetchNotifications({int limit = 100}) async {
    try {
      final rows = await client
          .from('notifications')
          .select()
          .order('created_at', ascending: false)
          .limit(limit)
          .timeout(const Duration(seconds: 15));
      return rows.map(AppNotification.fromJson).toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Hitung notifikasi belum dibaca.
  Future<int> fetchUnreadCount() async {
    try {
      final rows = await client
          .from('notifications')
          .select('id')
          .eq('is_read', false)
          .timeout(const Duration(seconds: 15));
      return (rows as List).length;
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Tandai satu notifikasi dibaca.
  Future<void> markAsRead(String id) async {
    try {
      await client.from('notifications').update({'is_read': true}).eq('id', id);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Tandai semua notifikasi user sebagai dibaca.
  Future<void> markAllAsRead() async {
    try {
      await client
          .from('notifications')
          .update({'is_read': true})
          .eq('is_read', false);
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Stream realtime INSERT pada tabel notifications untuk user ini
  /// (Supabase Realtime / postgres_changes). RLS menyaring dari server,
  /// filter uid di sini hanya pengaman ekstra.
  RealtimeChannel subscribeNotifications(
      void Function(AppNotification notif) onInsert) {
    final uid = currentUserId;
    final channel = client.channel('notifications-$uid');
    return channel
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'notifications',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'user_id', value: uid!),
          callback: (payload) {
            final newRow = payload.newRecord;
            if (newRow.isEmpty) return;
            onInsert(AppNotification.fromJson(newRow));
          },
        )
        .subscribe();
  }

  Future<void> unsubscribe(RealtimeChannel channel) async {
    try {
      await client.removeChannel(channel);
    } catch (_) {
      // sudah terputus / halaman dibuang — abaikan
    }
  }

  // ============================ PETUGAS (v2.0) =============================

  bool get isPetugas => _configured && (fetchProfileCachedRole == 'petugas');

  /// Role profile yang terakhir dimuat (diisi root_shell; default 'nasabah').
  String fetchProfileCachedRole = 'nasabah';

  /// Rute tagihan: cicilan unpaid milik nasabah dalam rute petugas ini,
  /// beserta info loan + nasabah. Diurut due_date (nunggak dulu).
  Future<List<RouteTask>> fetchRouteTasks() async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    try {
      // 1) nasabah dalam rute aktif petugas ini
      final routes = await client
          .from('collection_routes')
          .select('nasabah_id')
          .eq('petugas_id', uid)
          .eq('aktif', true)
          .timeout(const Duration(seconds: 15));
      final nasabahIds =
          (routes as List).map((e) => (e as Map)['nasabah_id'] as String).toSet();
      if (nasabahIds.isEmpty) return [];

      // 2) loan berjalan milik mereka
      final loans = await client
          .from('loans')
          .select('id, amount, frequency, user_id')
          .inFilter('user_id', nasabahIds.toList())
          .inFilter('status', ['disbursed', 'active'])
          .timeout(const Duration(seconds: 15));
      if ((loans as List).isEmpty) return [];
      final loanById = {
        for (final l in (loans as List))
          ((l as Map)['id'] as String): Map<String, dynamic>.from(l)
      };

      // 3) cicilan belum lunas + info nasabah
      // v13: status 'overdue' ditulis job harian — rute harus tetap memuatnya,
      // kalau tidak seluruh tunggakan hilang dari HP petugas.
      final insts = await client
          .from('installments')
          .select('*, loans!inner(id)')
          .inFilter(
              'loan_id', loanById.keys.toList().map((e) => e).toList())
          .neq('status', 'paid')
          .order('due_date', ascending: true)
          .limit(200)
          .timeout(const Duration(seconds: 20));

      final tasks = <RouteTask>[];
      for (final r in (insts as List)) {
        final m = Map<String, dynamic>.from(r as Map);
        final loanId = (m['loans'] as Map)['id'] as String;
        final loan = loanById[loanId];
        if (loan == null) continue;
        final prof = await client
            .from('profiles')
            .select('full_name, address, phone')
            .eq('id', loan['user_id'] as String)
            .maybeSingle()
            .timeout(const Duration(seconds: 10));
        tasks.add(RouteTask(
          installment: Installment.fromJson(m),
          loanId: loanId,
          loanAmount: (loan['amount'] as num).toInt(),
          frequency: (loan['frequency'] ?? 'weekly') as String,
          borrowerName: (prof?['full_name'] ?? '-') as String,
          borrowerAddress: (prof?['address'] ?? '-') as String,
          borrowerPhone: (prof?['phone'] ?? '-') as String,
        ));
      }
      return tasks;
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Catat pembayaran TUNAI via RPC record_cash_payment.
  Future<void> recordCashPayment({
    required String installmentId,
    required int amount,
    String note = '',
  }) async {
    if (amount <= 0) throw AppDataException('Nominal harus lebih dari 0.');
    try {
      await client.rpc('record_cash_payment', params: {
        'p_installment_id': installmentId,
        'p_amount': amount,
        'p_note': note,
      }).timeout(const Duration(seconds: 20));
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Setoran tercatat hari ini oleh petugas ini (untuk rekap).
  Future<List<Payment>> fetchPaymentsToday() async {
    final uid = currentUserId;
    if (uid == null) return [];
    try {
      final now = DateTime.now();
      final start = DateTime(now.year, now.month, now.day).toIso8601String();
      final rows = await client
          .from('payments')
          .select()
          .eq('petugas_id', uid)
          .gte('paid_at', start)
          .order('paid_at', ascending: false)
          .timeout(const Duration(seconds: 15));
      return (rows as List)
          .map((e) => Payment.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Koreksi salah input via RPC void_payment (reversal beraudit).
  /// Petugas: miliknya + hari yang sama; admin: apa pun. Alasan wajib.
  Future<void> voidPayment({
    required String paymentId,
    required String reason,
  }) async {
    if (reason.trim().isEmpty) {
      throw AppDataException('Alasan koreksi wajib diisi.');
    }
    try {
      await client.rpc('void_payment', params: {
        'p_payment_id': paymentId,
        'p_reason': reason.trim(),
      }).timeout(const Duration(seconds: 20));
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Koreksi + langsung catat nominal benar (atomic via void_and_repay).
  Future<void> voidAndRepay({
    required String paymentId,
    required String reason,
    required int correctAmount,
    String correctNote = '',
  }) async {
    if (reason.trim().isEmpty) {
      throw AppDataException('Alasan koreksi wajib diisi.');
    }
    if (correctAmount <= 0) {
      throw AppDataException('Nominal yang benar harus lebih dari 0.');
    }
    try {
      await client.rpc('void_and_repay', params: {
        'p_payment_id': paymentId,
        'p_reason': reason.trim(),
        'p_correct_amount': correctAmount,
        'p_correct_note': correctNote,
      }).timeout(const Duration(seconds: 20));
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Upload dokumen per pinjaman (v3.0: foto jaminan dkk) ke
  /// {uid}/loan/{loanId}/{timestamp}.jpg + catat di loan_documents.
  Future<void> uploadLoanDocument({
    required String loanId,
    required String docType, // 'jaminan' | 'pendukung'
    required File file,
    required String contentType,
  }) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    final ext = contentType.contains('png') ? 'png' : 'jpg';
    final path =
        '$uid/loan/$loanId/${DateTime.now().millisecondsSinceEpoch}.$ext';
    try {
      await client.storage.from(bucket).upload(
            path,
            file,
            fileOptions: const FileOptions(cacheControl: '3600', upsert: true),
          );
      await client.from('loan_documents').insert({
        'loan_id': loanId,
        'doc_type': docType,
        'storage_path': path,
      });
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Daftar dokumen suatu pinjaman (jaminan + pendukung).
  Future<List<Map<String, dynamic>>> fetchLoanDocuments(String loanId) async {
    try {
      final rows = await client
          .from('loan_documents')
          .select()
          .eq('loan_id', loanId)
          .order('created_at', ascending: false)
          .timeout(const Duration(seconds: 15));
      return (rows as List)
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  // ======================= CALON NASABAH (M6b) ============================

  /// Petugas daftarkan calon nasabah di lapangan: upload foto KTP ke bucket
  /// (path calon/{uid}/{timestamp}.jpg) + insert baris calon_nasabah.
  Future<void> submitCalon({
    required String nama,
    required String nik,
    required String phone,
    required String alamat,
    required String wilayah,
    required File ktpFile,
  }) async {
    final uid = currentUserId;
    if (uid == null) throw AppDataException('Belum login.');
    if (nama.trim().isEmpty) throw AppDataException('Nama wajib diisi.');
    if (!RegExp(r'^\d{16}$').hasMatch(nik.trim())) {
      throw AppDataException('NIK harus 16 digit angka.');
    }
    if (!isValidIdPhone(phone)) {
      throw AppDataException('Nomor HP tidak valid (format 08…).');
    }
    try {
      final path =
          'calon/$uid/${DateTime.now().millisecondsSinceEpoch}.jpg';
      await client.storage.from(bucket).upload(
            path,
            ktpFile,
            fileOptions: const FileOptions(cacheControl: '3600', upsert: true),
          );
      await client.from('calon_nasabah').insert({
        'petugas_id': uid,
        'nama': nama.trim(),
        'nik': nik.trim(),
        'phone': phone.trim(),
        'alamat': alamat.trim(),
        'wilayah': wilayah.trim(),
        'ktp_path': path,
      });
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }

  /// Calon yang pernah didaftarkan petugas ini (untuk tracking status).
  Future<List<CalonNasabah>> fetchCalonSaya() async {
    final uid = currentUserId;
    if (uid == null) return [];
    try {
      final rows = await client
          .from('calon_nasabah')
          .select()
          .eq('petugas_id', uid)
          .order('created_at', ascending: false)
          .limit(100)
          .timeout(const Duration(seconds: 15));
      return (rows as List)
          .map((e) => CalonNasabah.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (e) {
      throw AppDataException(_friendly(e));
    }
  }
}
