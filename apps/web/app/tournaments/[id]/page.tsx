'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, Crown, Loader2, LogOut, Play, RefreshCw, ShieldCheck, Users, Wifi, WifiOff } from 'lucide-react';
import type { BracketMatch, TournamentDetail } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { BracketView } from '@/components/tournament/bracket-view';
import { TournamentStatusBadge } from '@/components/tournament/status-badge';
import { ApiError, api } from '@/lib/api';
import { findPlayableMatch, opponentOf } from '@/lib/bracket';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { playSound } from '@/lib/sound';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';
import { useGameSocket } from '@/providers/socket-provider';

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'notfound' } | { status: 'error'; message: string };

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, isGuest, isAdmin, token, openAuthModal } = useAuth();
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<TournamentDetail | null>(null);
  const [load, setLoad] = React.useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = React.useState<'join' | 'leave' | null>(null);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const { socket, status: socketStatus } = useGameSocket(!!token);

  React.useEffect(() => {
    const controller = new AbortController();
    api
      .tournament(id, controller.signal)
      .then((data) => {
        setDetail(data);
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 404) setLoad({ status: 'notfound' });
        else setLoad({ status: 'error', message: errorMessage(error, t) });
      });
    return () => controller.abort();
  }, [id, reloadKey, token, t]);

  React.useEffect(() => {
    const timer = setInterval(() => setReloadKey((k) => k + 1), 20_000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!socket) return;
    const subscribe = () => socket.emit('tournament:subscribe', { tournamentId: id });
    if (socket.connected) subscribe();
    socket.on('connect', subscribe);

    const onBracket = (payload: { tournamentId: string; status: TournamentDetail['status']; matches: BracketMatch[]; winnerId: string | null }) => {
      if (payload.tournamentId !== id) return;
      setDetail((current) => {
        if (!current) return current;
        const winner =
          payload.winnerId == null
            ? null
            : (current.participants.find((p) => p.id === payload.winnerId) ??
              payload.matches.flatMap((m) => [m.player1, m.player2]).find((p) => p?.id === payload.winnerId) ??
              null);
        return { ...current, status: payload.status, matches: payload.matches, winner };
      });
      if (payload.status !== 'REGISTRATION') setReloadKey((k) => k + 1);
    };
    const onReady = (payload: { tournamentId: string; opponent: { username: string } | null }) => {
      if (payload.tournamentId !== id) return;
      playSound('match');
      toast({
        title: t('tournaments.matchReady'),
        description: payload.opponent ? t('tournaments.opponentLabel', { name: payload.opponent.username }) : undefined,
        variant: 'success',
      });
    };
    socket.on('tournament:bracket_updated', onBracket);
    socket.on('tournament:match:ready', onReady);
    return () => {
      socket.off('connect', subscribe);
      socket.off('tournament:bracket_updated', onBracket);
      socket.off('tournament:match:ready', onReady);
      if (socket.connected) socket.emit('tournament:unsubscribe', { tournamentId: id });
    };
  }, [socket, id, t, toast]);

  const joined = !!detail && (detail.isJoined ?? detail.participants.some((p) => p.id === user?.id));
  const registered = !!user && !isGuest;

  const join = async () => {
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
    setBusy('join');
    try {
      setDetail(await api.joinTournament(id));
      toast({ title: t('toast.tournamentJoined'), variant: 'success' });
    } catch (error) {
      toast({ title: t('tournaments.joinError'), description: errorMessage(error, t), variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    setBusy('leave');
    try {
      setDetail(await api.leaveTournament(id));
      toast({ title: t('tournaments.left') });
    } catch (error) {
      toast({ title: t('tournaments.leaveError'), description: errorMessage(error, t), variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const play = (match: BracketMatch) => {
    setPlaying(match.id);
    router.push(`/1v1?tournament=${encodeURIComponent(id)}&match=${encodeURIComponent(match.id)}`);
  };

  if (load.status === 'loading' && !detail) {
    return (
      <div className="container grid gap-4 py-10" aria-busy="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (load.status === 'notfound' || (load.status === 'error' && !detail)) {
    return (
      <div className="container flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg font-semibold">{load.status === 'notfound' ? t('tournaments.notFound') : t('tournaments.loadError')}</p>
        {load.status === 'error' && <p className="text-sm text-muted-foreground">{load.message}</p>}
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/tournaments">
              <ArrowLeft /> {t('tournaments.viewAll')}
            </Link>
          </Button>
          {load.status === 'error' && (
            <Button onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw /> {t('common.retry')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const myMatch = detail.status === 'IN_PROGRESS' ? findPlayableMatch(detail.matches, user?.id) : null;
  const myOpponent = myMatch && user ? opponentOf(myMatch, user.id) : null;
  const played = detail.matches.filter((m) => m.status === 'COMPLETED' || m.status === 'BYE').length;
  const start = formatDateTime(detail.startTime, locale);
  const fill = Math.min(100, Math.round((detail.participantCount / Math.max(1, detail.maxPlayers)) * 100));
  const full = detail.participantCount >= detail.maxPlayers;

  return (
    <div className="container py-8 sm:py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/tournaments">
          <ArrowLeft /> {t('tournaments.viewAll')}
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TournamentStatusBadge status={detail.status} />
            {joined && <Badge variant="success">{t('tournaments.joined')}</Badge>}
            {socket && (
              <Badge variant={socketStatus === 'connected' ? 'success' : 'secondary'} className="gap-1">
                {socketStatus === 'connected' ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
                {socketStatus === 'connected' ? t('tournaments.live') : t('tournaments.connecting')}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{detail.name}</h1>
          {detail.description && <p className="mt-2 text-muted-foreground">{detail.description}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden /> {t('tournaments.players', { count: detail.participantCount, max: detail.maxPlayers })}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" aria-hidden /> {start ? t('tournaments.startsAt', { time: start }) : t('tournaments.noStartTime')}
            </span>
            {detail.matches.length > 0 && (
              <span>{t('tournaments.matchesPlayed', { done: played, total: detail.matches.length })}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button asChild variant="secondary">
              <Link href="/admin/tournaments">
                <ShieldCheck /> {t('tournaments.adminLink')}
              </Link>
            </Button>
          )}
          {detail.status === 'REGISTRATION' && !joined && (
            <Button onClick={() => void join()} disabled={full || busy === 'join'}>
              {busy === 'join' && <Loader2 className="animate-spin" />}
              {full ? t('tournaments.full') : busy === 'join' ? t('tournaments.joining') : t('tournaments.join')}
            </Button>
          )}
          {detail.status === 'REGISTRATION' && joined && registered && (
            <Button variant="outline" onClick={() => void leave()} disabled={busy === 'leave'}>
              {busy === 'leave' ? <Loader2 className="animate-spin" /> : <LogOut />}
              {t('tournaments.leave')}
            </Button>
          )}
          <Button variant="outline" size="icon" aria-label={t('common.retry')} onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw />
          </Button>
        </div>
      </div>

      {detail.status === 'REGISTRATION' && (
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${fill}%` }} />
        </div>
      )}

      {detail.status === 'COMPLETED' && detail.winner && (
        <Card className="mb-6 border-warning/60 bg-gradient-to-r from-warning/15 to-transparent">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-warning text-warning-foreground">
              <Crown className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-warning">{t('tournaments.champion')}</p>
              <p className="text-2xl font-extrabold">{detail.winner.username}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {myMatch && (
        <Card className="mb-6 border-primary bg-primary/5 shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">{t('tournaments.yourMatchTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {myOpponent ? t('tournaments.opponentLabel', { name: myOpponent.username }) : t('tournaments.matchWaitingOpponent')}
              </p>
            </div>
            <Button size="lg" onClick={() => play(myMatch)} disabled={playing === myMatch.id}>
              {playing === myMatch.id ? <Loader2 className="animate-spin" /> : <Play />}
              {t('tournaments.playMatch')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('tournaments.bracket')}</CardTitle>
          {detail.matches.length === 0 && <CardDescription>{t('tournaments.bracketNotStarted')}</CardDescription>}
        </CardHeader>
        <CardContent>
          {detail.matches.length > 0 ? (
            <BracketView
              matches={detail.matches}
              totalRounds={detail.totalRounds}
              currentUserId={user?.id}
              onPlay={play}
              playingMatchId={playing}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('tournaments.bracketNotStarted')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('tournaments.participants')}</CardTitle>
          <CardDescription>{t('admin.participantCount', { count: detail.participants.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tournaments.noParticipants')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...detail.participants]
                .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999) || b.rating - a.rating)
                .map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                    data-testid="participant"
                  >
                    <span className="w-7 rounded bg-muted px-1 text-center font-mono text-xs leading-5 text-muted-foreground">
                      {player.seed ?? '-'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {player.username}
                      {player.id === user?.id && <span className="ml-1 text-xs text-primary">({t('common.you')})</span>}
                    </span>
                    {player.isBot && <Badge variant="outline">{t('admin.bot')}</Badge>}
                    <span className="font-mono text-xs text-muted-foreground">{player.rating}</span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
