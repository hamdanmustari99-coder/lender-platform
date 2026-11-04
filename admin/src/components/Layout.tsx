import { NavLink, Outlet } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/loans', label: 'Pinjaman', end: false },
  { to: '/setoran', label: 'Setoran', end: false },
  { to: '/laporan', label: 'Laporan', end: false },
  { to: '/users', label: 'Users', end: false },
]

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-56 flex-col bg-slate-900 text-slate-200">
        <div className="px-5 py-5 text-lg font-bold text-white">
          💵 Danaku <span className="text-emerald-400">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm ${
                  isActive
                    ? 'bg-emerald-600 font-medium text-white'
                    : 'hover:bg-slate-800'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="m-3 rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-red-600"
        >
          Keluar
        </button>
      </aside>
      <main className="flex-1 p-6">
        {!isConfigured && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-800">
            ⚠️ Konfigurasi Supabase belum diisi — isi <code>VITE_SUPABASE_URL</code> dan{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> di <code>admin/.env</code>, lalu restart
            dev server.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
