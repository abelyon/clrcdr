'use client';

import * as React from 'react';
import { CheckCircle2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { CODE_LENGTH, evaluateGuess, feedbackToPegs, type PegColor } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { clearRow, colorForKey, createBoard, commitRow, isRowComplete, placePeg, removePeg, toggleSlot } from '@/lib/board';
import { playSound, unlockAudio } from '@/lib/sound';
import { useI18n } from '@/providers/i18n-provider';
import { useSettings } from '@/providers/settings-provider';
import { MastermindBoard } from './mastermind-board';
import { Palette } from './palette';
import { Peg } from './peg';

export const TUTORIAL_SECRET: readonly PegColor[] = ['B', 'R', 'G', 'R'];
const TUTORIAL_ROWS = 6;

/** Fully client-side practice round with a fixed, visible-on-demand secret. */
export function RulesTutorial() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const cb = settings.colorblindMode;
  const [board, setBoard] = React.useState(() => createBoard(CODE_LENGTH, TUTORIAL_ROWS));
  const [revealed, setRevealed] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [shakeKey, setShakeKey] = React.useState(0);

  const last = board.rows[board.rows.length - 1];
  const solved = !!last && last.exact === CODE_LENGTH;
  const over = solved || board.rows.length >= board.maxAttempts;

  const pick = (color: PegColor) => {
    if (over) return;
    unlockAudio();
    playSound('place');
    setMessage(null);
    setBoard((b) => placePeg(b, color));
  };

  const check = () => {
    if (over) return;
    if (!isRowComplete(board.current)) {
      setMessage(t('rules.tutorial.incomplete', { length: CODE_LENGTH }));
      setShakeKey((k) => k + 1);
      playSound('error');
      return;
    }
    const feedback = evaluateGuess(TUTORIAL_SECRET, board.current as PegColor[]);
    setBoard((b) => commitRow(b, feedback));
    setMessage(null);
    if (feedback.exact === CODE_LENGTH) {
      playSound('win');
      setRevealed(true);
    } else {
      playSound('submit');
    }
  };

  const reset = () => {
    setBoard(createBoard(CODE_LENGTH, TUTORIAL_ROWS));
    setRevealed(false);
    setMessage(null);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const color = colorForKey(event.key);
    if (color) {
      event.preventDefault();
      pick(color);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      setBoard((b) => removePeg(b));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      check();
    }
  };

  return (
    <Card id="tutorial" className="scroll-mt-24 border-primary/30" onKeyDown={onKeyDown}>
      <CardHeader>
        <CardTitle>{t('rules.tutorial.title')}</CardTitle>
        <CardDescription>{t('rules.tutorial.intro')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <MastermindBoard
          state={board}
          colorblind={cb}
          interactive={!over}
          onSlotClick={(i) => setBoard((b) => toggleSlot(b, i))}
          secret={revealed ? TUTORIAL_SECRET : null}
          shakeKey={shakeKey}
          size="sm"
        />
        <div className="grid content-start gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold">{t('rules.tutorial.pickColor')}</p>
            <Palette onPick={pick} colorblind={cb} disabled={over} className="justify-start" />
            <p className="mt-2 text-xs text-muted-foreground">{t('rules.tutorial.hint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={check} disabled={over}>
              {t('rules.tutorial.submit')}
            </Button>
            <Button variant="outline" onClick={() => setBoard((b) => clearRow(b))} disabled={over}>
              {t('rules.tutorial.clear')}
            </Button>
            <Button variant="ghost" onClick={() => setRevealed((v) => !v)}>
              {revealed ? <EyeOff /> : <Eye />}
              {revealed ? t('rules.tutorial.secretHidden') : t('rules.tutorial.reveal')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              <RotateCcw /> {t('rules.tutorial.reset')}
            </Button>
          </div>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          {board.rows.length === 0 && !message && <p className="text-sm text-muted-foreground">{t('rules.tutorial.empty')}</p>}
          {board.rows.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">{t('rules.tutorial.history')}</p>
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {board.rows.map((row, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-4 font-mono text-xs">{i + 1}</span>
                    <span className="flex gap-1">
                      {row.guess.map((c, j) => (
                        <Peg key={j} color={c} colorblind={cb} className="h-5 w-5" />
                      ))}
                    </span>
                    <span>{t('feedback.summary', { exact: row.exact, partial: row.partial })}</span>
                    <span className="sr-only">{feedbackToPegs(row).join(' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {solved && (
            <p className="flex items-start gap-2 rounded-lg border border-success/50 bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {t('rules.tutorial.solved')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
