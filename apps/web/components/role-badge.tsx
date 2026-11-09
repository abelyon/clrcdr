'use client';

import { ShieldCheck, User, UserRound } from 'lucide-react';
import type { AuthUser } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/providers/i18n-provider';

export function roleKey(user: Pick<AuthUser, 'role' | 'isGuest'>): 'ADMIN' | 'GUEST' | 'PLAYER' {
  if (user.isGuest) return 'GUEST';
  return user.role === 'ADMIN' ? 'ADMIN' : 'PLAYER';
}

/** Small badge that distinguishes guests, registered players and admins. */
export function RoleBadge({ user }: { user: Pick<AuthUser, 'role' | 'isGuest'> }) {
  const { t } = useI18n();
  const key = roleKey(user);
  const Icon = key === 'ADMIN' ? ShieldCheck : key === 'GUEST' ? UserRound : User;
  return (
    <Badge variant={key === 'ADMIN' ? 'warning' : key === 'GUEST' ? 'secondary' : 'accent'} data-role={key}>
      <Icon className="h-3 w-3" aria-hidden />
      {t(`roles.${key}`)}
    </Badge>
  );
}

