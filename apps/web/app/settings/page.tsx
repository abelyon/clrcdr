'use client';

import * as React from 'react';
import { Check, Cloud, CloudOff, Contrast, Eye, Globe, Loader2, Moon, RotateCcw, Sun, Volume2 } from 'lucide-react';
import { ALL_PEG_COLORS, LANGUAGES, PEG_META, THEMES, createTranslator, type Language, type Theme } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { FeedbackPegs, Peg } from '@/components/game/peg';
import { PageHeader } from '@/components/page-header';
import { playSound, unlockAudio } from '@/lib/sound';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';

export default function SettingsPage() {
  const { t, language } = useI18n();
  const { settings, update, reset, syncState } = useSettings();
  const { user, isGuest, openAuthModal } = useAuth();
  const { toast } = useToast();
  const loggedIn = !!user && !isGuest;

  const chooseLanguage = (next: Language) => {
    if (next === language) return;
    update({ language: next });
    toast({ title: createTranslator(next)('toast.languageChanged'), variant: 'success', durationMs: 1800 });
  };

  const testSound = () => {
    unlockAudio();
    playSound('win');
  };

  return (
    <div className="container max-w-3xl py-8 sm:py-10">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm" aria-live="polite">
        <span className="flex items-center gap-2" data-testid="sync-status">
          {syncState === 'syncing' ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          ) : syncState === 'synced' ? (
            <Cloud className="h-4 w-4 text-success" aria-hidden />
          ) : syncState === 'error' ? (
            <CloudOff className="h-4 w-4 text-destructive" aria-hidden />
          ) : (
            <Check className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          {syncState === 'syncing'
            ? t('settings.sync.syncing')
            : syncState === 'synced'
              ? t('settings.sync.synced')
              : syncState === 'error'
                ? t('settings.sync.syncFailed')
                : t('settings.sync.local')}
        </span>
        {!loggedIn && (
          <button type="button" onClick={() => openAuthModal('login')} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('settings.sync.loginHint')}
          </button>
        )}
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5 text-primary" aria-hidden /> {t('settings.language.title')}
            </CardTitle>
            <CardDescription>{t('settings.language.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label={t('settings.language.title')} className="grid gap-3 sm:grid-cols-2">
              {LANGUAGES.map((code) => (
                <ChoiceCard
                  key={code}
                  selected={settings.language === code}
                  onSelect={() => chooseLanguage(code)}
                  lang={code}
                  label={t(`settings.language.${code}`)}
                  hint={code.toUpperCase()}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-primary" aria-hidden /> {t('settings.colorblind.title')}
            </CardTitle>
            <CardDescription>{t('settings.colorblind.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <SwitchRow
              id="colorblind"
              label={t('settings.colorblind.title')}
              checked={settings.colorblindMode}
              onChange={(v) => update({ colorblindMode: v })}
              onText={t('common.on')}
              offText={t('common.off')}
            />
            <div className="rounded-xl border bg-[hsl(var(--board))] p-4" aria-label={t('settings.colorblind.previewTitle')}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('settings.colorblind.previewTitle')}
              </p>
              <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8" data-testid="preview-pegs">
                {ALL_PEG_COLORS.map((color) => (
                  <li key={color} className="flex flex-col items-center gap-1">
                    <Peg color={color} colorblind={settings.colorblindMode} showLetter className="h-11 w-11" />
                    <span className="text-[11px] text-muted-foreground">{t(PEG_META[color].nameKey)}</span>
                    {settings.colorblindMode && <span className="font-mono text-xs font-bold">{PEG_META[color].symbol} {PEG_META[color].letter}</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-6 border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('settings.colorblind.previewFeedback')}</p>
                <div className="flex items-center gap-2 text-sm">
                  <FeedbackPegs kinds={['exact']} colorblind={settings.colorblindMode} label={t('feedback.exact')} />
                  <span>{t('feedback.exact')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FeedbackPegs kinds={['partial']} colorblind={settings.colorblindMode} label={t('feedback.partial')} />
                  <span>{t('feedback.partial')}</span>
                </div>
                <FeedbackPegs kinds={['exact', 'exact', 'partial', 'empty']} colorblind={settings.colorblindMode} label={t('feedback.summary', { exact: 2, partial: 1 })} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {settings.colorblindMode
                  ? `${t('feedback.exactLegendColorblind')} · ${t('feedback.partialLegendColorblind')}`
                  : `${t('feedback.exactLegendDefault')} · ${t('feedback.partialLegendDefault')}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Contrast className="h-5 w-5 text-primary" aria-hidden /> {t('settings.highContrast.title')}
            </CardTitle>
            <CardDescription>{t('settings.highContrast.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <SwitchRow
              id="high-contrast"
              label={t('settings.highContrast.title')}
              checked={settings.highContrast}
              onChange={(v) => update({ highContrast: v })}
              onText={t('common.on')}
              offText={t('common.off')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {settings.theme === 'dark' ? <Moon className="h-5 w-5 text-primary" aria-hidden /> : <Sun className="h-5 w-5 text-primary" aria-hidden />}
              {t('settings.theme.title')}
            </CardTitle>
            <CardDescription>{t('settings.theme.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label={t('settings.theme.title')} className="grid gap-3 sm:grid-cols-2">
              {THEMES.map((theme: Theme) => (
                <ChoiceCard
                  key={theme}
                  selected={settings.theme === theme}
                  onSelect={() => update({ theme })}
                  label={t(`settings.theme.${theme}`)}
                  icon={theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Volume2 className="h-5 w-5 text-primary" aria-hidden /> {t('settings.sound.title')}
            </CardTitle>
            <CardDescription>{t('settings.sound.description')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SwitchRow
              id="sound"
              label={t('settings.sound.title')}
              checked={settings.soundEnabled}
              onChange={(v) => {
                update({ soundEnabled: v });
                if (v) {
                  unlockAudio();
                  window.setTimeout(() => playSound('place'), 30);
                }
              }}
              onText={t('common.on')}
              offText={t('common.off')}
            />
            <div>
              <Button variant="outline" onClick={testSound} disabled={!settings.soundEnabled}>
                <Volume2 /> {t('settings.sound.test')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              toast({ title: t('toast.settingsSaved'), variant: 'success', durationMs: 1800 });
            }}
          >
            <RotateCcw /> {t('settings.reset')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onChange,
  onText,
  offText,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  onText: string;
  offText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <Label htmlFor={id} className="cursor-pointer text-base">
        {label}
      </Label>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground" aria-hidden>
          {checked ? onText : offText}
        </span>
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  label,
  hint,
  icon,
  lang,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  lang?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      lang={lang}
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-accent/50',
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {hint}
        {selected && <Check className="h-4 w-4 text-primary" aria-hidden />}
      </span>
    </button>
  );
}
