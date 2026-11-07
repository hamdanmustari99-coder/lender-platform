import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';

/// Lapisan akses data SWFinance Mobile — admin/owner saja.
///
/// Semua query sengaja eksplisit kolomnya (bukan `select('*')`) supaya kolom
/// sensitif — terutama `email` dummy nasabah (`nNIK@danaku.test`) — tidak pernah
/// terbawa ke HP admin. RLS di sisi server tetap jadi penjaga terakhir.
class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  SupabaseClient get _c => Supabase.instance.client;

  String? get currentUserId => _c.auth.currentUser?.id;

  // ---------- auth ----------

  Future<void> signIn(String email, String password) async {
    await _c.auth.signInWithPassword(email: email.trim(), password: password);
  }

  Future<void> signOut() async {
    await _c.auth.signOut();
  }

  /// Profil admin yang sedang login.
  Future<Profile> fetchMe() async {
    final uid = currentUserId;
    if (uid == null) {
      throw StateError('Sesi tidak ditemukan. Silakan masuk kembali.');
    }
    final row = await _c
        .from('profiles')
        .select(_profileCols)
        .eq('id', uid)
        .maybeSingle();
    if (row == null) throw StateError('Profil tidak ditemukan di server.');
    return Profile.fromJson(Map<String, dynamic>.from(row));
  }

  // ---------- dashboard ----------

  Future<LaporanRingkasan> fetchRingkasan() async {
    final loans = await fetchLoans();

    var pokok = 0;
    var piutang = 0;
    final aktif = <String>{};
    for (final l in loans) {
      if (l.status == LoanStatus.completed ||
          l.status == LoanStatus.rejected) {
        continue;
      }
      pokok += l.amount;
      aktif.add(l.userId);
      final insts = await fetchInstallments(l.id);
      for (final i in insts) {
        if (!i.isPaid) piutang += i.sisa;
      }
    }
    return LaporanRingkasan(
      totalPinjaman: pokok,
      totalPiutang: piutang,
      totalTerkumpul: 0,
      nasabahAktif: aktif.length,
    );
  }

  /// Pembayaran valid hari ini (WIB) — sudah buang void + reversal.
  Future<List<Payment>> fetchPaymentsToday() async {
    final rows = await _c
        .from('payments')
        .select('id, amount, paid_at, note, nasabah_id, voided_at, void_of')
        .order('paid_at', ascending: false)
        .limit(500);
    final all =
        (rows as List).map((e) => Payment.fromJson(Map<String, dynamic>.from(e)));
    final today = _wibDate(DateTime.now());
    return all.where((p) => p.isValidRow && _wibDate(DateTime.parse(p.paidAt)) == today).toList();
  }

  // ---------- pinjaman ----------

  Future<List<Loan>> fetchLoans({int limit = 200}) async {
    final rows = await _c
        .from('loans')
        .select(
            'id, user_id, amount, requested_amount, collateral_type, collateral_detail, tenor_months, frequency, interest_rate, monthly_payment, late_fee, dicatat_oleh, purpose, status, created_at, profiles!loans_user_id_fkey(full_name, nik, phone, kyc_status)')
        .order('created_at', ascending: false)
        .limit(limit);
    return (rows as List)
        .map((e) => Loan.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Loan> fetchLoan(String id) async {
    final row = await _c
        .from('loans')
        .select(
            'id, user_id, amount, requested_amount, collateral_type, collateral_detail, tenor_months, frequency, interest_rate, monthly_payment, late_fee, dicatat_oleh, purpose, status, created_at, profiles!loans_user_id_fkey(full_name, nik, phone, kyc_status)')
        .eq('id', id)
        .single();
    return Loan.fromJson(Map<String, dynamic>.from(row));
  }

  /// Buat & cairkan pinjaman baru — nominal final, langsung cair.
  /// Server yang hitung cicilan, jadwal, dan arus kas keluar (RPC security
  /// definer, cek admin via is_admin()). Parameter identik dengan web.
  Future<String> createLoan({
    required String userId,
    required int amount,
    required int tenor,
    required LoanFrequency frequency,
    String purpose = '',
    String collateralType = '',
    String collateralDetail = '',
  }) async {
    final data = await _c.rpc('admin_create_loan', params: {
      'p_user_id': userId,
      'p_amount': amount,
      'p_tenor': tenor,
      'p_frequency': frequency.name,
      'p_purpose': purpose.trim(),
      'p_collateral_type': collateralType.trim(),
      'p_collateral_detail': collateralDetail.trim(),
    });
    return data as String;
  }

  Future<List<Installment>> fetchInstallments(String loanId) async {
    final rows = await _c
        .from('installments')
        .select('id, loan_id, seq, due_date, amount, amount_paid, status, paid_at')
        .eq('loan_id', loanId)
        .order('seq', ascending: true);
    return (rows as List)
        .map((e) => Installment.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Catat pembayaran tunai — server yang menghitung alokasi & kelebihan.
  Future<void> recordCashPayment(
    String installmentId,
    int amount, {
    String note = '',
  }) async {
    await _c.rpc('record_cash_payment', params: {
      'p_installment_id': installmentId,
      'p_amount': amount,
      'p_note': note,
    });
  }

  /// Koreksi pembayaran: void lalu catat ulang nominal benar.
  Future<void> voidAndRepay(
    String paymentId,
    String reason,
    int correctAmount, {
    String note = '',
  }) async {
    await _c.rpc('void_and_repay', params: {
      'p_payment_id': paymentId,
      'p_reason': reason,
      'p_correct_amount': correctAmount,
      'p_correct_note': note,
    });
  }

  Future<void> voidPayment(String paymentId, String reason) async {
    await _c.rpc('void_payment', params: {
      'p_payment_id': paymentId,
      'p_reason': reason,
    });
  }

  // ---------- nasabah ----------

  Future<List<Profile>> fetchNasabah({int limit = 200}) async {
    final rows = await _c
        .from('profiles')
        .select(_profileCols)
        .order('full_name', ascending: true)
        .limit(limit);
    return (rows as List)
        .map((e) => Profile.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Profile> fetchNasabahById(String id) async {
    final row = await _c
        .from('profiles')
        .select(_profileCols)
        .eq('id', id)
        .single();
    return Profile.fromJson(Map<String, dynamic>.from(row));
  }

  // ---------- pembayaran riwayat ----------

  Future<List<Payment>> fetchPaymentsForLoan(String loanId) async {
    final rows = await _c
        .from('payments')
        .select('id, amount, paid_at, note, nasabah_id, voided_at, void_of')
        .eq('loan_id', loanId)
        .order('paid_at', ascending: false)
        .limit(200);
    final all =
        (rows as List).map((e) => Payment.fromJson(Map<String, dynamic>.from(e)));
    return all.where((p) => p.isValidRow).toList();
  }

  // ---------- util ----------

  /// Tanggal WIB — timestamptz dari PostgREST UTC, agregat harus ikut Zona
  /// WIB (server memotong periode di Asia/Jakarta).
  static String _wibDate(DateTime utc) {
    final shifted = utc.add(const Duration(hours: 7));
    final y = shifted.year.toString().padLeft(4, '0');
    final m = shifted.month.toString().padLeft(2, '0');
    final d = shifted.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  /// Kolom profil yang boleh terbawa ke HP — email SENGAJA tidak dipilih.
  static const _profileCols =
      'id, role, full_name, nik, phone, address, current_address, office_address, '
      'rt_rw, kelurahan, kecamatan, kota, provinsi, tempat_lahir, birth_date, '
      'jenis_kelamin, agama, status_kawin, pekerjaan, kewarganegaraan, home_lat, '
      'home_lng, status_keandalan, kyc_status, created_at';
}
