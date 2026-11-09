import { cn } from '@/lib/utils';

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <circle cx="10.5" cy="11" r="3.6" fill="#ef4444" stroke="rgba(0,0,0,.25)" />
        <circle cx="21.5" cy="11" r="3.6" fill="#3b82f6" stroke="rgba(0,0,0,.25)" />
        <circle cx="10.5" cy="21.5" r="3.6" fill="#22c55e" stroke="rgba(0,0,0,.25)" />
        <circle cx="21.5" cy="21.5" r="3.6" fill="#facc15" stroke="rgba(0,0,0,.25)" />
      </svg>
      {withWordmark && <span className="text-lg font-extrabold tracking-tight">CLRCDR</span>}
    </span>
  );
}
