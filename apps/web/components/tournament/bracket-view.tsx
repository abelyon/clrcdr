'use client';

import * as React from 'react';
import { Crown, Loader2, Play } from 'lucide-react';
import type { BracketMatch, PlayerRef } from '@mastermind/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { groupByRound, isPlayableBy, roundTitle } from '@/lib/bracket';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n-provider';

interface BracketViewProps {
  matches: readonly BracketMatch[];
  totalRounds: number;
  currentUserId?: string | null;
  onPlay?: (match: BracketMatch) => void;
  playingMatchId?: string | null;
  className?: string;
  /** Compact cards for illustrations. */
  compact?: boolean;
}

const statusVariant = {
  PENDING: 'secondary',
  READY: 'accent',
  IN_PROGRESS: 'warning',
  BYE: 'outline',
  COMPLETED: 'success',
} as const;

export function BracketView({ matches, totalRounds, currentUserId, onPlay, playingMatchId, className, compact = false }: BracketViewProps) {
  const { t } = useI18n();
  const rounds = React.useMemo(() => groupByRound(matches), [matches]);

  return (
    <div className={cn('overflow-x-auto pb-4 scrollbar-thin', className)} role="group" aria-label={t('tournaments.bracket')}>
      <div className="flex min-w-max gap-6 sm:gap-10">
        {rounds.map((round, index) => {
          const roundNumber = round[0]?.round ?? index + 1;
          return (
            <section key={roundNumber} className="flex w-60 flex-col" aria-label={roundTitle(roundNumber, totalRounds, t)}>
              <h3 className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {roundTitle(roundNumber, totalRounds, t)}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {round.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    isFinal={roundNumber === totalRounds}
                    currentUserId={currentUserId}
                    onPlay={onPlay}
                    busy={playingMatchId === match.id}
                    compact={compact}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  isFinal,
  currentUserId,
  onPlay,
  busy,
  compact,
}: {
  match: BracketMatch;
  isFinal: boolean;
  currentUserId?: string | null;
  onPlay?: (match: BracketMatch) => void;
  busy: boolean;
  compact: boolean;
}) {
  const { t } = useI18n();
  const playable = !!onPlay && isPlayableBy(match, currentUserId);
  const isBye = match.status === 'BYE';

  return (
    <article
      data-match-id={match.id}
      data-status={match.status}
      aria-label={`${t('tournaments.round', { round: match.round })} #${match.matchOrder + 1}`}
      className={cn(
        'relative rounded-xl border bg-card shadow-sm transition-colors',
        playable && 'border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]',
        match.status === 'IN_PROGRESS' && 'border-warning/60',
        isBye && 'opacity-75',
        isFinal && 'border-warning/50',
      )}
    >
      {!isFinal && <span className="pointer-events-none absolute -right-6 top-1/2 hidden h-px w-6 bg-border sm:block sm:-right-10 sm:w-10" aria-hidden />}
      <PlayerLine player={match.player1} match={match} slot={1} currentUserId={currentUserId} compact={compact} />
      <div className="h-px bg-border" />
      <PlayerLine player={match.player2} match={match} slot={2} currentUserId={currentUserId} compact={compact} />
      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1.5">
        <Badge variant={statusVariant[match.status]} className="text-[10px]">
          {match.status === 'IN_PROGRESS' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
          {t(`tournaments.matchStatus.${match.status}`)}
        </Badge>
        {playable && (
          <Button size="sm" className="h-7 px-2.5" onClick={() => onPlay?.(match)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {t('tournaments.playMatch')}
          </Button>
        )}
      </div>
    </article>
  );
}

function PlayerLine({
  player,
  match,
  slot,
  currentUserId,
  compact,
}: {
  player: PlayerRef | null;
  match: BracketMatch;
  slot: 1 | 2;
  currentUserId?: string | null;
  compact: boolean;
}) {
  const { t } = useI18n();
  const isWinner = !!player && match.winnerId === player.id;
  const isLoser = !!player && !!match.winnerId && match.winnerId !== player.id;
  const isMe = !!player && !!currentUserId && player.id === currentUserId;
  const empty = !player;
  const label = player ? player.username : match.status === 'BYE' ? t('common.bye') : t('common.tbd');

  return (
    <div
      data-slot={slot}
      className={cn(
        'flex items-center gap-2 px-3',
        compact ? 'py-1.5' : 'py-2.5',
        isWinner && 'bg-success/10 font-semibold',
        isLoser && 'text-muted-foreground line-through decoration-muted-foreground/50',
        empty && 'italic text-muted-foreground',
      )}
    >
      <span className="w-6 shrink-0 rounded bg-muted px-1 text-center font-mono text-[10px] leading-5 text-muted-foreground" title={player?.seed ? t('tournaments.seedLabel', { seed: player.seed }) : undefined}>
        {player?.seed ?? '-'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {label}
        {isMe && <span className="ml-1 text-xs text-primary">({t('common.you')})</span>}
      </span>
      {player?.isBot && (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {t('admin.bot')}
        </Badge>
      )}
      {isWinner && <Crown className="h-3.5 w-3.5 shrink-0 text-warning" aria-label={t('common.winner')} />}
    </div>
  );
}
