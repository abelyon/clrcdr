import {
  DEFAULT_SETTINGS,
  userSettingsSchema,
  type UserSettings,
} from '@mastermind/shared';
import { STORAGE_KEYS } from './config';

export const SETTINGS_COOKIE = 'clrcdr_settings';

export function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export function readStorage(key: string): string | null {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  if (!canUseStorage()) return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage may be full or blocked; the app keeps working in memory */
  }
}

export function getToken(): string | null {
  return readStorage(STORAGE_KEYS.token);
}

export function setToken(token: string | null): void {
  writeStorage(STORAGE_KEYS.token, token);
}

/** Parses untrusted JSON into complete settings, filling gaps with defaults. */
export function parseSettings(raw: string | null | undefined): UserSettings | null {
  if (!raw) return null;
  try {
    const json: unknown = JSON.parse(raw);
    const parsed = userSettingsSchema.partial().safeParse(json);
    if (!parsed.success) return null;
    return mergeSettings(DEFAULT_SETTINGS, parsed.data);
  } catch {
    return null;
  }
}

export function mergeSettings(base: UserSettings, patch: Partial<UserSettings>): UserSettings {
  const next: UserSettings = { ...base };
  for (const key of Object.keys(patch) as (keyof UserSettings)[]) {
    const value = patch[key];
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

export function serializeSettingsCookie(settings: UserSettings): string {
  const value = encodeURIComponent(JSON.stringify(settings));
  return `${SETTINGS_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function parseSettingsCookie(value: string | undefined): UserSettings | null {
  if (!value) return null;
  try {
    return parseSettings(decodeURIComponent(value));
  } catch {
    return null;
  }
}

export function settingsEqual(a: UserSettings, b: UserSettings): boolean {
  return (
    a.language === b.language &&
    a.colorblindMode === b.colorblindMode &&
    a.highContrast === b.highContrast &&
    a.theme === b.theme &&
    a.soundEnabled === b.soundEnabled
  );
}
