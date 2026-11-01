import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/supabase_service.dart';
import 'apply_loan_screen.dart';
import 'home_screen.dart';
import 'kyc_screen.dart';
import 'loans_screen.dart';
import 'notifications_screen.dart';
import 'profile_screen.dart';
import 'route_screen.dart';
import 'daftar_nasabah_screen.dart';
import 'setoran_screen.dart';

/// Kerangka utama setelah login — bercabang per peran (v2.0 bank keliling):
/// - nasabah/admin: bottom nav 5 tab (Beranda, Ajukan, Pinjaman, Notifikasi, Profil)
/// - petugas: bottom nav 4 tab (Rute, Setoran, Notifikasi, Profil)
/// + badge notifikasi belum-baca via realtime.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  final _svc = SupabaseService.instance;

  int _index = 0;
  AppProfile? _profile;
  bool _profileLoading = true;
  String? _profileError;

  /// Jumlah notifikasi belum dibaca — dipakai badge bottom nav.
  final ValueNotifier<int> unread = ValueNotifier<int>(0);

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadUnread();
    _subscribeRealtime();
  }

  void _subscribeRealtime() {
    if (!_svc.isConfigured) return;
    // postgres_changes INSERT pada notifications (difilter user_id oleh RLS).
    _svc.subscribeNotifications((notif) {
      if (!notif.isRead) unread.value = unread.value + 1;
    });
  }

  Future<void> _loadUnread() async {
    if (!_svc.isConfigured) return;
    try {
      unread.value = await _svc.fetchUnreadCount();
    } catch (_) {
      // badge best-effort; halaman notifikasi menampilkan error lengkap
    }
  }

  Future<void> _loadProfile() async {
    setState(() {
      _profileLoading = true;
      _profileError = null;
    });
    try {
      final p = await _svc.fetchProfile();
      if (!mounted) return;
      // cache role untuk service (mode petugas vs nasabah)
      _svc.fetchProfileCachedRole = p?.role ?? 'nasabah';
      if ((_svc.fetchProfileCachedRole != 'petugas' &&
              _svc.fetchProfileCachedRole != 'nasabah' &&
              _svc.fetchProfileCachedRole != 'admin')) {
        _svc.fetchProfileCachedRole = 'nasabah';
      }
      setState(() {
        _profile = p;
        _profileLoading = false;
        if (p == null) {
          _profileError =
              'Profile belum ditemukan. Tarik ke bawah untuk memuat ulang.';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _profileError = e.toString();
        _profileLoading = false;
      });
    }
  }

  Future<void> _logout() async {
    await _svc.signOut();
  }

  Future<void> _openKyc() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => KycScreen(profile: _profile, onCompleted: _loadProfile),
    ));
    await _loadProfile();
  }

  @override
  void dispose() {
    unread.dispose();
    super.dispose();
  }

  bool get _isPetugas => _profile?.role == 'petugas';

  @override
  Widget build(BuildContext context) {
    if (_isPetugas) return _buildPetugas();

    final pages = [
      HomeScreen(
        profile: _profile,
        loading: _profileLoading,
        error: _profileError,
        reload: _loadProfile,
        onOpenKyc: _openKyc,
        onGoApply: () => setState(() => _index = 1),
        onGoLoans: () => setState(() => _index = 2),
      ),
      ApplyLoanScreen(
        profile: _profile,
        profileLoading: _profileLoading,
        reloadProfile: _loadProfile,
        onOpenKyc: _openKyc,
      ),
      const LoansScreen(),
      NotificationsScreen(unread: unread, onChanged: _loadUnread),
      ProfileScreen(
        profile: _profile,
        loading: _profileLoading,
        reload: _loadProfile,
        onLogout: _logout,
        onOpenKyc: _openKyc,
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Beranda',
          ),
          const NavigationDestination(
            icon: Icon(Icons.post_add_outlined),
            selectedIcon: Icon(Icons.post_add_rounded),
            label: 'Ajukan',
          ),
          const NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded),
            label: 'Pinjaman',
          ),
          NavigationDestination(
            icon: _badgeIcon(Icons.notifications_outlined),
            selectedIcon: _badgeIcon(Icons.notifications_rounded),
            label: 'Notifikasi',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Profil',
          ),
        ],
      ),
    );
  }

  /// Layout khusus petugas: Rute, Setoran, Daftar, Notifikasi, Profil.
  Widget _buildPetugas() {
    final safeIndex = _index.clamp(0, 4);
    final pages = [
      const RouteScreen(),
      const SetoranScreen(),
      const DaftarNasabahScreen(),
      NotificationsScreen(unread: unread, onChanged: _loadUnread),
      ProfileScreen(
        profile: _profile,
        loading: _profileLoading,
        reload: _loadProfile,
        onLogout: _logout,
        onOpenKyc: _openKyc,
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: safeIndex, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.route_outlined),
            selectedIcon: Icon(Icons.route_rounded),
            label: 'Rute',
          ),
          const NavigationDestination(
            icon: Icon(Icons.payments_outlined),
            selectedIcon: Icon(Icons.payments_rounded),
            label: 'Setoran',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_add_outlined),
            selectedIcon: Icon(Icons.person_add_rounded),
            label: 'Daftar',
          ),
          NavigationDestination(
            icon: _badgeIcon(Icons.notifications_outlined),
            selectedIcon: _badgeIcon(Icons.notifications_rounded),
            label: 'Notifikasi',
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Profil',
          ),
        ],
      ),
    );
  }

  Widget _badgeIcon(IconData icon) {
    return ValueListenableBuilder<int>(
      valueListenable: unread,
      builder: (context, count, _) {
        if (count <= 0) return Icon(icon);
        return Badge(
          label: Text(count > 99 ? '99+' : '$count'),
          child: Icon(icon),
        );
      },
    );
  }
}
