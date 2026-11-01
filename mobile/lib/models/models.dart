/// Model sederhana tanpa codegen — cukup factory dari Map Supabase.
library;

class AppProfile {
  final String id;
  final String role; // borrower | admin
  final String email;
  final String fullName; // = nama sesuai KTP
  // --- Data KTP (model koperasi) ---
  final String nik;
  final String tempatLahir;
  final String jenisKelamin; // L | P | ''
  final String rtRw;
  final String kelurahan;
  final String kecamatan;
  final String kota;
  final String provinsi;
  final String agama;
  final String statusKawin;
  final String pekerjaan;
  final String kewarganegaraan;
  // --- Kontak ---
  final String phone; // nomor utama
  final DateTime? birthDate;
  final String address;
  final String kycStatus; // pending | verified | rejected

  const AppProfile({
    required this.id,
    required this.role,
    required this.email,
    required this.fullName,
    required this.nik,
    this.tempatLahir = '',
    this.jenisKelamin = '',
    this.rtRw = '',
    this.kelurahan = '',
    this.kecamatan = '',
    this.kota = '',
    this.provinsi = '',
    this.agama = '',
    this.statusKawin = '',
    this.pekerjaan = '',
    this.kewarganegaraan = 'WNI',
    required this.phone,
    required this.birthDate,
    required this.address,
    required this.kycStatus,
  });

  bool get isAdmin => role == 'admin';
  bool get isKycVerified => kycStatus == 'verified';

  factory AppProfile.fromJson(Map<String, dynamic> j) => AppProfile(
        id: j['id'] as String,
        role: (j['role'] ?? 'borrower') as String,
        email: (j['email'] ?? '') as String,
        fullName: (j['full_name'] ?? '') as String,
        nik: (j['nik'] ?? '') as String,
        tempatLahir: (j['tempat_lahir'] ?? '') as String,
        jenisKelamin: (j['jenis_kelamin'] ?? '') as String,
        rtRw: (j['rt_rw'] ?? '') as String,
        kelurahan: (j['kelurahan'] ?? '') as String,
        kecamatan: (j['kecamatan'] ?? '') as String,
        kota: (j['kota'] ?? '') as String,
        provinsi: (j['provinsi'] ?? '') as String,
        agama: (j['agama'] ?? '') as String,
        statusKawin: (j['status_kawin'] ?? '') as String,
        pekerjaan: (j['pekerjaan'] ?? '') as String,
        kewarganegaraan: (j['kewarganegaraan'] ?? 'WNI') as String,
        phone: (j['phone'] ?? '') as String,
        birthDate:
            j['birth_date'] == null ? null : DateTime.parse(j['birth_date'] as String),
        address: (j['address'] ?? '') as String,
        kycStatus: (j['kyc_status'] ?? 'pending') as String,
      );
}

/// Kontak darurat borrower (seq 1 & 2).
class EmergencyContact {
  final String id;
  final int seq;
  final String nama;
  final String hubungan;
  final String nomor;

  const EmergencyContact({
    required this.id,
    required this.seq,
    required this.nama,
    required this.hubungan,
    required this.nomor,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> j) => EmergencyContact(
        id: j['id'] as String,
        seq: (j['seq'] as num).toInt(),
        nama: (j['nama'] ?? '') as String,
        hubungan: (j['hubungan'] ?? '') as String,
        nomor: (j['nomor'] ?? '') as String,
      );
}

class Loan {
  final String id;
  final String userId;
  final int amount;
  final int tenorMonths; // jumlah periode (weekly s/d 52 / monthly s/d 12)
  final String frequency; // weekly | monthly (v2.0 bank keliling)
  final double interestRate; // flat % per periode (v2.0: 15.00)
  final int monthlyPayment; // cicilan per periode (nama kolom dipertahankan)
  final int lateFee;
  final String? collectedBy;
  final String purpose;
  final String status;
  final String? rejectReason;
  final DateTime createdAt;

  const Loan({
    required this.id,
    required this.userId,
    required this.amount,
    required this.tenorMonths,
    this.frequency = 'weekly',
    required this.interestRate,
    required this.monthlyPayment,
    this.lateFee = 0,
    this.collectedBy,
    required this.purpose,
    required this.status,
    required this.rejectReason,
    required this.createdAt,
  });

  /// Total yang harus dibayar (perkiraan tampilan; nilai resmi di server).
  int get totalPayment => monthlyPayment * tenorMonths;

  String get frequencyLabel => frequency == 'weekly' ? 'mingguan' : 'bulanan';

  factory Loan.fromJson(Map<String, dynamic> j) => Loan(
        id: j['id'] as String,
        userId: j['user_id'] as String,
        amount: (j['amount'] as num).toInt(),
        tenorMonths: j['tenor_months'] as int,
        frequency: (j['frequency'] ?? 'weekly') as String,
        interestRate: (j['interest_rate'] as num).toDouble(),
        monthlyPayment: (j['monthly_payment'] as num).toInt(),
        lateFee: (j['late_fee'] as num?)?.toInt() ?? 0,
        collectedBy: j['collected_by'] as String?,
        purpose: (j['purpose'] ?? '') as String,
        status: j['status'] as String,
        rejectReason: j['reject_reason'] as String?,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}

class Installment {
  final String id;
  final String loanId;
  final int seq;
  final DateTime dueDate;
  final int amount;
  final int amountPaid; // v2.0: terkumpul (parsial)
  final String? paidBy; // v2.0: petugas penerima
  final String status; // unpaid | paid | overdue
  final DateTime? paidAt;

