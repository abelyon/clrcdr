'use client';

import { LANGUAGES, type Language } from '@mastermind/shared';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n-provider';
import { createTranslator } from '@mastermind/shared';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  const { toast } = useToast();

  const choose = (next: Language) => {
    if (next === language) return;
    setLanguage(next);
    toast({ title: createTranslator(next)('toast.languageChanged'), variant: 'success', durationMs: 1800 });
  };

  return (
    <div role="group" aria-label={t('nav.language')} className={cn('inline-flex rounded-lg border bg-muted p-0.5', className)}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={language === code}
          lang={code}
          title={t(`settings.language.${code}`)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            language === code ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
