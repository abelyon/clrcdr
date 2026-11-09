'use client';

import * as React from 'react';
import { feedbackToPegs, PEG_META, type PegColor } from '@mastermind/shared';
import type { BoardState } from '@/lib/board';
import { cn } from '@/lib/utils';
import { useI18n } from '@/providers/i18n-provider';
import { EmptySlot, FeedbackPegs, HiddenPeg, Peg } from './peg';

interface MastermindBoardProps {
  state: BoardState;
  colorblind: boolean;
  /** Whether the active row accepts input. */
  interactive?: boolean;
  onSlotClick?: (index: number) => void;
  /** Revealed secret code (only passed once the game is over). */
  secret?: readonly PegColor[] | null;
  /** Triggers a short shake on the active row (invalid guess). */
  shakeKey?: number;
  size?: 'md' | 'sm';
  className?: string;
}

const sizes = {
  md: { slot: 'h-10 w-10 sm:h-12 sm:w-12', gap: 'gap-2 sm:gap-3', row: 'px-2 py-1.5 sm:px-3 sm:py-2' },
  sm: { slot: 'h-7 w-7 sm:h-8 sm:w-8', gap: 'gap-1.5', row: 'px-2 py-1' },
} as const;

/** The classic 10 x 4 Mastermind board. Attempt 1 is at the top; the active row is highlighted. */
export function MastermindBoard({
  state,
  colorblind,
  interactive = true,
  onSlotClick,
  secret,
  shakeKey = 0,
  size = 'md',
  className,
}: MastermindBoardProps) {
  const { t } = useI18n();
  const activeIndex = state.rows.length;
  const s = sizes[size];
  const finished = activeIndex >= state.maxAttempts;

  return (
    <div
      role="group"
      aria-label={t('play.board')}
      className={cn('rounded-2xl border bg-[hsl(var(--board))] p-2 shadow-inner sm:p-3', className)}
    >
      {secret && (
        <div className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 sm:mb-3">
          <span className="mr-1 hidden text-xs font-semibold uppercase tracking-wide text-primary sm:inline">
            {t('play.summary.secret')}
          </span>
          <div className={cn('flex', s.gap)}>
            {secret.map((color, i) => (
              <Peg
                key={i}
                color={color}
                colorblind={colorblind}
                showLetter
                animate
                className={s.slot}
                aria-label={t(PEG_META[color].nameKey)}
              />
            ))}
          </div>
        </div>
      )}
      <ol className="flex flex-col gap-1">
        {Array.from({ length: state.maxAttempts }, (_, rowIndex) => {
          const submitted = state.rows[rowIndex];
          const isActive = rowIndex === activeIndex && !finished;
          return (
            <li
              key={isActive ? `${rowIndex}-${shakeKey}` : rowIndex}
              aria-current={isActive ? 'step' : undefined}
              aria-label={t('play.row', { row: rowIndex + 1 })}
              className={cn(
                'flex items-center gap-2 rounded-xl border border-transparent transition-colors sm:gap-3',
                s.row,
                isActive && 'border-primary/40 bg-primary/5',
                isActive && shakeKey > 0 && 'animate-shake',
                !isActive && !submitted && 'opacity-60',
              )}
            >
              <span className="w-5 text-right font-mono text-xs tabular-nums text-muted-foreground sm:w-6 sm:text-sm">
                {rowIndex + 1}
              </span>
              <div className={cn('flex flex-1 items-center justify-center', s.gap)}>
                {Array.from({ length: state.codeLength }, (_, slotIndex) => {
                  const color = submitted ? submitted.guess[slotIndex] : isActive ? state.current[slotIndex] : null;
                  if (color) {
                    const name = t(PEG_META[color].nameKey);
                    const label = `${t('play.row', { row: rowIndex + 1 })}, ${t('play.slot', { slot: slotIndex + 1 })}: ${name}`;
                    return isActive && interactive ? (
                      <button
                        key={slotIndex}
                        type="button"
                        onClick={() => onSlotClick?.(slotIndex)}
                        aria-label={label}
                        className={cn(
                          'rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          state.cursor === slotIndex && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                        )}
                      >
                        <Peg color={color} colorblind={colorblind} showLetter animate className={s.slot} />
                      </button>
                    ) : (
                      <Peg
                        key={slotIndex}
                        color={color}
                        colorblind={colorblind}
                        showLetter
                        className={s.slot}
                        role="img"
                        aria-label={label}
                      />
                    );
                  }
                  const label = `${t('play.row', { row: rowIndex + 1 })}, ${t('play.slot', { slot: slotIndex + 1 })}: ${t('play.emptySlot')}`;
                  return isActive && interactive ? (
                    <button
                      key={slotIndex}
                      type="button"
                      onClick={() => onSlotClick?.(slotIndex)}
                      aria-label={label}
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <EmptySlot active={state.cursor === slotIndex} className={s.slot} />
                    </button>
                  ) : (
                    <EmptySlot key={slotIndex} className={s.slot} aria-label={label} role="img" />
                  );
                })}
              </div>
              <FeedbackPegs
                kinds={feedbackToPegs(submitted ?? { exact: 0, partial: 0 }, state.codeLength).map((k) =>
                  submitted ? k : 'empty',
                )}
                colorblind={colorblind}
                label={
                  submitted
                    ? t('feedback.summary', { exact: submitted.exact, partial: submitted.partial })
                    : t('feedback.none')
                }
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface OpponentRow {
  exact: number;
  partial: number;
}

interface OpponentBoardProps {
  rows: readonly OpponentRow[];
  maxAttempts: number;
  codeLength: number;
  colorblind: boolean;
  /** Reveal the opponent's progress without colors. */
  className?: string;
}

/** Opponent telemetry board: shows rows submitted and exact/partial counts, never colors. */
export function OpponentBoard({ rows, maxAttempts, codeLength, colorblind, className }: OpponentBoardProps) {
  const { t } = useI18n();
  const activeIndex = rows.length;
  return (
    <div
      role="group"
      aria-label={t('versus.arena.progress')}
      className={cn('rounded-2xl border bg-[hsl(var(--board))] p-2 shadow-inner sm:p-3', className)}
    >
      <ol className="flex flex-col gap-1">
        {Array.from({ length: maxAttempts }, (_, rowIndex) => {
          const submitted = rows[rowIndex];
          const isActive = rowIndex === activeIndex;
          return (
            <li
              key={rowIndex}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-xl border border-transparent px-2 py-1 sm:gap-3',
                isActive && 'border-primary/40 bg-primary/5',
                !isActive && !submitted && 'opacity-50',
              )}
            >
              <span className="w-5 text-right font-mono text-xs tabular-nums text-muted-foreground sm:w-6 sm:text-sm">
                {rowIndex + 1}
              </span>
              <div className="flex flex-1 items-center justify-center gap-1.5">
                {Array.from({ length: codeLength }, (_, i) =>
                  submitted ? (
                    <HiddenPeg key={i} className="h-7 w-7 sm:h-8 sm:w-8" />
                  ) : (
                    <EmptySlot key={i} active={false} className="h-7 w-7 sm:h-8 sm:w-8" />
                  ),
                )}
              </div>
              <FeedbackPegs
                kinds={feedbackToPegs(submitted ?? { exact: 0, partial: 0 }, codeLength).map((k) =>
                  submitted ? k : 'empty',
                )}
                colorblind={colorblind}
                label={
                  submitted
                    ? t('feedback.summary', { exact: submitted.exact, partial: submitted.partial })
                    : t('feedback.none')
                }
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
