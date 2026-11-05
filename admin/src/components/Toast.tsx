import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastTone = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => undefined,
})

export function useToast() {
  return useContext(ToastContext)
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
}

const TONE_LABEL: Record<ToastTone, string> = {
  success: 'Berhasil',
  error: 'Gagal',
  info: 'Info',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id))
    }, 3600)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-24 z-[110] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:w-96"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto w-full rounded-xl border px-4 py-3 text-sm shadow-lg dm-toast ${TONE_CLASS[item.tone]}`}
          >
            <span className="mr-2 font-bold">{TONE_LABEL[item.tone]}</span>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
