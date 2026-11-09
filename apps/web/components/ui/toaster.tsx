'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const icons = { default: Info, success: CheckCircle2, error: AlertCircle } as const;
const tones = {
  default: 'border-border',
  success: 'border-success/60',
  error: 'border-destructive/70',
} as const;
const iconTones = { default: 'text-primary', success: 'text-success', error: 'text-destructive' } as const;

export function ToastProvider({ children, closeLabel = 'Close' }: { children: React.ReactNode; closeLabel?: string }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    setItems((list) => list.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = ++counter.current;
      setItems((list) => [...list.slice(-3), { ...options, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options.durationMs ?? 4200),
      );
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {items.map((item) => {
          const variant = item.variant ?? 'default';
          const Icon = icons[variant];
          return (
            <div
              key={item.id}
              role={variant === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex animate-fade-up items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg',
                tones[variant],
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconTones[variant])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description && <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-sm opacity-60 transition-opacity hover:opacity-100"
                aria-label={closeLabel}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
