'use client';

import { useI18n } from '@/providers/i18n-provider';
import { Logo } from './logo';

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t py-6">
      <div className="container flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
        <Logo className="opacity-80" />
        <p>{t('app.footer')}</p>
      </div>
    </footer>
  );
}
