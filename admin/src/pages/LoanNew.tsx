import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminCreateLoan, fetchProfiles } from '../lib/api'
import type { Profile } from '../lib/api'
import { errMsg, fmtRp } from '../lib/format'

const WEEKLY_TENORS = Array.from({ length: 52 }, (_, i) => i + 1)
const MONTHLY_TENORS = [1, 3]

export default function LoanNew() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingNasabah, setLoadingNasabah] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [nasabahSearch, setNasabahSearch] = useState('')
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('5000000')
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('monthly')
  const [tenor, setTenor] = useState('3')
  const [purpose, setPurpose] = useState('')
  const [collateralType, setCollateralType] = useState('')
  const [collateralDetail, setCollateralDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const list = await fetchProfiles()
        if (!cancelled) {
          setProfiles(list.filter((p) => p.role === 'nasabah'))
          setLoadErr(null)
        }
      } catch (e) {
        if (!cancelled) setLoadErr(errMsg(e))
      } finally {
        if (!cancelled) setLoadingNasabah(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const tenors = frequency === 'weekly' ? WEEKLY_TENORS : MONTHLY_TENORS

  // Tenor select dinamis: weekly 1-52, monthly 1|3
  useEffect(() => {
    setTenor((prev) => {
      const v = Number(prev)
      if (frequency === 'weekly') {
        return v >= 1 && v <= 52 ? prev : '12'
      }
      return v === 1 || v === 3 ? prev : '3'
    })
  }, [frequency])

  const nasabahList = useMemo(() => {
    const q = nasabahSearch.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.nik ?? '').toLowerCase().includes(q),
    )
  }, [profiles, nasabahSearch])

  const selected = profiles.find((p) => p.id === userId) ?? null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!userId) {
      setError('Pilih nasabah terlebih dahulu.')
      return
    }
    const nominal = Number(amount)
    if (!Number.isFinite(nominal) || nominal < 50000 || nominal > 20000000) {
      setError('Nominal harus antara Rp50.000–Rp20.000.000.')
      return
    }
    const tenorNum = Number(tenor)
    if (frequency === 'monthly' && tenorNum !== 1 && tenorNum !== 3) {
      setError('Tenor bulanan hanya boleh 1 atau 3.')
      return
    }
    if (frequency === 'weekly' && (tenorNum < 1 || tenorNum > 52)) {
      setError('Tenor mingguan harus 1–52.')
      return
    }
    setBusy(true)
    try {
      const loanId = await adminCreateLoan({
        userId,
        amount: Math.round(nominal),
        tenor: tenorNum,
        frequency,
        purpose: purpose.trim(),
        collateralType: collateralType.trim(),
        collateralDetail: collateralDetail.trim(),
      })
      navigate(`/loans/${loanId}`)
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/loans" className="text-sm text-primary-600 hover:underline">
        ← Kembali ke daftar pinjaman
      </Link>
      <h1 className="text-2xl font-black tracking-tight text-slate-900">Buatkan Pinjaman</h1>
      <p className="text-sm text-slate-500">
        Admin membuat pinjaman langsung untuk nasabah — nominal final, langsung cair.
      </p>

      {loadErr && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{loadErr}</div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Pilih nasabah (filter role nasabah + search) */}
        <div>
          <label htmlFor="nasabah-search" className="mb-1 block text-xs font-medium text-slate-600">
            Nasabah
          </label>
          <input
            id="nasabah-search"
            placeholder="Cari nama / email / NIK…"
            value={nasabahSearch}
            onChange={(e) => setNasabahSearch(e.target.value)}
            className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            disabled={loadingNasabah}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="">
              {loadingNasabah ? 'Memuat nasabah…' : `-- Pilih nasabah (${nasabahList.length}) --`}
            </option>
            {nasabahList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || '(tanpa nama)'}
                {p.nik ? ` — NIK ${p.nik}` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-slate-500">
              Terpilih: {selected.full_name}
              {selected.nik ? ` — NIK ${selected.nik}` : ''}
            </p>
          )}
        </div>

        {/* Nominal */}
        <div>
          <label htmlFor="loan-amount" className="mb-1 block text-xs font-medium text-slate-600">
            Nominal (Rp)
          </label>
          <input
            id="loan-amount"
            type="number"
            min={50000}
            max={20000000}
            step={50000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-400">
            Rp50.000 – Rp20.000.000
            {Number(amount) > 0 ? ` — ${fmtRp(Number(amount) || 0)}` : ''}
          </p>
        </div>

        {/* Frekuensi + tenor dinamis */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="loan-freq" className="mb-1 block text-xs font-medium text-slate-600">
              Frekuensi
            </label>
            <select
              id="loan-freq"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            >
              <option value="monthly">Bulanan</option>
              <option value="weekly">Mingguan</option>
            </select>
          </div>
          <div>
            <label htmlFor="loan-tenor" className="mb-1 block text-xs font-medium text-slate-600">
              Tenor ({frequency === 'weekly' ? 'minggu' : 'bulan'})
            </label>
            <select
              id="loan-tenor"
              value={tenor}
              onChange={(e) => setTenor(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            >
              {tenors.map((t) => (
                <option key={t} value={t}>
                  {t} {frequency === 'weekly' ? 'minggu' : 'bulan'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tujuan */}
        <div>
          <label htmlFor="loan-purpose" className="mb-1 block text-xs font-medium text-slate-600">
            Tujuan
          </label>
          <textarea
            id="loan-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={2}
            placeholder="Contoh: modal warung…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
          />
        </div>

        {/* Jaminan */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="loan-col-type" className="mb-1 block text-xs font-medium text-slate-600">
              Jaminan — tipe
            </label>
            <input
              id="loan-col-type"
              value={collateralType}
              onChange={(e) => setCollateralType(e.target.value)}
              placeholder="Contoh: BPKB motor"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="loan-col-detail" className="mb-1 block text-xs font-medium text-slate-600">
              Jaminan — detail
            </label>
            <input
              id="loan-col-detail"
              value={collateralDetail}
              onChange={(e) => setCollateralDetail(e.target.value)}
              placeholder="Contoh: Honda Beat 2020, B 1234 XY"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy || loadingNasabah}
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? 'Menyimpan…' : 'Buat & Cairkan Pinjaman'}
        </button>
      </form>
    </div>
  )
}
