import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Modal konfirmasi custom — pengganti window.confirm bawaan browser.
 *
 * Kenapa: dialog bawaan browser tidak bisa di-style, tidak konsisten dengan
 * tampilan aplikasi, dan di beberapa browser bisa diblokir atau diabaikan user.
 *
 * Pakai promise biar pemanggil tetap bisa nulis:
 *
 *   const ok = await confirm({
 *     title: 'Hapus nasabah?',
 *     message: 'Data tidak bisa dikembalikan.',
 *     confirmText: 'Hapus',
 *     tone: 'danger',
 *   })
 *   if (!ok) return
 *
 * tanpa harus mengubah struktur kode jadi state-driven.
 */

export interface ConfirmOptions {
  title: string
  message?: string
  /** Teks tombol konfirmasi (default: 'Lanjutkan') */
  confirmText?: string
  /** Teks tombol batal (default: 'Batal') */
  cancelText?: string
  /** danger = merah (aksi merusak), primary = hijau (default) */
  tone?: 'danger' | 'primary'
  /**
   * Kalau diisi, user harus mengetik teks yang sama persis dulu sebelum tombol
   * konfirmasi aktif. Dipakai buat aksi yang sangat merusak.
   */
  requireText?: string
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
)

/** Panggil di dalam komponen mana pun yang dibungkus <ConfirmProvider>. */
export function useConfirm() {
  return useContext(ConfirmContext)
}

const TONE: Record<'danger' | 'primary', { icon: string; btn: string; ring: string }> = {
  danger: {
    icon: '⚠️',
    btn: 'bg-red-600 hover:bg-red-700',
    ring: 'focus:ring-red-500',
  },
  primary: {
    icon: '❓',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
    ring: 'focus:ring-emerald-500',
  },
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve })
        setTyped('')
      }),
    [],
  )

  const settle = useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok)
      return null
    })
    setTyped('')
  }, [])

  // Fokuskan tombol Batal saat modal muncul — supaya Enter tidak langsung
  // menjalankan aksi merusak.
  useEffect(() => {
    if (pending) cancelRef.current?.focus()
  }, [pending])

  // Escape = batal.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, settle])

  const value = useMemo(() => confirm, [confirm])

  const ready = !pending?.requireText || typed === pending.requireText
  const tone = TONE[pending?.tone ?? 'primary']

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => settle(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none" aria-hidden>
                {tone.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-800">
                  {pending.title}
                </h2>
                {pending.message && (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                    {pending.message}
                  </p>
                )}
              </div>
            </div>

            {pending.requireText && (
              <div className="mt-4">
                <label
                  htmlFor="confirm-dialog-require"
                  className="block text-xs font-medium text-slate-500"
                >
                  Ketik{' '}
                  <span className="font-mono font-bold text-slate-700">
                    {pending.requireText}
                  </span>{' '}
                  untuk melanjutkan
                </label>
                <input
                  id="confirm-dialog-require"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ready) settle(true)
                  }}
                  className={`mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${tone.ring}`}
                  autoComplete="off"
                />
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancelRef}
                onClick={() => settle(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {pending.cancelText ?? 'Batal'}
              </button>
              <button
                disabled={!ready}
                onClick={() => settle(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${tone.btn}`}
              >
                {pending.confirmText ?? 'Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
