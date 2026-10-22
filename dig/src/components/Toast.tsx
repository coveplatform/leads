"use client";
import { createContext, useCallback, useContext, useState } from "react";

interface Toast {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}
const Ctx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:left-56"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="card pointer-events-auto flex max-w-md items-center gap-3 px-4 py-3 text-sm shadow-lg"
          >
            <span>{t.text}</span>
            {t.actionLabel && (
              <button
                type="button"
                className="btn btn-ghost min-h-[36px] px-2 underline"
                onClick={() => {
                  t.onAction?.();
                  setItems((xs) => xs.filter((x) => x.id !== t.id));
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost min-h-[36px] px-2"
              aria-label="Dismiss"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
