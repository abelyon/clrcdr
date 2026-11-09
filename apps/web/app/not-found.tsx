'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/providers/i18n-provider';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-6xl font-black text-primary">404</p>
      <h1 className="text-2xl font-bold">{t('errors.notFoundTitle')}</h1>
      <p className="max-w-md text-muted-foreground">{t('errors.notFoundBody')}</p>
      <Button asChild>
        <Link href="/">{t('errors.backHome')}</Link>
      </Button>
    </div>
  );
}
