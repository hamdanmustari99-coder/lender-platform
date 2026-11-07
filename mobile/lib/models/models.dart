/// Model data SWFinance Mobile — kontrak dengan `supabase/schema.sql`.
/// Nama kolom mengikuti `admin/src/lib/api.ts` (sumber kebenaran web).
library;

// ---------- enum ----------

enum UserRole { admin, nasabah }

UserRole userRoleFromString(String? v) =>
    v == 'admin' ? UserRole.admin : UserRole.nasabah;

enum KycStatus { pending, verified, rejected }

KycStatus kycStatusFromString(String? v) {
  switch (v) {
    case 'verified':
      return KycStatus.verified;
    case 'rejected':
      return KycStatus.rejected;
    default:
      return KycStatus.pending;
  }
}

String kycStatusLabel(KycStatus s) {
  switch (s) {
    case KycStatus.verified:
      return 'Terverifikasi';
    case KycStatus.rejected:
      return 'Ditolak';
    case KycStatus.pending:
      return 'Menunggu';
  }
}

enum LoanStatus { disbursed, active, completed, rejected }

LoanStatus loanStatusFromString(String? v) {
  switch (v) {
    case 'active':
      return LoanStatus.active;
    case 'completed':
      return LoanStatus.completed;
    case 'rejected':
      return LoanStatus.rejected;
    default:
      return LoanStatus.disbursed;
  }
}

String loanStatusLabel(LoanStatus s) {
  switch (s) {
    case LoanStatus.disbursed:
      return 'Baru cair';
    case LoanStatus.active:
      return 'Berjalan';
    case LoanStatus.completed:
      return 'Lunas';
    case LoanStatus.rejected:
      return 'Ditolak';
  }
}

enum InstallmentStatus { unpaid, paid, overdue }

InstallmentStatus installmentStatusFromString(String? v) {
  switch (v) {
    case 'paid':
      return InstallmentStatus.paid;
    case 'overdue':
      return InstallmentStatus.overdue;
    default:
      return InstallmentStatus.unpaid;
  }
}

String installmentStatusLabel(InstallmentStatus s) {
  switch (s) {
    case InstallmentStatus.paid:
      return 'Lunas';
    case InstallmentStatus.overdue:
      return 'Telat';
    case InstallmentStatus.unpaid:
      return 'Belum bayar';
  }
}

enum LoanFrequency { weekly, monthly }

LoanFrequency loanFrequencyFromString(String? v) =>
    v == 'weekly' ? LoanFrequency.weekly : LoanFrequency.monthly;

String loanFrequencyLabel(LoanFrequency f) =>
    f == LoanFrequency.weekly ? 'Mingguan' : 'Bulanan';

enum StatusKeandalan { lancar, peringatan, macet }

StatusKeandalan statusKeandalanFromString(String? v) {
  switch (v) {
    case 'PERINGATAN':
      return StatusKeandalan.peringatan;
    case 'MACET':
      return StatusKeandalan.macet;
    default:
      return StatusKeandalan.lancar;
  }
}

String statusKeandalanLabel(StatusKeandalan s) {
  switch (s) {
    case StatusKeandalan.lancar:
      return 'Lancar';
    case StatusKeandalan.peringatan:
      return 'Peringatan';
    case StatusKeandalan.macet:
      return 'Macet';
  }
}

// ---------- entities ----------

class Profile {
  const Profile({
    required this.id,
    required this.role,
    required this.email,
    required this.fullName,
    this.nik,
    this.phone,
    this.address,
    this.currentAddress,
    this.officeAddress,
    this.rtRw,
    this.kelurahan,
    this.kecamatan,
    this.kota,
    this.provinsi,
    this.tempatLahir,
    this.birthDate,
    this.jenisKelamin,
    this.agama,
    this.statusKawin,
    this.pekerjaan,
    this.kewarganegaraan,
    this.homeLat,
    this.homeLng,
    this.statusKeandalan = StatusKeandalan.lancar,
    this.kycStatus = KycStatus.pending,
    required this.createdAt,
  });

  final String id;
  final UserRole role;
  final String email;
  final String fullName;
  final String? nik;
  final String? phone;
  final String? address;
  final String? currentAddress;
  final String? officeAddress;
  final String? rtRw;
  final String? kelurahan;
  final String? kecamatan;
  final String? kota;
  final String? provinsi;
  final String? tempatLahir;
  final String? birthDate;
  final String? jenisKelamin;
  final String? agama;
  final String? statusKawin;
  final String? pekerjaan;
  final String? kewarganegaraan;
  final double? homeLat;
  final double? homeLng;
  final StatusKeandalan statusKeandalan;
  final KycStatus kycStatus;
  final String createdAt;

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  /// Alamat domisili kalau ada, jatuh ke alamat KTP.
  String? get displayAddress => (currentAddress?.trim().isNotEmpty ?? false)
      ? currentAddress
      : address;

  static Profile fromJson(Map<String, dynamic> j) => Profile(
        id: j['id'] as String,
        role: userRoleFromString(j['role'] as String?),
        email: (j['email'] as String?) ?? '',
        fullName: (j['full_name'] as String?) ?? '',
        nik: j['nik'] as String?,
        phone: j['phone'] as String?,
        address: j['address'] as String?,
        currentAddress: j['current_address'] as String?,
        officeAddress: j['office_address'] as String?,
        rtRw: j['rt_rw'] as String?,
        kelurahan: j['kelurahan'] as String?,
        kecamatan: j['kecamatan'] as String?,
        kota: j['kota'] as String?,
        provinsi: j['provinsi'] as String?,
        tempatLahir: j['tempat_lahir'] as String?,
        birthDate: j['birth_date'] as String?,
        jenisKelamin: j['jenis_kelamin'] as String?,
        agama: j['agama'] as String?,
        statusKawin: j['status_kawin'] as String?,
        pekerjaan: j['pekerjaan'] as String?,
        kewarganegaraan: j['kewarganegaraan'] as String?,
        homeLat: (j['home_lat'] as num?)?.toDouble(),
        homeLng: (j['home_lng'] as num?)?.toDouble(),
        statusKeandalan:
            statusKeandalanFromString(j['status_keandalan'] as String?),
        kycStatus: kycStatusFromString(j['kyc_status'] as String?),
        createdAt: (j['created_at'] as String?) ?? '',
      );
}

