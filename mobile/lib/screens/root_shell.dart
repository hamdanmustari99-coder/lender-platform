import 'package:flutter/material.dart';

import '../../services/supabase_service.dart';
import 'dashboard_screen.dart';
import 'loans_screen.dart';
import 'nasabah_screen.dart';
import 'setoran_screen.dart';
import 'profile_screen.dart';

/// Shell dengan bottom nav 5 tab (admin/owner, satu peran).
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _index = 0;

  static const _titles = ['Beranda', 'Pinjaman', 'Nasabah', 'Setoran', 'Profil'];

  void _go(int i) {
    if (i == _index) return;
    setState(() => _index = i);
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      DashboardScreen(onLihatPinjaman: () => _go(1)),
      const LoansScreen(),
      const NasabahScreen(),
      const SetoranScreen(),
      ProfileScreen(onKeluar: () => _go(0)),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                'SW Finance',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: Colors.white.withValues(alpha: 0.85),
                ),
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _go,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Beranda',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Pinjaman',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Nasabah',
          ),
          NavigationDestination(
            icon: Icon(Icons.payments_outlined),
            selectedIcon: Icon(Icons.payments),
            label: 'Setoran',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profil',
          ),
        ],
      ),
    );
  }
}

/// Keluar dari sesi — dipanggil dari halaman Profil.
Future<void> signOutAndReset() => ApiService.instance.signOut();
