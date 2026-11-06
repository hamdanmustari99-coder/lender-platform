import { NavLink, Outlet } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'

/**
 * NAV — dipakai dua tempat:
 *   • desktop (lg+): tab di top navbar
 *   • mobile  (<lg) : bottom navigation bar
 *
 * "+ Pinjaman Baru" sengaja TIDAK masuk bottom bar — 5 item sudah penuh
 * untuk lebar 360–430px. Di mobile aksi itu jadi FAB (tombol melayang)
 * supaya tetap satu klik dari halaman mana pun.
 */
const NAV = [
  { to: '/', label: 'Dashboard', short: 'Home', end: true, icon: HomeIcon },
  { to: '/loans', label: 'Pinjaman', short: 'Pinjaman', end: false, icon: LoanIcon },
  { to: '/users', label: 'Nasabah', short: 'Nasabah', end: false, icon: UsersIcon },
  { to: '/arus-kas', label: 'Arus Kas', short: 'Kas', end: false, icon: CashIcon },
  { to: '/setoran', label: 'Revisi', short: 'Revisi', end: false, icon: WalletIcon },
  { to: '/laporan', label: 'Laporan', short: 'Laporan', end: false, icon: ChartIcon },
]

const tabBase =
  'dm-nav-tab min-h-11 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800'
const tabIdle = 'dm-nav-tab-idle text-slate-300'
const tabActive = 'dm-nav-tab-active bg-primary-600 text-white font-bold focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800 antialiased">
      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-30 bg-admin-dark text-white shadow-md">
        <div className="mx-auto flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4 lg:max-w-7xl">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-sm font-black text-slate-950 sm:h-9 sm:w-9 sm:text-base">
              SW
            </div>
            <div className="min-w-0">
              <span className="block truncate text-base font-extrabold tracking-tight sm:text-lg">
                SW<span className="text-primary-400">Finance</span>
              </span>
              <span className="hidden rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-primary-400 sm:inline-block">
                ADMIN &amp; OWNER PANEL
              </span>
            </div>
          </div>

          {/* Navigation Tabs (desktop only) */}
          <nav className="hidden items-center gap-1 rounded-xl bg-slate-800 p-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `${tabBase} ${isActive ? tabActive : tabIdle}`
                }
              >
                {n.label}
              </NavLink>
            ))}
            <NavLink
              to="/loans/new"
              className={({ isActive }) =>
                `${tabBase} ${isActive ? tabActive : 'dm-nav-cta bg-primary-600 text-white font-bold'}`
              }
            >
              + Pinjaman Baru
            </NavLink>
          </nav>

          {/* User & Logout */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <span className="block text-xs font-bold text-white">
                Owner (Super Admin)
              </span>
              <span className="block text-[10px] font-medium text-primary-400">
                Bunga Flat 20% Active
              </span>
            </div>
            <button
              onClick={() => void supabase.auth.signOut()}
              title="Keluar"
              aria-label="Keluar"
              className="rounded-xl bg-slate-800 p-2 text-slate-300 transition hover:bg-rose-900/60 hover:text-rose-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT — pb-24 di mobile supaya tidak ketutup bottom bar + FAB */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-28 motion-safe:animate-[dm-page-in_180ms_ease-out] sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
        {!isConfigured && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-800">
            ⚠️ Konfigurasi Supabase belum diisi — isi{' '}
            <code>VITE_SUPABASE_URL</code> dan{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> di <code>admin/.env</code>, lalu
            restart dev server.
          </div>
        )}
        <Outlet />
      </main>

      {/* FAB "+ Pinjaman Baru" — mobile only, mengambang di atas bottom bar */}
      <NavLink
        to="/loans/new"
        aria-label="Pinjaman Baru"
        className="fixed bottom-[4.75rem] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-xl shadow-primary-600/40 transition active:scale-95 lg:hidden"
      >
        <svg
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </NavLink>

      {/* BOTTOM NAVIGATION BAR — mobile only */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-admin-dark pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Menu utama"
      >
        <div className="flex items-stretch justify-around">
          {NAV.filter((n) => n.to !== '/setoran').map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${
                  isActive
                    ? 'text-primary-400'
                    : 'text-slate-400 active:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                      isActive ? 'bg-primary-600/25' : ''
                    }`}
                  >
                    <n.icon className="h-5 w-5" />
                  </span>
                  <span className="max-w-full truncate px-0.5">{n.short}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ============================================================
   Ikon bottom bar — inline SVG, tanpa dependency tambahan
   ============================================================ */
type IconProps = { className?: string }

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
    </svg>
  )
}

function UsersIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  )
}

function LoanIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A2.25 2.25 0 015.25 5.25h13.5A2.25 2.25 0 0121 7.5v9a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 16.5v-9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18m-5.25 4.5h2.25" />
    </svg>
  )
}

function CashIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function WalletIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  )
}

function ChartIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  )
}