  const Installment({
    required this.id,
    required this.loanId,
    required this.seq,
    required this.dueDate,
    required this.amount,
    this.amountPaid = 0,
    this.paidBy,
    required this.status,
    required this.paidAt,
  });

  int get remaining => amount - amountPaid;

  factory Installment.fromJson(Map<String, dynamic> j) => Installment(
        id: j['id'] as String,
        loanId: j['loan_id'] as String,
        seq: j['seq'] as int,
        dueDate: DateTime.parse(j['due_date'] as String),
        amount: (j['amount'] as num).toInt(),
        amountPaid: (j['amount_paid'] as num?)?.toInt() ?? 0,
        paidBy: j['paid_by'] as String?,
        status: j['status'] as String,
        paidAt: j['paid_at'] == null
            ? null
            : DateTime.parse(j['paid_at'] as String),
      );
}

/// Satu baris rute tagihan petugas: cicilan + info loan + nasabah (v2.0).
class RouteTask {
  final Installment installment;
  final String loanId;
  final int loanAmount;
  final String frequency;
  final String borrowerName;
  final String borrowerAddress;
  final String borrowerPhone;

  const RouteTask({
    required this.installment,
    required this.loanId,
    required this.loanAmount,
    required this.frequency,
    required this.borrowerName,
    required this.borrowerAddress,
    required this.borrowerPhone,
  });
}

/// Setoran tunai tercatat (v2.0).
class Payment {
  final String id;
  final String loanId;
  final String? installmentId;
  final String nasabahId;
  final String? petugasId;
  final int amount;
  final DateTime paidAt;
  final String note;

  const Payment({
    required this.id,
    required this.loanId,
    required this.installmentId,
    required this.nasabahId,
    required this.petugasId,
    required this.amount,
    required this.paidAt,
    required this.note,
  });

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: j['id'] as String,
        loanId: j['loan_id'] as String,
        installmentId: j['installment_id'] as String?,
        nasabahId: j['nasabah_id'] as String,
        petugasId: j['petugas_id'] as String?,
        amount: (j['amount'] as num).toInt(),
        paidAt: DateTime.parse(j['paid_at'] as String),
        note: (j['note'] ?? '') as String,
      );
}

class AppNotification {
  final String id;
  final String userId;
  final String title;
  final String body;
  final String type;
  final bool isRead;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.body,
    required this.type,
    required this.isRead,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        userId: j['user_id'] as String,
        title: (j['title'] ?? '') as String,
        body: (j['body'] ?? '') as String,
        type: (j['type'] ?? 'info') as String,
        isRead: (j['is_read'] ?? false) as bool,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}

class KycDoc {
  final String id;
  final String docType; // ktp | selfie
  final String storagePath;

  const KycDoc({required this.id, required this.docType, required this.storagePath});

  factory KycDoc.fromJson(Map<String, dynamic> j) => KycDoc(
        id: j['id'] as String,
        docType: j['doc_type'] as String,
        storagePath: j['storage_path'] as String,
      );
}

/// Input form kontak darurat (belum punya id server).
class EmergencyContactInput {
  final int seq; // 1 | 2
  final String nama;
  final String hubungan;
  final String nomor;

  const EmergencyContactInput({
    required this.seq,
    required this.nama,
    required this.hubungan,
    required this.nomor,
  });
}

/// Calon nasabah yang didaftarkan petugas di lapangan (M6b).
/// Owner meng-convert jadi akun via menu admin.
class CalonNasabah {
  final String id;
  final String petugasId;
  final String nama;
  final String nik;
  final String phone;
  final String alamat;
  final String wilayah;
  final String ktpPath;
  final String status; // baru | diproses | jadi_nasabah | ditolak
  final String ownerNote;
  final DateTime createdAt;

  const CalonNasabah({
    required this.id,
    required this.petugasId,
    required this.nama,
    required this.nik,
    required this.phone,
    required this.alamat,
    required this.wilayah,
    required this.ktpPath,
    required this.status,
    required this.ownerNote,
    required this.createdAt,
  });

  factory CalonNasabah.fromJson(Map<String, dynamic> j) => CalonNasabah(
        id: j['id'] as String,
        petugasId: (j['petugas_id'] ?? '') as String,
        nama: (j['nama'] ?? '') as String,
        nik: (j['nik'] ?? '') as String,
        phone: (j['phone'] ?? '') as String,
        alamat: (j['alamat'] ?? '') as String,
        wilayah: (j['wilayah'] ?? '') as String,
        ktpPath: (j['ktp_path'] ?? '') as String,
        status: (j['status'] ?? 'baru') as String,
        ownerNote: (j['owner_note'] ?? '') as String,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}
