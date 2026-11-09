'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Medal, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import type { TournamentStatus, TournamentSummary } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { PageHeader } from '@/components/page-header';
import { TournamentStatusBadge } from '@/components/tournament/status-badge';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

type Filter = 'ALL' | TournamentStatus;
type LoadState = { status: 'loading' } | { status: 'ready'; items: TournamentSummary[] } | { status: 'error'; message: string };

export default function TournamentsPage() {
  const { t, locale } = useI18n();
  const { user, isGuest, isAdmin, openAuthModal, token } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<Filter>('ALL');
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [joining, setJoining] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    api
      .tournaments(controller.signal)
      .then((items) => setState({ status: 'ready', items }))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return;
        setState({ status: 'error', message: errorMessage(error, t) });
      });
    return () => controller.abort();
  }, [reloadKey, token, t]);

  React.useEffect(() => {
    const id = setInterval(() => setReloadKey((k) => k + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const join = async (tournament: TournamentSummary) => {
    if (!user) {
      toast({ title: t('tournaments.loginToJoin') });
      openAuthModal('login');
      return;
    }
    if (isGuest) {
      toast({ title: t('tournaments.guestCannotJoin'), variant: 'error' });
      openAuthModal('register');
      return;
    }
    setJoining(tournament.id);
    try {
      await api.joinTournament(tournament.id);
      toast({ title: t('toast.tournamentJoined'), variant: 'success' });
      setReloadKey((k) => k + 1);
    } catch (error) {
      toast({ title: t('tournaments.joinError'), description: errorMessage(error, t), variant: 'error' });
    } finally {
      setJoining(null);
    }
  };

  const items = state.status === 'ready' ? state.items.filter((item) => filter === 'ALL' || item.status === filter) : [];

  return (
    <div className="container py-8 sm:py-10">
      <PageHeader
        title={t('tournaments.title')}
        subtitle={t('tournaments.subtitle')}
        actions={
          <>
            {isAdmin && (
              <Button asChild variant="secondary">
                <Link href="/admin/tournaments">
                  <ShieldCheck /> {t('tournaments.adminLink')}
                </Link>
              </Button>
            )}
            <Button variant="outline" size="icon" aria-label={t('common.retry')} onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw />
            </Button>
          </>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="ALL">{t('tournaments.filterAll')}</TabsTrigger>
          <TabsTrigger value="REGISTRATION">{t('tournaments.status.REGISTRATION')}</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS">{t('tournaments.status.IN_PROGRESS')}</TabsTrigger>
          <TabsTrigger value="COMPLETED">{t('tournaments.status.COMPLETED')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6">
        {state.status === 'loading' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        )}
        {state.status === 'error' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <p className="font-semibold">{t('tournaments.loadError')}</p>
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Button onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw /> {t('common.retry')}
              </Button>
            </CardContent>
          </Card>
        )}
        {state.status === 'ready' && items.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Medal className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">{t('tournaments.empty')}</p>
            </CardContent>
          </Card>
        )}
        {state.status === 'ready' && items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((tournament) => {
              const fill = Math.min(100, Math.round((tournament.participantCount / Math.max(1, tournament.maxPlayers)) * 100));
              const full = tournament.participantCount >= tournament.maxPlayers;
              const start = formatDateTime(tournament.startTime, locale);
              const open = tournament.status === 'REGISTRATION';
              return (
                <Card key={tournament.id} className="flex flex-col transition-shadow hover:shadow-lg" data-testid="tournament-card">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg leading-snug">{tournament.name}</CardTitle>
                      <TournamentStatusBadge status={tournament.status} />
                    </div>
                    {tournament.description && <CardDescription className="line-clamp-2">{tournament.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="grid flex-1 content-start gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-4 w-4" aria-hidden />
                          {t('tournaments.players', { count: tournament.participantCount, max: tournament.maxPlayers })}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fill}%` }} />
                      </div>
                    </div>
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarClock className="h-4 w-4" aria-hidden />
                      {start ? t('tournaments.startsAt', { time: start }) : t('tournaments.noStartTime')}
                    </p>
                    {tournament.isJoined && <Badge variant="success" className="w-fit">{t('tournaments.joined')}</Badge>}
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button asChild variant="outline" className="flex-1">
                      <Link href={`/tournaments/${tournament.id}`}>{t('tournaments.view')}</Link>
                    </Button>
                    {open && !tournament.isJoined && (
                      <Button className="flex-1" onClick={() => void join(tournament)} disabled={full || joining === tournament.id}>
                        {joining === tournament.id && <Loader2 className="animate-spin" />}
                        {full ? t('tournaments.full') : joining === tournament.id ? t('tournaments.joining') : t('tournaments.join')}
                      </Button>
                    )}
                    {!open && !tournament.isJoined && tournament.status === 'IN_PROGRESS' && (
                      <Button asChild className="flex-1" variant="secondary">
                        <Link href={`/tournaments/${tournament.id}`}>{t('tournaments.spectate')}</Link>
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
