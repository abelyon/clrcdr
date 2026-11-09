'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, LogIn, LogOut, Settings, ShieldCheck, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';
import { RoleBadge } from './role-badge';

export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user, status, logout, openAuthModal, switchToDemoAdmin, isAdmin } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status === 'loading') {
    return <div className="h-9 w-28 animate-pulse rounded-md bg-muted" aria-hidden />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => openAuthModal('login')}>
          <LogIn /> {t('nav.login')}
        </Button>
        <Button size="sm" onClick={() => openAuthModal('register')}>
          {t('nav.register')}
        </Button>
      </div>
    );
  }

  const demoAdmin = async () => {
    setBusy(true);
    try {
      const admin = await switchToDemoAdmin();
      toast({ title: t('auth.welcome', { name: admin.username }), description: t('auth.demoAdminActive'), variant: 'success' });
      setOpen(false);
      onNavigate?.();
    } catch (error) {
      toast({ title: errorMessage(error, t, 'login'), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.account')}
        className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="max-w-[8rem] truncate font-semibold">{user.username}</span>
        <RoleBadge user={user} />
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 animate-fade-up rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl"
        >
          <div className="px-2 py-2">
            <p className="truncate text-sm font-semibold">{t('auth.loggedInAs', { name: user.username })}</p>
            {!user.isGuest && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('common.rating')}: {user.rating} · {user.gamesWon}/{user.gamesPlayed} {t('leaderboard.wins').toLowerCase()}
              </p>
            )}
            {user.isGuest && <p className="mt-0.5 text-xs text-muted-foreground">{t('auth.guestHint')}</p>}
          </div>
          <div className="my-1 h-px bg-border" />
          <MenuLink href="/settings" icon={<Settings className="h-4 w-4" />} onClick={() => { setOpen(false); onNavigate?.(); }}>
            {t('nav.settings')}
          </MenuLink>
          <MenuLink href="/leaderboard" icon={<Trophy className="h-4 w-4" />} onClick={() => { setOpen(false); onNavigate?.(); }}>
            {t('nav.leaderboard')}
          </MenuLink>
          {isAdmin && (
            <MenuLink href="/admin/tournaments" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => { setOpen(false); onNavigate?.(); }}>
              {t('nav.admin')}
            </MenuLink>
          )}
          {!isAdmin && (
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={demoAdmin}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
            >
              <ShieldCheck className="h-4 w-4" />
              {busy ? t('admin.switching') : t('auth.switchToDemoAdmin')}
            </button>
          )}
          {user.isGuest && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openAuthModal('register');
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
            >
              <LogIn className="h-4 w-4" />
              {t('nav.register')}
            </button>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              logout();
              setOpen(false);
              onNavigate?.();
              toast({ title: t('auth.loggedOut') });
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
    >
      {icon}
      {children}
    </Link>
  );
}
