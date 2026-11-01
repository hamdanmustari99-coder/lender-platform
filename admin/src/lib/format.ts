import type { LoanStatus } from './api'

export const fmtRp = (n: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)

export const fmtDate = (d: string | null | undefined): string =>
  d
    ? new Date(d).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  submitted: 'Menunggu Review',
  under_review: 'Sedang Review',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  disbursed: 'Dicairkan',
  active: 'Aktif',
  completed: 'Lunas',
}

export const LOAN_STATUS_CLASS: Record<LoanStatus, string> = {
  submitted: 'bg-slate-100 text-slate-700',
  under_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  disbursed: 'bg-sky-100 text-sky-800',
  active: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-teal-100 text-teal-800',
}

/** warna slice pie chart per status */
export const LOAN_STATUS_COLOR: Record<LoanStatus, string> = {
  submitted: '#94a3b8',
  under_review: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  disbursed: '#0ea5e9',
  active: '#6366f1',
  completed: '#14b8a6',
}

export const KYC_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  verified: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
}

export const KYC_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu',
  verified: 'Terverifikasi',
  rejected: 'Ditolak',
}

/** Ubah error apa pun (Error, PostgrestError object, string) jadi pesan terbaca */
export const errMsg = (e: unknown): string => {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (e !== null && typeof e === 'object') {
    const o = e as Record<string, unknown>
    if (typeof o.message === 'string') {
      const code = typeof o.code === 'string' ? ` (${o.code})` : ''
      const hint = typeof o.hint === 'string' && o.hint ? ` — ${o.hint}` : ''
      return `${o.message}${code}${hint}`
    }
    try {
      return JSON.stringify(o)
    } catch {
      return 'Terjadi kesalahan tak dikenal'
    }
  }
  return 'Terjadi kesalahan tak dikenal'
}
