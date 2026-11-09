import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  SCORING,
  calculateEloChange,
  calculateScore,
  evaluateGuess,
  feedbackToPegs,
  formatDuration,
  generateSecret,
  isValidCode,
  isoWeekId,
  winRatePercent,
  type PegColor,
} from './index';

const c = (s: string) => s.split('') as PegColor[];

describe('evaluateGuess', () => {
  it('returns 4 exact for identical codes', () => {
    expect(evaluateGuess(c('RGBY'), c('RGBY'))).toEqual({ exact: 4, partial: 0 });
  });

  it('returns nothing when there is no overlap', () => {
    expect(evaluateGuess(c('RRRR'), c('GGGG'))).toEqual({ exact: 0, partial: 0 });
  });

  it('counts partials for permuted colors', () => {
    expect(evaluateGuess(c('RGBY'), c('GRYB'))).toEqual({ exact: 0, partial: 4 });
  });

  it('does not double count duplicates in the guess', () => {
    expect(evaluateGuess(c('RGBY'), c('RRRR'))).toEqual({ exact: 1, partial: 0 });
    expect(evaluateGuess(c('RGBY'), c('GRRR'))).toEqual({ exact: 0, partial: 2 });
  });

  it('does not double count duplicates in the secret', () => {
    expect(evaluateGuess(c('RRGB'), c('RGGG'))).toEqual({ exact: 2, partial: 0 });
    expect(evaluateGuess(c('RRBB'), c('BBRR'))).toEqual({ exact: 0, partial: 4 });
  });

  it('prioritises exact matches over partials', () => {
    expect(evaluateGuess(c('RGGB'), c('GGRR'))).toEqual({ exact: 1, partial: 2 });
    expect(evaluateGuess(c('RRGG'), c('RGRG'))).toEqual({ exact: 2, partial: 2 });
  });

  it('handles the classic tricky duplicate cases', () => {
    expect(evaluateGuess(c('RRRG'), c('GRRR'))).toEqual({ exact: 2, partial: 2 });
    expect(evaluateGuess(c('RGRG'), c('RRGB'))).toEqual({ exact: 1, partial: 2 });
    expect(evaluateGuess(c('BBYY'), c('YBBY'))).toEqual({ exact: 2, partial: 2 });
  });

  it('throws on a length mismatch', () => {
    expect(() => evaluateGuess(c('RGB'), c('RGBY'))).toThrow(RangeError);
  });

  it('exact + partial never exceeds the code length and is symmetric in totals', () => {
    const colors = ['R', 'G', 'B', 'Y', 'P', 'O'] as PegColor[];
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 500; i++) {
      const secret = generateSecret(rng, colors);
      const guess = generateSecret(rng, colors);
      const a = evaluateGuess(secret, guess);
      const b = evaluateGuess(guess, secret);
      expect(a.exact + a.partial).toBeLessThanOrEqual(4);
      expect(a.exact + a.partial).toBe(b.exact + b.partial);
      expect(a.exact).toBe(b.exact);
    }
  });
});

describe('generateSecret / isValidCode', () => {
  it('generates valid codes with duplicates allowed', () => {
    const code = generateSecret(() => 0);
    expect(code).toEqual(['R', 'R', 'R', 'R']);
    expect(isValidCode(code)).toBe(true);
  });

  it('never indexes out of range for random() === 1-epsilon', () => {
    expect(isValidCode(generateSecret(() => 0.9999999))).toBe(true);
  });

  it('rejects invalid codes', () => {
    expect(isValidCode(['R', 'G', 'B'])).toBe(false);
    expect(isValidCode(['R', 'G', 'B', 'X'])).toBe(false);
    expect(isValidCode('RGBY')).toBe(false);
    expect(isValidCode(['R', 'G', 'B', 'C'])).toBe(false);
  });
});

describe('feedbackToPegs', () => {
  it('orders exact, partial, empty', () => {
    expect(feedbackToPegs({ exact: 1, partial: 2 })).toEqual([
      'exact',
      'partial',
      'partial',
      'empty',
    ]);
  });
});

describe('calculateScore', () => {
  it('gives the maximum for an instant first-attempt win', () => {
    const score = calculateScore({ won: true, attemptsUsed: 1, durationMs: 0 });
    expect(score).toEqual({
      base: SCORING.BASE_WIN_POINTS,
      attemptBonus: (MAX_ATTEMPTS - 1) * SCORING.POINTS_PER_UNUSED_ATTEMPT,
      timeBonus: SCORING.MAX_TIME_BONUS,
      total:
        SCORING.BASE_WIN_POINTS +
        (MAX_ATTEMPTS - 1) * SCORING.POINTS_PER_UNUSED_ATTEMPT +
        SCORING.MAX_TIME_BONUS,
    });
  });

  it('gives no attempt bonus on the last attempt', () => {
    const score = calculateScore({ won: true, attemptsUsed: MAX_ATTEMPTS, durationMs: 1_000_000 });
    expect(score.attemptBonus).toBe(0);
    expect(score.timeBonus).toBe(0);
    expect(score.total).toBe(SCORING.BASE_WIN_POINTS);
  });

  it('decays the time bonus linearly', () => {
    const half = calculateScore({
      won: true,
      attemptsUsed: 5,
      durationMs: SCORING.TIME_BONUS_WINDOW_MS / 2,
    });
    expect(half.timeBonus).toBe(SCORING.MAX_TIME_BONUS / 2);
  });

  it('scores zero for a loss', () => {
    expect(calculateScore({ won: false, attemptsUsed: 10, durationMs: 1000 }).total).toBe(0);
  });

  it('clamps nonsensical inputs', () => {
    const score = calculateScore({ won: true, attemptsUsed: 99, durationMs: -5 });
    expect(score.attemptBonus).toBe(0);
    expect(score.timeBonus).toBe(SCORING.MAX_TIME_BONUS);
  });
});

describe('calculateEloChange', () => {
  it('is zero-sum for equal ratings', () => {
    const r = calculateEloChange(1000, 1000, 1);
    expect(r.deltaA).toBe(16);
    expect(r.deltaB).toBe(-16);
  });

  it('rewards upsets more', () => {
    expect(calculateEloChange(800, 1200, 1).deltaA).toBeGreaterThan(
      calculateEloChange(1200, 800, 1).deltaA,
    );
  });

  it('draws between equal players change nothing', () => {
    expect(calculateEloChange(1000, 1000, 0.5)).toMatchObject({ deltaA: 0, deltaB: 0 });
  });
});

describe('helpers', () => {
  it('computes win rate', () => {
    expect(winRatePercent(1, 3)).toBe(33.3);
    expect(winRatePercent(0, 0)).toBe(0);
  });

  it('computes ISO week ids', () => {
    expect(isoWeekId(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(isoWeekId(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01');
    expect(isoWeekId(new Date('2026-11-09T12:00:00Z'))).toBe('2026-W46');
  });

  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(65_400, true)).toBe('1:05.4');
    expect(formatDuration(null)).toBe('--:--');
  });
});
