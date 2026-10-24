import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Transient confirmations with an optional action (e.g. "Undo"). Toasts never
 * take focus; they're announced through an aria-live region instead.
 *
 * For an undoable action, do the work in `onExpire` (runs only if the toast
 * times out or is closed) and revert in `action.onClick`.
 */
export interface ToastOptions {
  message: ReactNode;
  tone?: 'default' | 'error';
  action?: { label: string; onClick: () => void };
  duration?: number;
  onExpire?: () => void;
}

interface ActiveToast extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export const useToast = () => useContext(ToastContext);

let nextId = 0;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const pending = useRef(new Map<number, { timer: number; onExpire?: () => void }>());

  const dismiss = useCallback((id: number, runExpire: boolean) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.current.delete(id);
    if (runExpire) entry.onExpire?.();
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    ({ duration = 5000, ...options }: ToastOptions) => {
      const id = ++nextId;
      const timer = window.setTimeout(() => dismiss(id, true), duration);
      pending.current.set(id, { timer, onExpire: options.onExpire });
      setToasts((prev) => [...prev.slice(-2), { ...options, id }]);
    },
    [dismiss],
  );

  // Leaving the app commits anything still waiting on its undo window, so a
  // pending delete inside the SPA isn't silently dropped by unmounting.
  useEffect(() => {
    const entries = pending.current;
    return () => entries.forEach((_, id) => dismiss(id, true));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[110] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:pl-60"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`fq-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-xl ${
              toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-ink text-surface'
            }`}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id, false);
                }}
                className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold text-primary-300 transition hover:bg-white/10 dark:text-primary-700 dark:hover:bg-black/5"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(toast.id, true)}
              aria-label="Dismiss"
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 transition hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
