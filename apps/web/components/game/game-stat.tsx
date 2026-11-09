import { cn } from '@/lib/utils';

export function GameStat({
  label,
  value,
  icon,
  className,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border bg-card px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', mono && 'font-mono')}>{value}</div>
    </div>
  );
}
