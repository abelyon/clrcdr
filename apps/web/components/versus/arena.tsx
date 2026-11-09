'use client';

import * as React from 'react';
import { Check, Clock, Eraser, Flag, Loader2, Undo2, Wifi, WifiOff } from 'lucide-react';
import { formatDuration, type PegColor } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MastermindBoard, OpponentBoard } from '@/components/game/mastermind-board';
import { Palette } from '@/components/game/palette';
import { RoleBadge } from '@/components/role-badge';
import { countdownSeconds, isWaitingOnOpponent, type MatchViewState } from '@/lib/match';
import { isRowComplete } from '@/lib/board';
import { serverNow } from '@/lib/clock';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

interface ArenaProps {
  state: MatchViewState;
  colorblind: boolean;
  shakeKey: number;
  onPick: (color: PegColor) => void;
  onUndo: () => void;
  onClear: () => void;
  onSubmit: () => void;
  onSlotClick: (index: number) => void;
  onForfeit: () => void;
  onShowResult?: () => void;
  connected: boolean;
}

export function MatchArena({
  state,
  colorblind,
  shakeKey,
  onPick,
  onUndo,
  onClear,
  onSubmit,
  onSlotClick,
  onForfeit,
  onShowResult,
  connected,
}: ArenaProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const match = state.match;
  const [now, setNow] = React.useState(() => serverNow());

  const over = !!state.ended;
  React.useEffect(() => {
    if (!match || over) return;
    const id = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(id);
  }, [match, over]);

  if (!match) return null;

  const countdown = countdownSeconds(match.startedAt, now);
  const live = countdown === 0;
  const elapsed = state.ended ? state.ended.durationMs : Math.max(0, now - match.startedAt);
  const submitting = !!state.pending;
  const exhausted = state.board.rows.length >= state.board.maxAttempts;
  const canPlay = live && !over && !submitting && !exhausted;
  const waiting = isWaitingOnOpponent(state);

  const lastOpponent = [...state.opponentRows].reverse().find((r) => r.atMs != null);
  const best = state.opponentRows.reduce(
    (acc, row) => (row.exact > acc.exact || (row.exact === acc.exact && row.partial > acc.partial) ? row : acc),
    { exact: 0, partial: 0 },
  );
  const opponentCurrentRow = Math.min(state.opponentRows.length + 1, match.maxAttempts);
  const graceSeconds = state.graceEndsAt ? Math.max(0, Math.ceil((state.graceEndsAt - Date.now()) / 1000)) : null;
  const modeLabel =
    match.mode === 'TOURNAMENT' ? t('versus.arena.tournamentMatch') : match.roomCode ? t('versus.arena.privateMatch') : t('versus.arena.quickMatch');

  return (
    <div className="container py-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{modeLabel}</Badge>
          {match.roomCode && <Badge variant="outline" className="font-mono">{match.roomCode}</Badge>}
          <Badge variant={connected ? 'success' : 'destructive'} className="gap-1">
            {connected ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
            {connected ? t('versus.connection.connected') : t('versus.connection.disconnected')}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-xl font-bold tabular-nums" aria-label={t('versus.arena.elapsed')}>
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {formatDuration(elapsed)}
          </span>
          {!over ? (
            <Button variant="outline" size="sm" onClick={onForfeit}>
              <Flag /> {t('versus.arena.forfeit')}
            </Button>
          ) : (
            onShowResult && (
              <Button size="sm" onClick={onShowResult}>
                {t('common.view')}
              </Button>
            )
          )}
        </div>
      </div>

      {!state.opponentConnected && !over && (
        <p role="status" className="mb-4 rounded-lg border border-warning/50 bg-warning/10 px-4 py-2 text-sm text-warning">
          {t('versus.arena.opponentDisconnected', { seconds: graceSeconds ?? 30 })}
        </p>
      )}
      {waiting && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t('versus.arena.waitingOnOpponent')}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label={t('versus.arena.yourBoard')} className="relative">
          <PlayerHeader
            name={user?.username ?? t('common.you')}
            subtitle={t('versus.arena.yourBoard')}
            rating={user?.isGuest ? null : user?.rating}
            user={user}
            highlight
          />
          <div className="relative mx-auto max-w-lg">
            <MastermindBoard
              state={state.board}
              colorblind={colorblind}
              interactive={canPlay}
              onSlotClick={onSlotClick}
              secret={over ? state.secret : null}
              shakeKey={shakeKey}
            />
            {!live && !over && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-[2px]" aria-live="assertive">
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">{t('versus.arena.matchStarting')}</p>
                  <p key={countdown} className="animate-peg-pop font-mono text-8xl font-black text-primary">
                    {countdown}
                  </p>
                </div>
              </div>
            )}
          </div>
          <Card className="mx-auto mt-4 max-w-lg">
            <CardContent className="grid gap-4 p-4">
              <Palette onPick={onPick} colorblind={colorblind} disabled={!canPlay} palette={match.palette as PegColor[]} />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={onUndo} disabled={!canPlay}>
                  <Undo2 /> <span className="hidden sm:inline">{t('play.undo')}</span>
                </Button>
                <Button variant="outline" onClick={onClear} disabled={!canPlay}>
                  <Eraser /> <span className="hidden sm:inline">{t('play.clear')}</span>
                </Button>
                <Button onClick={onSubmit} disabled={!canPlay || !isRowComplete(state.board.current)}>
                  {submitting ? <Loader2 className="animate-spin" /> : <Check />}
                  <span className="hidden sm:inline">{submitting ? t('play.submitting') : t('play.submit')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-label={t('versus.arena.progress')}>
          <PlayerHeader
            name={match.opponent.username}
            subtitle={t('versus.arena.colorsHidden')}
            rating={match.opponent.isGuest ? null : match.opponent.rating}
            user={{ role: 'PLAYER', isGuest: match.opponent.isGuest }}
            status={
              <Badge variant={state.opponentConnected ? 'success' : 'warning'} className="gap-1">
                {state.opponentConnected ? t('versus.arena.opponentConnected') : t('common.loading')}
              </Badge>
            }
          />
          <div className="mx-auto max-w-lg">
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('versus.arena.opponentRow', { row: opponentCurrentRow })}</p>
                <p className="font-semibold">{t('versus.arena.rowOf', { current: opponentCurrentRow, max: match.maxAttempts })}</p>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('common.attempts')}</p>
                <p className="font-semibold">
                  {state.opponentRows.length === 0
                    ? t('versus.arena.noGuessesYet')
                    : lastOpponent?.atMs != null
                      ? t('versus.arena.lastGuessAt', { time: formatDuration(lastOpponent.atMs) })
                      : t('versus.arena.attemptsUsed', { count: state.opponentRows.length })}
                </p>
              </div>
              {state.opponentRows.length > 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t('versus.arena.attemptsUsed', { count: state.opponentRows.length })} · {t('versus.arena.bestFeedback', { exact: best.exact, partial: best.partial })}
                </p>
              )}
            </div>
            <OpponentBoard
              rows={state.opponentRows}
              maxAttempts={match.maxAttempts}
              codeLength={match.codeLength}
              colorblind={colorblind}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function PlayerHeader({
  name,
  subtitle,
  rating,
  user,
  status,
  highlight = false,
}: {
  name: string;
  subtitle: string;
  rating?: number | null;
  user?: { role: 'PLAYER' | 'ADMIN'; isGuest: boolean } | null;
  status?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn('mx-auto mb-3 flex max-w-lg items-center justify-between gap-3 rounded-xl border px-4 py-3', highlight ? 'border-primary/40 bg-primary/5' : 'bg-card')}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 truncate text-lg font-bold">
          {name}
          {user && <RoleBadge user={user} />}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {rating != null && <span className="font-mono text-sm font-semibold tabular-nums">{rating}</span>}
        {status}
      </div>
    </div>
  );
}
