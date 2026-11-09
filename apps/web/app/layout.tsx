import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_SETTINGS } from '@mastermind/shared';
import { AppProviders } from '@/providers/app-providers';
import { SiteNavbar } from '@/components/site-navbar';
import { SiteFooter } from '@/components/site-footer';
import { AuthModal } from '@/components/auth-modal';
import { SETTINGS_COOKIE, parseSettingsCookie } from '@/lib/storage';
import { cn } from '@/lib/utils';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'CLRCDR | Mastermind', template: '%s | CLRCDR' },
  description: 'CLRCDR is a realtime Mastermind game: solo runs, instant 1v1 duels and live tournament brackets.',
  applicationName: 'CLRCDR',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0d17' },
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initial = parseSettingsCookie(cookieStore.get(SETTINGS_COOKIE)?.value);
  const settings = initial ?? { ...DEFAULT_SETTINGS };

  return (
    <html
      lang={settings.language}
      suppressHydrationWarning
      className={cn(settings.theme === 'dark' && 'dark', settings.highContrast && 'hc', settings.colorblindMode && 'cb')}
      style={{ colorScheme: settings.theme }}
    >
      <body className="font-sans">
        <AppProviders initialSettings={initial}>
          <div className="flex min-h-dvh flex-col">
            <SiteNavbar />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
          <AuthModal />
        </AppProviders>
      </body>
    </html>
  );
}