/// Ringkasan nasabah yang nempel di list pinjaman (embed `profiles`).
class ProfileRef {
  const ProfileRef({
    required this.fullName,
    this.nik,
    this.phone,
    this.kycStatus = KycStatus.pending,
  });

  final String fullName;
  final String? nik;
  final String? phone;
  final KycStatus kycStatus;

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  static ProfileRef? fromJson(dynamic v) {
    if (v is! Map) return null;
    return ProfileRef(
      fullName: (v['full_name'] as String?) ?? '',
      nik: v['nik'] as String?,
      phone: v['phone'] as String?,
      kycStatus: kycStatusFromString(v['kyc_status'] as String?),
    );
  }
}

class Loan {
  const Loan({
    required this.id,
    required this.userId,
    required this.amount,
    this.requestedAmount,
    this.collateralType,
    this.collateralDetail,
    required this.tenorMonths,
    required this.frequency,
    required this.interestRate,
    required this.monthlyPayment,
    this.lateFee = 0,
    this.dicatatOleh,
    this.purpose,
    required this.status,
    required this.createdAt,
    this.profile,
  });

  final String id;
  final String userId;
  final int amount;
  final int? requestedAmount;
  final String? collateralType;
  final String? collateralDetail;
  final int tenorMonths;
  final LoanFrequency frequency;
  final num interestRate;
  final int monthlyPayment;
  final num lateFee;
  final String? dicatatOleh;
  final String? purpose;
  final LoanStatus status;
  final String createdAt;
  final ProfileRef? profile;

  String get nasabahName => profile?.fullName ?? '(tanpa nama)';

  static Loan fromJson(Map<String, dynamic> j) => Loan(
        id: j['id'] as String,
        userId: j['user_id'] as String,
        amount: _asInt(j['amount']),
        requestedAmount: j['requested_amount'] == null
            ? null
            : _asInt(j['requested_amount']),
        collateralType: j['collateral_type'] as String?,
        collateralDetail: j['collateral_detail'] as String?,
        tenorMonths: _asInt(j['tenor_months']),
        frequency: loanFrequencyFromString(j['frequency'] as String?),
        interestRate: (j['interest_rate'] as num?) ?? 0,
        monthlyPayment: _asInt(j['monthly_payment']),
        lateFee: (j['late_fee'] as num?) ?? 0,
        dicatatOleh: j['dicatat_oleh'] as String?,
        purpose: j['purpose'] as String?,
        status: loanStatusFromString(j['status'] as String?),
        createdAt: (j['created_at'] as String?) ?? '',
        profile: ProfileRef.fromJson(j['profiles']),
      );

  static int _asInt(dynamic v) {
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}

class Installment {
  const Installment({
    required this.id,
    required this.loanId,
    required this.seq,
    required this.dueDate,
    required this.amount,
    this.amountPaid = 0,
    required this.status,
    this.paidAt,
  });

  final String id;
  final String loanId;
  final int seq;
  final String dueDate;
  final int amount;
  final int amountPaid;
  final InstallmentStatus status;
  final String? paidAt;

  int get sisa => (amount - amountPaid).clamp(0, 1 << 62);

  bool get isPaid => status == InstallmentStatus.paid || sisa <= 0;

  static Installment fromJson(Map<String, dynamic> j) => Installment(
        id: j['id'] as String,
        loanId: j['loan_id'] as String,
        seq: Loan._asInt(j['seq']),
        dueDate: (j['due_date'] as String?) ?? '',
        amount: Loan._asInt(j['amount']),
        amountPaid: Loan._asInt(j['amount_paid']),
        status: installmentStatusFromString(j['status'] as String?),
        paidAt: j['paid_at'] as String?,
      );
}

class Payment {
  const Payment({
    required this.id,
    required this.amount,
    required this.paidAt,
    this.note,
    this.nasabahId,
    this.voidedAt,
    this.voidOf,
  });

  final String id;
  final int amount;
  final String paidAt;
  final String? note;
  final String? nasabahId;
  final String? voidedAt;
  final String? voidOf;

  /// Reversal + baris yang sudah dibatalkan tidak boleh ikut agregat.
  bool get isValidRow => voidOf == null && voidedAt == null;

  static Payment fromJson(Map<String, dynamic> j) => Payment(
        id: j['id'] as String,
        amount: Loan._asInt(j['amount']),
        paidAt: (j['paid_at'] as String?) ?? '',
        note: j['note'] as String?,
        nasabahId: j['nasabah_id'] as String?,
        voidedAt: j['voided_at'] as String?,
        voidOf: j['void_of'] as String?,
      );
}

class LaporanRingkasan {
  const LaporanRingkasan({
    required this.totalPinjaman,
    required this.totalPiutang,
    required this.totalTerkumpul,
    required this.nasabahAktif,
  });

  final int totalPinjaman;
  final int totalPiutang;
  final int totalTerkumpul;
  final int nasabahAktif;
}
