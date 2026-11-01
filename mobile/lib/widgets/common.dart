import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

final DateFormat dateFormat = DateFormat('dd MMM yyyy', 'id_ID');
final DateFormat dateTimeFormat = DateFormat('dd MMM yyyy, HH:mm', 'id_ID');

final NumberFormat rupiahFmt = NumberFormat.currency(
  locale: 'id_ID',
  symbol: 'Rp',
  decimalDigits: 0,
);

String rupiahText(num value) => rupiahFmt.format(value);

/// Tampilkan snackbar error yang konsisten.
void showError(BuildContext context, Object error) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(error.toString()),
      backgroundColor: Theme.of(context).colorScheme.error,
      behavior: SnackBarBehavior.floating,
    ));
}

void showInfo(BuildContext context, String message) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(message),
      behavior: SnackBarBehavior.floating,
    ));
}

/// Banner besar yang tampil kalau SUPABASE_URL/KEY masih placeholder.
class UnconfiguredBanner extends StatelessWidget {
  const UnconfiguredBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.errorContainer,
      child: SafeArea(
        bottom: false,
        child: ListTile(
          leading: Icon(Icons.cloud_off_rounded, color: cs.onErrorContainer),
          title: Text(
            'Konfigurasi Supabase belum diisi',
            style: TextStyle(
              color: cs.onErrorContainer,
              fontWeight: FontWeight.w700,
            ),
          ),
          subtitle: Text(
            'Isi SUPABASE_URL & SUPABASE_ANON_KEY lewat --dart-define-from-file '
            'agar fitur akun, pinjaman, dan notifikasi bisa dipakai.',
            style: TextStyle(color: cs.onErrorContainer, fontSize: 12),
          ),
          dense: true,
        ),
      ),
    );
  }
}

/// Chip status seragam untuk loan & cicilan.
class StatusChip extends StatelessWidget {
  final String status;
  const StatusChip({super.key, required this.status});

  (Color, String, IconData) _style(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    switch (status) {
      case 'submitted':
        return (cs.secondaryContainer, 'Diajukan', Icons.send_rounded);
      case 'under_review':
        return (cs.tertiaryContainer, 'Ditinjau', Icons.search_rounded);
      case 'approved':
        return (cs.primaryContainer, 'Disetujui', Icons.check_circle_outline);
      case 'disbursed':
        return (cs.primary, 'Dicairkan', Icons.payments_rounded);
      case 'active':
        return (cs.primary, 'Aktif', Icons.autorenew_rounded);
      case 'completed':
        return (cs.primaryContainer, 'Lunas', Icons.verified_rounded);
      case 'rejected':
        return (cs.errorContainer, 'Ditolak', Icons.cancel_rounded);
      case 'verified':
        return (cs.primaryContainer, 'Terverifikasi', Icons.verified_rounded);
      case 'pending':
        return (cs.tertiaryContainer, 'Menunggu', Icons.schedule_rounded);
      case 'unpaid':
        return (cs.tertiaryContainer, 'Belum Bayar', Icons.schedule_rounded);
      case 'paid':
        return (cs.primaryContainer, 'Lunas', Icons.check_circle_rounded);
      case 'overdue':
        return (cs.errorContainer, 'Terlambat', Icons.warning_rounded);
      default:
        return (cs.surfaceContainerHighest, status, Icons.info_outline);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (color, label, icon) = _style(context);
    final onColor = Theme.of(context).brightness == Brightness.dark
        ? null
        : color.computeLuminance() > 0.5
            ? Colors.black87
            : Colors.white;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: onColor),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: onColor,
            ),
          ),
        ],
      ),
    );
  }
}

/// Baris key:value sederhana untuk halaman detail.
class InfoRow extends StatelessWidget {
  final String label;
  final Widget value;
  const InfoRow({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ),
          Expanded(child: value),
        ],
      ),
    );
  }
}
