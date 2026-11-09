'use client';

import * as React from 'react';
import { Check, Clock, Eraser, Keyboard, Loader2, Play, RotateCcw, Target, Undo2 } from 'lucide-react';
import {
  MAX_ATTEMPTS,
  formatDuration,
  type GuessResult,
  type PegColor,
  type ScoreBreakdown,
} from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { FeedbackLegend } from '@/components/game/feedback-legend';
import { GameStat } from '@/components/game/game-stat';
import { MastermindBoard } from '@/components/game/mastermind-board';
import { Palette } from '@/components/game/palette';
import { SoloSummaryDialog } from '@/components/game/solo-summary-dialog';
import { PageHeader } from '@/components/page-header';
import { useElapsed } from '@/hooks/use-elapsed';
import { ApiError, api } from '@/lib/api';
import {
  clearRow,
  colorForKey,
  commitRow,
  createBoard,
  isRowComplete,
  placePeg,
  removePeg,
  toggleSlot,
  type BoardState,
} from '@/lib/board';
import { errorMessage } from '@/lib/errors';
import { serverNow, syncClock } from '@/lib/clock';
import { readStorage, writeStorage } from '@/lib/storage';
import { playSound, unlockAudio } from '@/lib/sound';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';

type Phase = 'idle' | 'starting' | 'playing' | 'over';

const GAME_KEY = 'clrcdr.solo.gameId';

interface ActiveGame {
  gameId: string;
  /** Epoch ms on the server clock. */
  startedAt: number;
  palette: PegColor[];
}

interface Outcome {
  won: boolean;
  attempts: number;
  durationMs: number;
  score: ScoreBreakdown | null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export default function PlayPage() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { toast } = useToast();
  const cb = settings.colorblindMode;

  const [phase, setPhase] = React.useState<Phase>('idle');
  const [board, setBoard] = React.useState<BoardState>(() => createBoard());
  const [game, setGame] = React.useState<ActiveGame | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [shakeKey, setShakeKey] = React.useState(0);
  const [secret, setSecret] = React.useState<PegColor[] | null>(null);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  const boardRef = React.useRef(board);
  boardRef.current = board;
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  const submittingRef = React.useRef(false);

  const elapsed = useElapsed(game?.startedAt ?? null, phase === 'playing', serverNow, outcome?.durationMs);

  const startGame = React.useCallback(async () => {
    unlockAudio();
    setPhase('starting');
    setStartError(null);
    try {
      await syncClock();
      const response = await api.soloStart();
      setBoard(createBoard(response.codeLength, response.maxAttempts));
      setGame({ gameId: response.gameId, startedAt: serverNow(), palette: response.palette });
      setSecret(null);
      setOutcome(null);
      setSummaryOpen(false);
      writeStorage(GAME_KEY, response.gameId);
      setPhase('playing');
      playSound('match');
    } catch (error) {
      setPhase('idle');
      setStartError(`${t('play.startError')}: ${errorMessage(error, t)}`);
    }
  }, [t]);

