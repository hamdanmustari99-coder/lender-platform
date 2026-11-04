import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { fetchMyProfile } from './lib/api'
import Layout from './components/Layout.tsx'
import Login from './pages/Login.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Loans from './pages/Loans.tsx'
import LoanNew from './pages/LoanNew.tsx'
import NasabahBaru from './pages/NasabahBaru.tsx'
import CalonNasabah from './pages/CalonNasabah.tsx'
import LoanDetail from './pages/LoanDetail.tsx'
import Setoran from './pages/Setoran.tsx'
import Laporan from './pages/Laporan.tsx'
import Users from './pages/Users.tsx'
import UserDetail from './pages/UserDetail.tsx'

type View = 'loading' | 'login' | 'denied' | 'admin'

export default function App() {
  const [view, setView] = useState<View>('loading')

  useEffect(() => {
    let mounted = true

    const evaluate = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!mounted) return
        if (!session) {
          setView('login')
          return
        }
        const profile = await fetchMyProfile().catch(() => null)
        if (!mounted) return
        setView(profile?.role === 'admin' ? 'admin' : 'denied')
      } catch {
        if (mounted) setView('login')
      }
    }

    void evaluate()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setView('login')
      else void evaluate()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (view === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        Memuat…
      </div>
    )
  }

  if (view === 'login') return <Login />

  if (view === 'denied') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="text-xl font-bold text-slate-800">Akses Ditolak</h1>
        <p className="max-w-md text-sm text-slate-600">
          Akun Anda bukan admin. Hubungi pemilik platform untuk mendapatkan akses admin,
          atau masuk dengan akun lain.
        </p>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Coba Akun Lain
        </button>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="loans" element={<Loans />} />
          <Route path="loans/new" element={<LoanNew />} />
          <Route path="loans/:id" element={<LoanDetail />} />
          <Route path="setoran" element={<Setoran />} />
          <Route path="laporan" element={<Laporan />} />
          <Route path="users" element={<Users />} />
          <Route path="calon" element={<CalonNasabah />} />
          <Route path="users/new" element={<NasabahBaru />} />
          <Route path="users/:id" element={<UserDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
