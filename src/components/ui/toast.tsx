'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void } };
type ToastApi = { toast: (t: Omit<Toast, 'id'>) => void };

const Ctx = createContext<ToastApi>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

/** One snackbar at a time, bottom of the screen, above the safe area. Auto-dismisses after 6 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((t: Omit<Toast, 'id'>) => setCurrent({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCurrent(null), 6000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      >
        {current ? (
          <div
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-foreground py-2 pr-2 pl-4 text-background shadow-lg"
          >
            <span className="text-sm">{current.message}</span>
            {current.action ? (
              <button
                type="button"
                onClick={() => {
                  current.action!.onClick();
                  setCurrent(null);
                }}
                className="h-11 rounded-lg px-3 text-sm font-semibold text-primary-foreground underline-offset-4 hover:underline"
              >
                {current.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
