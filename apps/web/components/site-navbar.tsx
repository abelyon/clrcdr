'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Gamepad2, Menu, Settings, Swords, Trophy, Medal, ShieldCheck, X } from 'lucide-react';
import type { TranslationKey } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';
import { ColorblindToggle } from './colorblind-toggle';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/rules', labelKey: 'nav.rules', icon: BookOpen },
  { href: '/play', labelKey: 'nav.play', icon: Gamepad2 },
  { href: '/1v1', labelKey: 'nav.versus', icon: Swords },
  { href: '/leaderboard', labelKey: 'nav.leaderboard', icon: Trophy },
  { href: '/tournaments', labelKey: 'nav.tournaments', icon: Medal },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
  { href: '/admin/tournaments', labelKey: 'nav.admin', icon: ShieldCheck, adminOnly: true },
];

export function SiteNavbar() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setOpen(false), [pathname]);

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t('nav.skipToContent')}
      </a>
      <div className="container flex h-16 items-center gap-3">
        <Link href="/" aria-label={t('nav.home')} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>

        <nav aria-label={t('nav.mainNav')} className="ml-4 hidden items-center gap-1 lg:flex">
          {items.map(({ href, labelKey, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                isActive(href) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <ColorblindToggle />
          <ThemeToggle />
          <LanguageSwitcher />
          <UserMenu />
        </div>

        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <ColorblindToggle />
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t bg-background lg:hidden">
          <nav aria-label={t('nav.mainNav')} className="container flex flex-col gap-1 py-3">
            {items.map(({ href, labelKey, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium',
                  isActive(href) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {t(labelKey)}
              </Link>
            ))}
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-3">
              <ThemeToggle />
              <UserMenu onNavigate={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
