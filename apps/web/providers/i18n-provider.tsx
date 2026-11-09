'use client';

import * as React from 'react';
import {
  createTranslator,
  type Language,
  type Translator,
  type TranslationKey,
  type TranslationParams,
} from '@mastermind/shared';
import { useSettings } from './settings-provider';

interface I18nContextValue {
  language: Language;
  t: Translator;
  setLanguage: (language: Language) => void;
  /** Locale tag for Intl formatting. */
  locale: string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { settings, update } = useSettings();
  const language = settings.language;

  const value = React.useMemo<I18nContextValue>(
    () => ({
      language,
      t: createTranslator(language),
      setLanguage: (next) => update({ language: next }),
      locale: language === 'hu' ? 'hu-HU' : 'en-US',
    }),
    [language, update],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export type { TranslationKey, TranslationParams };
