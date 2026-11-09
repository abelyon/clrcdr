'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';
import { cn } from '@/lib/utils';

export function ColorblindToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const { toast } = useToast();
  const on = settings.colorblindMode;
  const Icon = on ? Eye : EyeOff;

  return (
    <Button
      variant={on ? 'default' : 'ghost'}
      size="icon-sm"
      aria-pressed={on}
      aria-label={t('nav.colorblindToggle')}
      title={on ? t('nav.colorblindOn') : t('nav.colorblindOff')}
      className={cn(className)}
      onClick={() => {
        update({ colorblindMode: !on });
        toast({ title: on ? t('toast.colorblindOff') : t('toast.colorblindOn'), durationMs: 1800 });
      }}
    >
      <Icon />
    </Button>
  );
}
