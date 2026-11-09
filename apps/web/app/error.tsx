'use client';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/providers/i18n-provider';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t('common.error')}</h1>
      <p className="max-w-md text-muted-foreground">{t('errors.generic')}</p>
      <Button onClick={reset}>{t('common.retry')}</Button>
    </div>
  );
}
