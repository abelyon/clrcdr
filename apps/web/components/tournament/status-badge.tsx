'use client';

import type { TournamentStatus } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/providers/i18n-provider';

const variants = { REGISTRATION: 'accent', IN_PROGRESS: 'warning', COMPLETED: 'success' } as const;

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant={variants[status]}>
      {status === 'IN_PROGRESS' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {t(`tournaments.status.${status}`)}
    </Badge>
  );
}
