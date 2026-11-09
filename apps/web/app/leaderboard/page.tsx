'use client';

import * as React from 'react';
import { Crown, Medal, RefreshCw, Trophy } from 'lucide-react';
import {
  formatDuration,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: LeaderboardEntry[] }
  | { status: 'error'; message: string };

export default function LeaderboardPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [period, setPeriod] = React.useState<LeaderboardPeriod>('alltime');
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    api
      .leaderboard(period, 50, controller.signal)
      .then((response) => setState({ status: 'ready', entries: response.entries }))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return;
        setState({ status: 'error', message: errorMessage(error, t) });
      });
    return () => controller.abort();
  }, [period, reloadKey, t]);

  React.useEffect(() => {
    const id = setInterval(() => setReloadKey((k) => k + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const changePeriod = (value: string) => {
    setState({ status: 'loading' });
    setPeriod(value as LeaderboardPeriod);
  };

  const mine =
    state.status === 'ready' && user ? state.entries.find((entry) => entry.userId === user.id) : undefined;
  const number = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <div className="container py-8 sm:py-10">
      <PageHeader
        title={t('leaderboard.title')}
        subtitle={t('leaderboard.subtitle')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} aria-label={t('common.retry')}>
            <RefreshCw /> <span className="hidden sm:inline">{t('common.retry')}</span>
          </Button>
        }
      />

      <Tabs value={period} onValueChange={changePeriod}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="alltime">{t('leaderboard.tabAllTime')}</TabsTrigger>
            <TabsTrigger value="weekly">{t('leaderboard.tabWeekly')}</TabsTrigger>
          </TabsList>
          <div className="text-sm text-muted-foreground">
            {period === 'weekly' && <span>{t('leaderboard.weeklyReset')}</span>}
            {mine && (
              <span className="ml-3 font-semibold text-primary">{t('leaderboard.yourRank', { rank: mine.rank })}</span>
            )}
          </div>
        </div>
      </Tabs>

      <Card className="mt-4 overflow-hidden">
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingRows />}
          {state.status === 'error' && (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="font-semibold">{t('leaderboard.loadError')}</p>
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Button onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw /> {t('common.retry')}
              </Button>
            </div>
          )}
          {state.status === 'ready' && state.entries.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">{t('leaderboard.empty')}</p>
            </div>
          )}
          {state.status === 'ready' && state.entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">{t('leaderboard.title')}</caption>
                <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-20 px-4 py-3">{t('leaderboard.rank')}</th>
                    <th scope="col" className="px-4 py-3">{t('leaderboard.player')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('leaderboard.rating')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('leaderboard.score')}</th>
                    <th scope="col" className="px-4 py-3">{t('leaderboard.winRate')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('leaderboard.bestTime')}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t('leaderboard.avgGuesses')}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.entries.map((entry) => (
                    <Row key={entry.userId} entry={entry} isMe={entry.userId === user?.id} number={number} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? 'bg-yellow-400 text-yellow-950'
      : rank === 2
        ? 'bg-slate-300 text-slate-900'
        : rank === 3
          ? 'bg-amber-700 text-amber-50'
          : 'bg-muted text-muted-foreground';
  return (
    <span
      className={cn('inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 font-mono text-sm font-bold', styles)}
      aria-label={`#${rank}`}
    >
      {rank === 1 ? <Crown className="h-4 w-4" aria-hidden /> : rank <= 3 ? <Medal className="h-4 w-4" aria-hidden /> : rank}
      {rank <= 3 && <span className="ml-1">{rank}</span>}
    </span>
  );
}

function Row({ entry, isMe, number }: { entry: LeaderboardEntry; isMe: boolean; number: Intl.NumberFormat }) {
  const { t } = useI18n();
  const winRate = Math.max(0, Math.min(100, entry.winRate));
  return (
    <tr
      data-testid="leaderboard-row"
      className={cn('border-b last:border-0 transition-colors hover:bg-muted/40', isMe && 'bg-primary/10 hover:bg-primary/15')}
    >
      <td className="px-4 py-3">
        <RankBadge rank={entry.rank} />
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold">{entry.username}</span>
        {isMe && <span className="ml-1.5 text-xs text-primary">{t('leaderboard.you')}</span>}
        <span className="block text-xs text-muted-foreground">
          {entry.gamesWon}/{entry.gamesPlayed} {t('leaderboard.games').toLowerCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{number.format(entry.rating)}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{number.format(entry.score)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-success" style={{ width: `${winRate}%` }} />
          </div>
          <span className="font-mono text-xs tabular-nums">{winRate.toFixed(1)}%</span>
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatDuration(entry.bestTimeMs)}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">
        {entry.avgGuesses == null ? '-' : entry.avgGuesses.toFixed(1)}
      </td>
    </tr>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-px" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