  React.useEffect(() => {
    const saved = readStorage(GAME_KEY);
    if (!saved) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncClock();
        const resume = await api.soloGet(saved);
        if (cancelled) return;
        if (resume.isGameOver) {
          writeStorage(GAME_KEY, null);
          return;
        }
        let restored = createBoard(resume.codeLength, resume.maxAttempts);
        for (const record of resume.guesses) {
          for (const color of record.guess) restored = placePeg(restored, color);
          restored = commitRow(restored, { exact: record.exact, partial: record.partial });
        }
        setBoard(restored);
        setGame({ gameId: resume.gameId, startedAt: resume.startedAt, palette: resume.palette as PegColor[] });
        setPhase('playing');
      } catch {
        writeStorage(GAME_KEY, null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = React.useCallback((color: PegColor) => {
    if (phaseRef.current !== 'playing' || submittingRef.current) return;
    playSound('place');
    setBoard((b) => placePeg(b, color));
  }, []);

  const undo = React.useCallback(() => {
    if (phaseRef.current !== 'playing' || submittingRef.current) return;
    playSound('remove');
    setBoard((b) => removePeg(b));
  }, []);

  const clear = React.useCallback(() => {
    if (phaseRef.current !== 'playing' || submittingRef.current) return;
    playSound('remove');
    setBoard((b) => clearRow(b));
  }, []);

  const finish = React.useCallback((result: GuessResult, finalBoard: BoardState) => {
    setSecret((result.secretCode as PegColor[] | undefined) ?? null);
    setOutcome({
      won: result.isWin,
      attempts: result.attemptsUsed ?? finalBoard.rows.length,
      durationMs: result.durationMs ?? 0,
      score: result.score ?? null,
    });
    setPhase('over');
    writeStorage(GAME_KEY, null);
    playSound(result.isWin ? 'win' : 'lose');
    window.setTimeout(() => setSummaryOpen(true), 650);
  }, []);

  const submit = React.useCallback(async () => {
    if (phaseRef.current !== 'playing' || submittingRef.current || !game) return;
    const current = boardRef.current;
    if (!isRowComplete(current.current)) {
      setShakeKey((k) => k + 1);
      playSound('error');
      toast({ title: t('play.incomplete', { length: current.codeLength }), variant: 'error', durationMs: 1800 });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    playSound('submit');
    try {
      const result = await api.soloGuess({
        gameId: game.gameId,
        guess: current.current as Array<'R' | 'G' | 'B' | 'Y' | 'P' | 'O'>,
      });
      const next = commitRow(current, { exact: result.exact, partial: result.partial });
      setBoard(next);
      if (result.isGameOver) finish(result, next);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
        toast({ title: error.status === 404 ? t('errors.gameNotFound') : t('errors.gameOver'), variant: 'error' });
        writeStorage(GAME_KEY, null);
        setPhase('idle');
        setGame(null);
        setBoard(createBoard());
      } else {
        playSound('error');
        toast({ title: t('play.guessError'), description: errorMessage(error, t), variant: 'error' });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [finish, game, t, toast]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (phaseRef.current !== 'playing') return;
      const color = colorForKey(event.key, game?.palette);
      if (color) {
        event.preventDefault();
        pick(color);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        undo();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      } else if (event.key === 'Escape') {
        clear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clear, game?.palette, pick, submit, undo]);

  const playing = phase === 'playing';
  const complete = isRowComplete(board.current);
  const attemptNumber = Math.min(board.rows.length + 1, board.maxAttempts);
  const attemptsShown =
    phase === 'idle' || phase === 'starting' ? 0 : phase === 'over' ? (outcome?.attempts ?? board.rows.length) : attemptNumber;

  return (
    <div className="container py-8 sm:py-10">
      <PageHeader
        title={t('play.title')}
        subtitle={t('play.subtitle', { max: MAX_ATTEMPTS })}
        actions={
          phase === 'playing' || phase === 'over' ? (
            <Button variant="outline" onClick={() => void startGame()}>
              <RotateCcw /> {t('play.newGame')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,32rem)_1fr]">
        <div className="relative mx-auto w-full max-w-lg">
          <MastermindBoard
            state={board}
            colorblind={cb}
            interactive={playing && !submitting}
            onSlotClick={(i) => {
              if (!playing) return;
              playSound('select');
              setBoard((b) => toggleSlot(b, i));
            }}
            secret={phase === 'over' ? secret : null}
            shakeKey={shakeKey}
          />
          {(phase === 'idle' || phase === 'starting') && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/70 p-6 text-center backdrop-blur-[2px]">
              <div className="grid max-w-xs gap-4">
                <Target className="mx-auto h-10 w-10 text-primary" aria-hidden />
                <p className="text-sm text-muted-foreground">{t('play.shortcutsHint')}</p>
                <Button size="lg" onClick={() => void startGame()} disabled={phase === 'starting'}>
                  {phase === 'starting' ? <Loader2 className="animate-spin" /> : <Play />}
                  {phase === 'starting' ? t('play.startingGame') : t('play.start')}
                </Button>
                {startError && (
                  <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {startError}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-3">
            <GameStat label={t('play.timer')} value={formatDuration(elapsed)} icon={<Clock className="h-3.5 w-3.5" />} />
            <GameStat
              label={t('common.attempts')}
              value={`${attemptsShown}/${board.maxAttempts}`}
              icon={<Target className="h-3.5 w-3.5" />}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('play.palette')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Palette onPick={pick} colorblind={cb} disabled={!playing || submitting} palette={game?.palette} />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={undo} disabled={!playing || submitting} title={`${t('play.undo')} (Backspace)`}>
                  <Undo2 /> <span className="hidden sm:inline">{t('play.undo')}</span>
                </Button>
                <Button variant="outline" onClick={clear} disabled={!playing || submitting} title={`${t('play.clear')} (Esc)`}>
                  <Eraser /> <span className="hidden sm:inline">{t('play.clear')}</span>
                </Button>
                <Button onClick={() => void submit()} disabled={!playing || submitting || !complete} title={`${t('play.submit')} (Enter)`}>
                  {submitting ? <Loader2 className="animate-spin" /> : <Check />}
                  <span className="hidden sm:inline">{submitting ? t('play.submitting') : t('play.submit')}</span>
                </Button>
              </div>
              {playing && (
                <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                  {t('play.attemptOf', { current: attemptNumber, max: board.maxAttempts })} ·{' '}
                  {t('play.attemptsLeft', { count: board.maxAttempts - board.rows.length })}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Keyboard className="h-4 w-4" aria-hidden /> {t('rules.shortcuts.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ul className="grid gap-1.5 text-sm text-muted-foreground">
                <ShortcutRow label={t('rules.shortcuts.pickColor')} keys={t('rules.shortcuts.pickColorKeys')} />
                <ShortcutRow label={t('rules.shortcuts.backspace')} keys={t('rules.shortcuts.backspaceKey')} />
                <ShortcutRow label={t('rules.shortcuts.enter')} keys={t('rules.shortcuts.enterKey')} />
              </ul>
              <FeedbackLegend />
            </CardContent>
          </Card>
        </div>
      </div>

      {outcome && (
        <SoloSummaryDialog
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          gameId={game?.gameId ?? null}
          won={outcome.won}
          attempts={outcome.attempts}
          durationMs={outcome.durationMs}
          score={outcome.score}
          secret={secret ?? []}
          colorblind={cb}
          onPlayAgain={() => void startGame()}
        />
      )}
    </div>
  );
}

function ShortcutRow({ label, keys }: { label: string; keys: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{keys}</kbd>
    </li>
  );
}
