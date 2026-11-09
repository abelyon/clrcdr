'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, LogIn, RotateCcw, Trophy, CheckCircle2, Frown, PartyPopper } from 'lucide-react';
import { formatDuration, PEG_META, type PegColor, type ScoreBreakdown } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';
import { Peg } from './peg';

interface SoloSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string | null;
  won: boolean;
  attempts: number;
  durationMs: number;
  score: ScoreBreakdown | null;
  secret: readonly PegColor[];
  colorblind: boolean;
  onPlayAgain: () => void;
}

type SubmitState = { status: 'idle' } | { status: 'submitting' } | { status: 'done'; rank: number | null } | { status: 'error'; message: string };

export function SoloSummaryDialog({
  open,
  onOpenChange,
  gameId,
  won,
  attempts,
  durationMs,
  score,
  secret,
  colorblind,
  onPlayAgain,
}: SoloSummaryDialogProps) {
  const { t } = useI18n();
  const { user, isGuest, openAuthModal } = useAuth();
  const [submit, setSubmit] = React.useState<SubmitState>({ status: 'idle' });
  const registered = !!user && !isGuest;
  const attempted = React.useRef<string | null>(null);

  const doSubmit = React.useCallback(async () => {
    if (!gameId) return;
    setSubmit({ status: 'submitting' });
    try {
      const response = await api.submitScore(gameId);
      setSubmit({ status: 'done', rank: response.rank ?? null });
    } catch (error) {
      setSubmit({ status: 'error', message: errorMessage(error, t) });
    }
  }, [gameId, t]);

  React.useEffect(() => {
    if (!open || !won || !registered || !gameId) return;
    const key = `${gameId}:${user?.id}`;
    if (attempted.current === key) return;
    attempted.current = key;
    void doSubmit();
  }, [open, won, registered, gameId, user?.id, doSubmit]);

  React.useEffect(() => {
    if (!open) setSubmit({ status: 'idle' });
  }, [open, gameId]);

  const total = score?.total ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common.close')} className="max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <span
            className={`mb-1 inline-flex h-14 w-14 items-center justify-center rounded-full ${won ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}
          >
            {won ? <PartyPopper className="h-7 w-7" aria-hidden /> : <Frown className="h-7 w-7" aria-hidden />}
          </span>
          <DialogTitle className="text-2xl">{won ? t('play.summary.winTitle') : t('play.summary.lossTitle')}</DialogTitle>
          <DialogDescription>
            {won
              ? t('play.summary.winBody', { attempts, time: formatDuration(durationMs) })
              : t('play.summary.lossBody')}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/40 p-3">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('play.summary.secret')}
          </p>
          <div className="flex justify-center gap-2">
            {secret.map((color, i) => (
              <Peg
                key={i}
                color={color}
                colorblind={colorblind}
                showLetter
                animate
                className="h-11 w-11"
                aria-label={t(PEG_META[color].nameKey)}
                role="img"
              />
            ))}
          </div>
        </div>

        {won && score ? (
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-semibold">{t('play.summary.scoreTitle')}</h3>
            <dl className="grid gap-1.5 text-sm">
              <Row label={t('play.summary.base')} value={score.base} />
              <Row label={t('play.summary.attemptBonus')} value={`+${score.attemptBonus}`} />
              <Row label={t('play.summary.timeBonus')} value={`+${score.timeBonus}`} />
              <div className="mt-1 flex items-center justify-between border-t pt-2 text-base font-bold">
                <dt>{t('play.summary.total')}</dt>
                <dd className="font-mono text-xl text-primary tabular-nums" data-testid="total-score">
                  {total}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">{t('play.summary.lossNoScore')}</p>
        )}

        {won && (
          <div className="grid gap-2 text-center text-sm" aria-live="polite">
            {submit.status === 'submitting' && (
              <p className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('play.summary.submitting')}
              </p>
            )}
            {submit.status === 'done' && (
              <p className="flex items-center justify-center gap-2 font-medium text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {t('play.summary.submitted')}
                {submit.rank ? ` · ${t('play.summary.rank', { rank: submit.rank })}` : ''}
              </p>
            )}
            {submit.status === 'error' && (
              <div className="grid gap-2">
                <p className="text-destructive">{t('play.summary.submitError')}: {submit.message}</p>
                <Button variant="outline" onClick={() => void doSubmit()}>
                  {t('play.summary.submitScore')}
                </Button>
              </div>
            )}
            {!registered && (
              <div className="grid gap-2">
                <p className="text-muted-foreground">
                  {isGuest ? t('play.summary.guestNoScore') : t('play.summary.loginToSubmit')}
                </p>
                <Button variant="outline" onClick={() => openAuthModal(isGuest ? 'register' : 'login')}>
                  <LogIn /> {t('play.summary.loginAction')}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={onPlayAgain}>
            <RotateCcw /> {t('play.summary.playAgain')}
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/leaderboard">
              <Trophy /> {t('play.summary.viewLeaderboard')}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
