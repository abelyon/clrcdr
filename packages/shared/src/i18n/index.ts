import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '../constants';
import { en, type Dictionary } from './en';
import { hu } from './hu';

export type { Dictionary } from './en';

export const dictionaries: Record<Language, Dictionary> = { en, hu };

type Join<K extends string, P extends string> = `${K}.${P}`;

type LeafPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : Join<K, LeafPaths<T[K]>>;
    }[keyof T & string];

/** Every valid dotted translation key, e.g. `rules.goal.title`. */
export type TranslationKey = LeafPaths<Dictionary>;

export type TranslationParams = Record<string, string | number>;

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function getDictionary(language: Language): Dictionary {
  return dictionaries[language] ?? dictionaries[DEFAULT_LANGUAGE];
}

/** Detects a supported language from a browser/header string such as `hu-HU,hu;q=0.9,en;q=0.8`. */
export function detectLanguage(input: string | readonly string[] | null | undefined): Language {
  const candidates = Array.isArray(input)
    ? (input as readonly string[])
    : typeof input === 'string'
      ? input.split(',')
      : [];
  for (const raw of candidates) {
    const tag = raw.split(';')[0]?.trim().toLowerCase().slice(0, 2);
    if (isLanguage(tag)) return tag;
  }
  return DEFAULT_LANGUAGE;
}

function lookup(dictionary: Dictionary, key: string): string | undefined {
  let current: unknown = dictionary;
  for (const part of key.split('.')) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translates a key for a language with `{param}` interpolation; falls back to English, then to the key. */
export function translate(
  language: Language,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const value = lookup(getDictionary(language), key) ?? lookup(en, key) ?? key;
  return interpolate(value, params);
}

export type Translator = (key: TranslationKey, params?: TranslationParams) => string;

export function createTranslator(language: Language): Translator {
  return (key, params) => translate(language, key, params);
}

export { en, hu };
