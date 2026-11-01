import { useEffect, useState } from 'react'
import { fetchEmergencyContacts } from '../lib/api'
import type { EmergencyContact } from '../lib/api'

/** Blok tampilan kontak darurat borrower (dipakai di LoanDetail & UserDetail) */
export default function BorrowerEmergencyContacts({ userId }: { userId: string }) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([])

  useEffect(() => {
    let mounted = true
    void fetchEmergencyContacts(userId)
      .then((c) => {
        if (mounted) setContacts(c)
      })
      .catch(() => {
        /* tampilkan kosong */
      })
    return () => {
      mounted = false
    }
  }, [userId])

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-600">
        📞 Kontak Darurat
      </div>
      {contacts.length === 0 && (
        <div className="text-xs text-slate-400">Belum ada kontak darurat</div>
      )}
      {contacts.map((c) => (
        <div key={c.id} className="flex justify-between py-0.5 text-xs">
          <span className="text-slate-500">
            #{c.seq} {c.nama} ({c.hubungan})
          </span>
          <span className="font-medium text-slate-800">{c.nomor}</span>
        </div>
      ))}
    </div>
  )
}
