'use client';

import * as React from 'react';
import { DEFAULT_SETTINGS, type UserSettings } from '@mastermind/shared';
import { api } from '@/lib/api';
import { STORAGE_KEYS } from '@/lib/config';
import { setSoundEnabled } from '@/lib/sound';
import {
  mergeSettings,
  parseSettings,
  readStorage,
  serializeSettingsCookie,
  settingsEqual,
  writeStorage,
} from '@/lib/storage';
import { useAuth } from './auth-provider';

export type SyncState = 'local' | 'syncing' | 'synced' | 'error';

interface SettingsContextValue {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  reset: () => void;
  syncState: SyncState;
  /** True once localStorage has been read on the client. */
  hydrated: boolean;
}

const SettingsContext = React.createContext<SettingsContextValue | null>(null);

const BASE: UserSettings = { ...DEFAULT_SETTINGS };

function applyToDocument(settings: UserSettings): void {
  const root = document.documentElement;
  root.classList.toggle('dark', settings.theme === 'dark');
  root.classList.toggle('hc', settings.highContrast);
  root.classList.toggle('cb', settings.colorblindMode);
  root.lang = settings.language;
  root.style.colorScheme = settings.theme;
}

export function SettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings: UserSettings | null;
}) {
  const { user, token } = useAuth();
  const [settings, setSettings] = React.useState<UserSettings>(initialSettings ?? BASE);
  const [syncState, setSyncState] = React.useState<SyncState>('local');
  const [hydrated, setHydrated] = React.useState(false);
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  const syncTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const canSync = !!user && !user.isGuest && !!token;
  const canSyncRef = React.useRef(canSync);
  canSyncRef.current = canSync;

  React.useEffect(() => {
    const stored = parseSettings(readStorage(STORAGE_KEYS.settings));
    if (stored) setSettings((current) => (settingsEqual(current, stored) ? current : stored));
    else if (typeof navigator !== 'undefined' && !initialSettings) {
      const lang = navigator.language?.toLowerCase().startsWith('hu') ? 'hu' : 'en';
      const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
      setSettings((current) => ({ ...current, language: lang, theme: prefersLight ? 'light' : 'dark' }));
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    applyToDocument(settings);
    setSoundEnabled(settings.soundEnabled);
    if (hydrated) {
      writeStorage(STORAGE_KEYS.settings, JSON.stringify(settings));
      document.cookie = serializeSettingsCookie(settings);
    }
  }, [settings, hydrated]);

  const pushToServer = React.useCallback((next: UserSettings) => {
    if (!canSyncRef.current) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncState('syncing');
    syncTimer.current = setTimeout(() => {
      api
        .updateSettings(next)
        .then(() => setSyncState('synced'))
        .catch(() => setSyncState('error'));
    }, 350);
  }, []);

  const update = React.useCallback(
    (patch: Partial<UserSettings>) => {
      const next = mergeSettings(settingsRef.current, patch);
      if (settingsEqual(next, settingsRef.current)) return;
      setSettings(next);
      pushToServer(next);
    },
    [pushToServer],
  );

  const reset = React.useCallback(() => {
    const next = { ...BASE };
    setSettings(next);
    pushToServer(next);
  }, [pushToServer]);

  const userId = user && !user.isGuest ? user.id : null;
  React.useEffect(() => {
    if (!userId || !token) {
      setSyncState('local');
      return;
    }
    let cancelled = false;
    setSyncState('syncing');
    api
      .getSettings()
      .then((remote) => {
        if (cancelled) return;
        const local = settingsRef.current;
        if (settingsEqual(remote, BASE) && !settingsEqual(local, BASE)) {
          return api.updateSettings(local).then(() => {
            if (!cancelled) setSyncState('synced');
          });
        }
        setSettings(remote);
        setSyncState('synced');
      })
      .catch(() => {
        if (!cancelled) setSyncState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  React.useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const value = React.useMemo<SettingsContextValue>(
    () => ({ settings, update, reset, syncState, hydrated }),
    [settings, update, reset, syncState, hydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
