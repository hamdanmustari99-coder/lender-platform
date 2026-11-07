import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../format.dart';
import '../models/models.dart';

/// Tema & komponen kecil bersama SWFinance Mobile.
class AppTheme {
  AppTheme._();

  static const brand = Color(0xFF0B6B4F);
  static const brandDark = Color(0xFF08513B);
  static const accent = Color(0xFF10B981);
  static const gold = Color(0xFFF59E0B);
  static const danger = Color(0xFFDC2626);

  static ThemeData light() {
    const scheme = ColorScheme.light(
      primary: brand,
      secondary: accent,
      error: danger,
      surface: Colors.white,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: const Color(0xFFF4F7F5),
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: brand,
        foregroundColor: Colors.white,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: Colors.black.withValues(alpha: 0.06)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        isDense: true,
      ),
    );
  }
}

/// Chip status seragam di seluruh app.
class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  static Color forLoan(LoanStatus s) {
    switch (s) {
      case LoanStatus.completed:
        return AppTheme.accent;
      case LoanStatus.active:
        return AppTheme.brand;
      case LoanStatus.rejected:
        return AppTheme.danger;
      case LoanStatus.disbursed:
        return const Color(0xFF0EA5E9);
    }
  }

  static Color forInstallment(InstallmentStatus s) {
    switch (s) {
      case InstallmentStatus.paid:
        return AppTheme.accent;
      case InstallmentStatus.overdue:
        return AppTheme.danger;
      case InstallmentStatus.unpaid:
        return AppTheme.gold;
    }
  }

  static Color forKyc(KycStatus s) {
    switch (s) {
      case KycStatus.verified:
        return AppTheme.accent;
      case KycStatus.rejected:
        return AppTheme.danger;
      case KycStatus.pending:
        return AppTheme.gold;
    }
  }
}

/// Avatar inisial — nasabah tidak punya foto yang aman ditampilkan.
class InitialAvatar extends StatelessWidget {
  const InitialAvatar(this.initials, {super.key, this.size = 42, this.color});

  final String initials;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppTheme.brand;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Text(
        initials,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          color: c,
          fontSize: size * 0.36,
        ),
      ),
    );
  }
}

/// Baris label-nilai untuk halaman detail.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 116,
            child: Text(
              label,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

/// Tombol telepon / WhatsApp — satu pasangan untuk seluruh app.
class ContactButtons extends StatelessWidget {
  const ContactButtons(this.phone, {super.key, this.pesan});

  final String? phone;
  final String? pesan;

  @override
  Widget build(BuildContext context) {
    final tel = Fmt.telHref(phone);
    final wa = Fmt.waHref(phone, pesan: pesan);
    if (tel == null && wa == null) return const SizedBox.shrink();

    return Row(
      children: [
        if (tel != null)
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () => _open(context, tel),
              icon: const Icon(Icons.call, size: 16),
              label: const Text('Telpon'),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(40),
                visualDensity: VisualDensity.compact,
              ),
            ),
          ),
        if (tel != null && wa != null) const SizedBox(width: 8),
        if (wa != null)
          Expanded(
            child: FilledButton.icon(
              onPressed: () => _open(context, wa),
              icon: const Icon(Icons.chat, size: 16),
              label: const Text('WhatsApp'),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(40),
                backgroundColor: const Color(0xFF16A34A),
              ),
            ),
          ),
      ],
    );
  }

  void _open(BuildContext context, String url) async {
    final uri = Uri.parse(url);
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tidak bisa membuka aplikasi tersebut.')),
        );
      }
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Tidak bisa membuka aplikasi tersebut.')),
      );
    }
  }
}
