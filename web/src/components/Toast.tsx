import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons'

interface Toast {
  id: number
  message: string
  tone: 'ok' | 'warn'
}

interface ToastApi {
  /** Show a short confirmation for a completed action. */
  push: (message: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastApi>({ push: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

/**
 * Copying something used to change the label of the button you clicked, which
 * is invisible if you look away for a second. A toast says what happened and
 * gets out of the way by itself.
 *
 * Deliberately not a library: the whole feature is a queue and a timeout, and
 * a toast dependency would be larger than the navigation it reports on.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = nextId.current++
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 2600)
  }, [])

  const api = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4
          lg:bottom-6 lg:right-6 lg:left-auto lg:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-fade-up pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-lg border
              px-3.5 py-2.5 text-[13px] shadow-2xl shadow-black/50 backdrop-blur-md ${
                toast.tone === 'ok'
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
                  : 'border-amber-500/25 bg-amber-500/10 text-amber-100'
              }`}
          >
            <Icon
              name={toast.tone === 'ok' ? 'check' : 'limits'}
              className="h-3.5 w-3.5 shrink-0"
              weight={2.2}
            />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
