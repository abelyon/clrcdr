'use client';

import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';
import { FeedbackDot } from './peg';

export function FeedbackLegend({ className }: { className?: string }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const cb = settings.colorblindMode;
  return (
    <dl className={cn('grid gap-2 text-sm', className)}>
      <div className="flex items-center gap-3">
        <dt>
          <FeedbackDot kind="exact" colorblind={cb} className="h-5 w-5 sm:h-5 sm:w-5" />
        </dt>
        <dd>
          <span className="font-semibold">{t('feedback.exact')}</span>{' '}
          <span className="text-muted-foreground">{t('feedback.exactHint')}</span>
        </dd>
      </div>
      <div className="flex items-center gap-3">
        <dt>
          <FeedbackDot kind="partial" colorblind={cb} className="h-5 w-5 sm:h-5 sm:w-5" />
        </dt>
        <dd>
          <span className="font-semibold">{t('feedback.partial')}</span>{' '}
          <span className="text-muted-foreground">{t('feedback.partialHint')}</span>
        </dd>
      </div>
    </dl>
  );
}
