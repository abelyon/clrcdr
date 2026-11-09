import {
  CODE_LENGTH,
  FEEDBACK_META,
  GAME_PALETTE,
  MAX_ATTEMPTS,
  RATING,
  SCORING,
  type FeedbackPegKind,
  type PegColor,
} from './constants';

export interface Feedback {
  /** Right color, right position. */
  exact: number;
  /** Right color, wrong position. */
  partial: number;
}

/**
 * Mastermind feedback with correct duplicate handling: every secret peg and every
 * guess peg is consumed at most once.
 */
export function evaluateGuess(
  secret: readonly PegColor[],
  guess: readonly PegColor[],
): Feedback {
  if (secret.length !== guess.length) {
    throw new RangeError(
      `Secret and guess must have the same length (got ${secret.length} and ${guess.length})`,
    );
  }

  let exact = 0;
  const secretCounts = new Map<PegColor, number>();
  const guessCounts = new Map<PegColor, number>();

  for (let i = 0; i < secret.length; i++) {
    const s = secret[i] as PegColor;
    const g = guess[i] as PegColor;
    if (s === g) {
      exact++;
    } else {
      secretCounts.set(s, (secretCounts.get(s) ?? 0) + 1);
      guessCounts.set(g, (guessCounts.get(g) ?? 0) + 1);
    }
  }

  let partial = 0;
  for (const [color, guessCount] of guessCounts) {
    partial += Math.min(guessCount, secretCounts.get(color) ?? 0);
  }

  return { exact, partial };
}

export function isWinningFeedback(feedback: Feedback, codeLength: number = CODE_LENGTH): boolean {
  return feedback.exact === codeLength;
}

export function isValidCode(
  code: unknown,
  palette: readonly PegColor[] = GAME_PALETTE,
  codeLength: number = CODE_LENGTH,
): code is PegColor[] {
  return (
    Array.isArray(code) &&
    code.length === codeLength &&
    code.every((c) => typeof c === 'string' && (palette as readonly string[]).includes(c))
  );
}

/** Generates a secret code (duplicates allowed). Pass a CSPRNG-backed `random` on the server. */
export function generateSecret(
  random: () => number = Math.random,
  palette: readonly PegColor[] = GAME_PALETTE,
  codeLength: number = CODE_LENGTH,
): PegColor[] {
  const code: PegColor[] = [];
  for (let i = 0; i < codeLength; i++) {
    const index = Math.min(palette.length - 1, Math.floor(random() * palette.length));
    code.push(palette[index] as PegColor);
  }
  return code;
}

/** Expands feedback into an ordered list of peg kinds: exact first, then partial, then empty. */
export function feedbackToPegs(
  feedback: Feedback,
  codeLength: number = CODE_LENGTH,
): FeedbackPegKind[] {
  const pegs: FeedbackPegKind[] = [];
  for (let i = 0; i < codeLength; i++) {
    if (i < feedback.exact) pegs.push('exact');
    else if (i < feedback.exact + feedback.partial) pegs.push('partial');
    else pegs.push('empty');
  }
  return pegs;
}

export function feedbackPegColor(kind: FeedbackPegKind, colorblind: boolean): string {
  const meta = FEEDBACK_META[kind];
  return colorblind ? meta.hexColorblind : meta.hex;
}

export interface ScoreInput {
  won: boolean;
  /** Number of guesses submitted (1-based count). */
  attemptsUsed: number;
  durationMs: number;
  maxAttempts?: number;
}

export interface ScoreBreakdown {
  base: number;
  attemptBonus: number;
  timeBonus: number;
  total: number;
}

/**
 * Base win points + bonus for unused attempts + speed bonus that decays linearly to zero
 * over `SCORING.TIME_BONUS_WINDOW_MS`. A loss scores `SCORING.LOSS_POINTS` flat.
 */
export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const maxAttempts = input.maxAttempts ?? MAX_ATTEMPTS;
  if (!input.won) {
    return { base: 0, attemptBonus: 0, timeBonus: 0, total: SCORING.LOSS_POINTS };
  }

  const attemptsUsed = clamp(Math.floor(input.attemptsUsed), 1, maxAttempts);
  const durationMs = Math.max(0, input.durationMs);

  const base = SCORING.BASE_WIN_POINTS;
  const attemptBonus = (maxAttempts - attemptsUsed) * SCORING.POINTS_PER_UNUSED_ATTEMPT;
  const timeFraction = Math.max(0, 1 - durationMs / SCORING.TIME_BONUS_WINDOW_MS);
  const timeBonus = Math.round(SCORING.MAX_TIME_BONUS * timeFraction);

  return { base, attemptBonus, timeBonus, total: base + attemptBonus + timeBonus };
}

export type MatchOutcome = 1 | 0.5 | 0;

export interface EloResult {
  deltaA: number;
  deltaB: number;
  newRatingA: number;
  newRatingB: number;
}

/** Standard Elo. `outcomeA` is 1 when A wins, 0 when A loses, 0.5 for a draw. */
export function calculateEloChange(
  ratingA: number,
  ratingB: number,
  outcomeA: MatchOutcome,
  kFactor: number = RATING.K_FACTOR,
): EloResult {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const deltaA = Math.round(kFactor * (outcomeA - expectedA));
  const deltaB = Math.round(kFactor * (1 - outcomeA - expectedB));
  return {
    deltaA,
    deltaB,
    newRatingA: Math.max(RATING.MIN, ratingA + deltaA),
    newRatingB: Math.max(RATING.MIN, ratingB + deltaB),
  };
}

export function winRatePercent(gamesWon: number, gamesPlayed: number): number {
  if (gamesPlayed <= 0) return 0;
  return Math.round((gamesWon / gamesPlayed) * 1000) / 10;
}

/** ISO-8601 week identifier such as `2026-W45`, used for weekly leaderboard keys (UTC). */
export function isoWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 UTC of the ISO week containing `date`. */
export function isoWeekStart(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dayNum - 1));
  return d;
}

/** Formats milliseconds as `m:ss` (or `m:ss.t` when `withTenths`). */
export function formatDuration(ms: number | null | undefined, withTenths = false): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const base = `${minutes}:${String(seconds).padStart(2, '0')}`;
  return withTenths ? `${base}.${Math.floor((ms % 1000) / 100)}` : base;
}

export function generateRoomCode(
  random: () => number = Math.random,
  alphabet: string = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  length: number = 6,
): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += alphabet[Math.min(alphabet.length - 1, Math.floor(random() * alphabet.length))];
  }
  return code;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
