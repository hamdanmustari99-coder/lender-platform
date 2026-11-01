import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import '../widgets/common.dart';

/// Tab Notifikasi: daftar notifikasi user.
/// - Realtime: INSERT baru muncul sendiri via postgres_changes (filter user_id).
/// - Badge unread di bottom nav tersinkron lewat [unread] + [onChanged].
/// - Membuka notifikasi menandainya sudah dibaca (mark-as-read).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.unread, required this.onChanged});

  final ValueNotifier<int> unread;
  final Future<void> Function() onChanged;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _svc = SupabaseService.instance;
  List<AppNotification>? _items;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await _svc.fetchNotifications();
      if (!mounted) return;
      setState(() {
        _items = items;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _open(AppNotification n) async {
    // Tandai dibaca kalau belum.
    if (!n.isRead) {
      try {
        await _svc.markAsRead(n.id);
        if (mounted) {
          setState(() {
            final i = _items!.indexWhere((e) => e.id == n.id);
            if (i >= 0) {
              // Salin dengan isRead=true agar UI langsung berubah.
              _items![i] = AppNotification(
                id: n.id,
                userId: n.userId,
                title: n.title,
                body: n.body,
                type: n.type,
                isRead: true,
                createdAt: n.createdAt,
              );
            }
            // Badge bottom nav dihitung ulang dari list terbaru.
            widget.unread.value = _items!.where((e) => !e.isRead).length;
          });
        }
      } catch (e) {
        if (mounted) showError(context, e);
        return;
      }
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(n.title),
        content: Text(n.body.isEmpty ? '-' : n.body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Tutup'),
          ),
        ],
      ),
    );
  }

  Future<void> _markAll() async {
    try {
      await _svc.markAllAsRead();
      await _load();
      widget.unread.value = 0;
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  IconData _icon(String type) {
    switch (type) {
      case 'loan_status':
        return Icons.account_balance_rounded;
      case 'reminder':
        return Icons.alarm_rounded;
      default:
        return Icons.notifications_rounded;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          ValueListenableBuilder<int>(
            valueListenable: widget.unread,
            builder: (context, unread, _) => TextButton(
              onPressed: unread > 0 ? _markAll : null,
              child: const Text('Tandai dibaca'),
            ),
          ),
        ],
      ),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_error != null) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Card(
              child: ListTile(
                leading: Icon(Icons.error_outline_rounded,
                    color: Theme.of(context).colorScheme.error),
                title: const Text('Gagal memuat notifikasi'),
                subtitle: Text(_error!),
                onTap: _load,
              ),
            ),
          ),
        ],
      );
    }
    if (_items == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items!.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.notifications_none_rounded,
                  size: 72,
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(height: 16),
              Text('Belum ada notifikasi',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(
                'Kabar status pinjaman & pengingat akan muncul di sini.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => Future<void>(() async {
        await _load();
        await widget.onChanged();
      }),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        itemCount: _items!.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final n = _items![i];
          final unread = !n.isRead;
          final cs = Theme.of(context).colorScheme;
          return Card(
            child: ListTile(
              onTap: () => _open(n),
              leading: Badge(
                isLabelVisible: unread,
                smallSize: 10,
                child: CircleAvatar(
                  backgroundColor: cs.primary.withValues(alpha: 0.12),
                  child: Icon(_icon(n.type), color: cs.primary, size: 22),
                ),
              ),
              title: Text(
                n.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
              subtitle: Text(
                n.body.isEmpty ? '-' : n.body,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              isThreeLine: true,
              trailing: Text(
                dateTimeFormat.format(n.createdAt.toLocal()),
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(color: cs.onSurfaceVariant),
              ),
            ),
          );
        },
      ),
    );
  }
}
