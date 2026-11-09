import { describe, expect, it } from 'vitest';
import { detectLanguage, dictionaries, translate } from './index';

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}

function get(obj: unknown, key: string): string {
  return key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string;
}

describe('dictionaries', () => {
  const enKeys = leafKeys(dictionaries.en);
  const huKeys = leafKeys(dictionaries.hu);

  it('has identical key sets', () => {
    expect(huKeys.sort()).toEqual([...enKeys].sort());
  });

  it('has no empty strings', () => {
    for (const key of enKeys) {
      expect(get(dictionaries.en, key).length).toBeGreaterThan(0);
      expect(get(dictionaries.hu, key).length).toBeGreaterThan(0);
    }
  });

  it('keeps interpolation placeholders aligned between languages', () => {
    for (const key of enKeys) {
      expect(placeholders(get(dictionaries.hu, key))).toEqual(placeholders(get(dictionaries.en, key)));
    }
  });
});

describe('translate', () => {
  it('interpolates params', () => {
    expect(translate('en', 'feedback.summary', { exact: 2, partial: 1 })).toBe('2 exact, 1 partial');
    expect(translate('hu', 'feedback.summary', { exact: 2, partial: 1 })).toBe(
      '2 pontos, 1 részleges',
    );
  });
});

describe('detectLanguage', () => {
  it('parses Accept-Language style values', () => {
    expect(detectLanguage('hu-HU,hu;q=0.9,en;q=0.8')).toBe('hu');
    expect(detectLanguage('de-DE,fr;q=0.9')).toBe('en');
    expect(detectLanguage(['hu'])).toBe('hu');
    expect(detectLanguage(undefined)).toBe('en');
  });
});
