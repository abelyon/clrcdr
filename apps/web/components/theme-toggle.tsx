'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';

export function ThemeToggle() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const dark = settings.theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t('nav.toggleTheme')}
      title={dark ? t('settings.theme.light') : t('settings.theme.dark')}
      onClick={() => update({ theme: dark ? 'light' : 'dark' })}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
