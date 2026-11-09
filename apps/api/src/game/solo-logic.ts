import {
  CODE_LENGTH,
  GAME_PALETTE,
  MAX_ATTEMPTS,
  calculateScore,
  evaluateGuess,
  isWinningFeedback,
  type GuessRecord,
  type GuessResult,
  type PegColor,
  type ScoreBreakdown,
} from '@mastermind/shared';

export interface SoloGame {
  id: string;
  secret: PegColor[];
  guesses: GuessRecord[];
  startedAt: number;
  /** Registered user id the game is bound to, or null for anonymous / guest games. */
  ownerId: string | null;
  status: 'ACTIVE' | 'ENDED';
  won: boolean;
  endedAt?: number;
  durationMs?: number;
  score?: ScoreBreakdown;
  submitted: boolean;
}

export class SoloGameError extends Error {
  constructor(
    readonly code: 'GAME_OVER' | 'INVALID_GUESS',
    message: string,
  ) {
    super(message);
  }
}

export function createSoloGame(id: string, secret: PegColor[], ownerId: string | null, now: number): SoloGame {
  return {
    id,
    secret,
    guesses: [],
    startedAt: now,
    ownerId,
    status: 'ACTIVE',
    won: false,
    submitted: false,
  };
}

/** Evaluates a guess server side and updates the game. The secret is only included once the game is over. */
export function applySoloGuess(
  game: SoloGame,
  guess: readonly PegColor[],
  now: number,
): GuessResult {
  if (game.status === 'ENDED') throw new SoloGameError('GAME_OVER', 'Game is already finished');
  if (guess.length !== CODE_LENGTH || guess.some((c) => !(GAME_PALETTE as readonly string[]).includes(c))) {
    throw new SoloGameError('INVALID_GUESS', 'Guess must be 4 colors from the game palette');
  }

  const feedback = evaluateGuess(game.secret, guess);
  const row = game.guesses.length;
  game.guesses.push({ guess: [...guess], exact: feedback.exact, partial: feedback.partial, at: now });

  const isWin = isWinningFeedback(feedback);
  const isGameOver = isWin || game.guesses.length >= MAX_ATTEMPTS;
  const result: GuessResult = {
    exact: feedback.exact,
    partial: feedback.partial,
    row,
    isWin,
    isGameOver,
  };

  if (isGameOver) {
    const durationMs = Math.max(0, now - game.startedAt);
    const score = calculateScore({ won: isWin, attemptsUsed: game.guesses.length, durationMs });
    game.status = 'ENDED';
    game.won = isWin;
    game.endedAt = now;
    game.durationMs = durationMs;
    game.score = score;
    result.attemptsUsed = game.guesses.length;
    result.durationMs = durationMs;
    result.score = score;
    result.secretCode = [...game.secret];
  }
  return result;
}
