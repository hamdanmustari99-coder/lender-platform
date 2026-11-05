import { NavLink, Outlet } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/loans', label: '+ Pinjaman Baru', end: false },
  { to: '/users', label: 'Nasabah', end: false },
  { to: '/arus-kas', label: 'Arus Kas', end: false },
  { to: '/setoran', label: 'Setoran', end: false },
  { to: '/laporan', label: 'Laporan', end: false },
]

const tabBase =
  'px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap'
const tabIdle = 'text-slate-300 hover:text-white hover:bg-slate-800'
const tabActive = 'bg-primary-600 text-white shadow-sm font-bold'

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-800 antialiased">
      {/* TOP NAVBAR */}
      <header className="sticky top-0 z-30 bg-admin-dark text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-base font-black text-slate-950">
              DM
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight">
                Dana<span className="text-primary-400">Modal</span>
              </span>
              <span className="ml-2 hidden rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-primary-400 sm:inline-block">
                ADMIN &amp; OWNER PANEL
              </span>
            </div>
          </div>

          {/* Navigation Tabs (desktop) */}
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
          </nav>

          {/* User & Logout */}
          <div className="flex items-center gap-3">
            <div className="text-right">
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

        {/* Mobile tab bar */}
        <div className="flex gap-1 overflow-x-auto border-t border-slate-700 bg-slate-800 px-2 py-1 text-xs lg:hidden">
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
        </div>
      </header>

      {/* CONTENT */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
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
    </div>
  )
}
