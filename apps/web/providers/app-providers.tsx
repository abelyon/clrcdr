'use client';

import * as React from 'react';
import type { UserSettings } from '@mastermind/shared';
import { ToastProvider } from '@/components/ui/toaster';
import { AuthProvider } from './auth-provider';
import { I18nProvider, useI18n } from './i18n-provider';
import { SettingsProvider } from './settings-provider';
import { SocketProvider } from './socket-provider';

function LocalizedToasts({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return <ToastProvider closeLabel={t('common.close')}>{children}</ToastProvider>;
}

export function AppProviders({
  children,
  initialSettings,
}: {
  children: React.ReactNode;
  initialSettings: UserSettings | null;
}) {
  return (
    <AuthProvider>
      <SettingsProvider initialSettings={initialSettings}>
        <I18nProvider>
          <LocalizedToasts>
            <SocketProvider>{children}</SocketProvider>
          </LocalizedToasts>
        </I18nProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
