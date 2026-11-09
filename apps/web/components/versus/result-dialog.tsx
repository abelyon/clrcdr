'use client';

import Link from 'next/link';
import { ArrowLeft, Equal, Frown, RotateCcw, Trophy } from 'lucide-react';
import { formatDuration, PEG_META, type MatchEndedPayload, type PegColor } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Peg } from '@/components/game/peg';
import { outcomeFor } from '@/lib/match';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

export function MatchResultDialog({
  open,
  onOpenChange,
  ended,
  colorblind,
  onRematch,
  onLobby,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ended: MatchEndedPayload;
  colorblind: boolean;
  onRematch: () => void;
  onLobby: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const outcome = outcomeFor(ended, user?.id);
  const Icon = outcome === 'win' ? Trophy : outcome === 'loss' ? Frown : Equal;
  const reasonKey = (() => {
    switch (ended.reason) {
      case 'solved':
        return outcome === 'win' ? 'versus.result.reasonSolvedYou' : outcome === 'loss' ? 'versus.result.reasonSolvedOpponent' : 'versus.result.reasonSolved';
      case 'exhausted':
        return 'versus.result.reasonExhausted';
      case 'forfeit':
        return 'versus.result.reasonForfeit';
      case 'disconnect':
        return 'versus.result.reasonDisconnect';
      case 'timeout':
        return 'versus.result.reasonTimeout';
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} className="max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span
            className={cn(
              'mb-1 inline-flex h-16 w-16 items-center justify-center rounded-full',
              outcome === 'win' && 'bg-success/15 text-success',
              outcome === 'loss' && 'bg-destructive/15 text-destructive',
              outcome === 'draw' && 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="h-8 w-8" aria-hidden />
          </span>
          <DialogTitle className="text-2xl" data-testid="match-outcome">
            {outcome === 'win' ? t('versus.result.winTitle') : outcome === 'loss' ? t('versus.result.lossTitle') : t('versus.result.drawTitle')}
          </DialogTitle>
          <DialogDescription>
            {t(reasonKey)} · {formatDuration(ended.durationMs)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('versus.result.secret')}</p>
          <div className="flex justify-center gap-2">
            {ended.secretCode.map((color: PegColor, i: number) => (
              <Peg key={i} color={color} colorblind={colorblind} showLetter animate className="h-11 w-11" role="img" aria-label={t(PEG_META[color].nameKey)} />
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl border p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('versus.result.yourScore')}</dt>
            <dd className="font-mono text-2xl font-bold tabular-nums">{ended.yourScore.total}</dd>
          </div>
          <div className="rounded-xl border p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('versus.result.opponentScore')}</dt>
            <dd className="font-mono text-2xl font-bold tabular-nums">{ended.opponentScore.total}</dd>
          </div>
          {ended.ratingChange != null && (
            <>
              <div className="rounded-xl border p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('versus.result.ratingChange')}</dt>
                <dd className={cn('font-mono text-2xl font-bold tabular-nums', ended.ratingChange >= 0 ? 'text-success' : 'text-destructive')}>
                  {ended.ratingChange > 0 ? '+' : ''}
                  {ended.ratingChange}
                </dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('versus.result.newRating')}</dt>
                <dd className="font-mono text-2xl font-bold tabular-nums">{ended.newRating ?? '-'}</dd>
              </div>
            </>
          )}
        </dl>
        {ended.ratingChange == null && <p className="text-center text-xs text-muted-foreground">{t('versus.rankedNote')}</p>}

        <div className="grid gap-2">
          {ended.tournamentId ? (
            <Button size="lg" asChild>
              <Link href={`/tournaments/${ended.tournamentId}`}>
                <ArrowLeft /> {t('versus.result.backToTournament')}
              </Link>
            </Button>
          ) : (
            <Button size="lg" onClick={onRematch}>
              <RotateCcw /> {t('versus.result.rematch')}
            </Button>
          )}
          <Button variant="outline" onClick={onLobby}>
            {t('versus.result.backToLobby')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
