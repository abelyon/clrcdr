import {
  CODE_LENGTH,
  GAME_PALETTE,
  MAX_ATTEMPTS,
  calculateScore,
  evaluateGuess,
  isWinningFeedback,
  type GuessRecord,
  type MatchEndReason,
  type MatchMode,
  type PegColor,
  type ScoreBreakdown,
} from '@mastermind/shared';

export interface LivePlayer {
  userId: string;
  username: string;
  rating: number;
  isGuest: boolean;
  guesses: GuessRecord[];
  solvedAt: number | null;
}

export interface LiveMatch {
  id: string;
  mode: Extract<MatchMode, '1V1' | 'TOURNAMENT'>;
  secret: PegColor[];
  createdAt: number;
  /** Guessing opens at this epoch ms (after the countdown). */
  startedAt: number;
  players: [LivePlayer, LivePlayer];
  status: 'ACTIVE' | 'ENDED';
  roomCode?: string;
  tournamentId?: string;
  tournamentMatchId?: string;
  endedAt?: number;
}

export type MatchRejection = 'NOT_YOUR_MATCH' | 'MATCH_OVER' | 'MATCH_NOT_READY' | 'INVALID_PAYLOAD';

export class MatchRuleError extends Error {
  constructor(
    readonly code: MatchRejection,
    message: string,
  ) {
    super(message);
  }
}

export function playerOf(match: LiveMatch, userId: string): LivePlayer | null {
  return match.players.find((p) => p.userId === userId) ?? null;
}

export function opponentOf(match: LiveMatch, userId: string): LivePlayer {
  return (match.players[0].userId === userId ? match.players[1] : match.players[0]) as LivePlayer;
}

export function isPlayerDone(player: LivePlayer): boolean {
  return player.solvedAt !== null || player.guesses.length >= MAX_ATTEMPTS;
}

export interface AppliedGuess {
  row: number;
  exact: number;
  partial: number;
  solved: boolean;
}

/** Validates and applies a guess for one player; throws MatchRuleError when the move is not allowed. */
export function applyMatchGuess(
  match: LiveMatch,
  userId: string,
  guess: readonly PegColor[],
  now: number,
): AppliedGuess {
  if (match.status === 'ENDED') throw new MatchRuleError('MATCH_OVER', 'Match is over');
  const player = playerOf(match, userId);
  if (!player) throw new MatchRuleError('NOT_YOUR_MATCH', 'You are not part of this match');
  if (now < match.startedAt) throw new MatchRuleError('MATCH_NOT_READY', 'Match has not started yet');
  if (isPlayerDone(player)) throw new MatchRuleError('MATCH_OVER', 'No attempts left');
  if (guess.length !== CODE_LENGTH || guess.some((c) => !(GAME_PALETTE as readonly string[]).includes(c))) {
    throw new MatchRuleError('INVALID_PAYLOAD', 'Guess must be 4 colors from the game palette');
  }

  const feedback = evaluateGuess(match.secret, guess);
  const row = player.guesses.length;
  player.guesses.push({ guess: [...guess], exact: feedback.exact, partial: feedback.partial, at: now });
  const solved = isWinningFeedback(feedback);
  if (solved) player.solvedAt = now;
  return { row, exact: feedback.exact, partial: feedback.partial, solved };
}

/** Best feedback a player reached: exact first, then partial. */
export function bestProgress(player: LivePlayer): { exact: number; partial: number } {
  let exact = 0;
  let partial = 0;
  for (const g of player.guesses) {
    if (g.exact > exact || (g.exact === exact && g.partial > partial)) {
      exact = g.exact;
      partial = g.partial;
    }
  }
  return { exact, partial };
}

function lastGuessAt(player: LivePlayer): number {
  const last = player.guesses[player.guesses.length - 1];
  return last?.at ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Decides the winner when nobody (or both players) cracked the code: best guess wins, then the earlier
 * last guess. Returns null for a draw. A solver always beats a non-solver.
 */
export function decideByProgress(match: LiveMatch): string | null {
  const [a, b] = match.players;
  if (a.solvedAt !== null && b.solvedAt === null) return a.userId;
  if (b.solvedAt !== null && a.solvedAt === null) return b.userId;
  if (a.solvedAt !== null && b.solvedAt !== null) {
    return a.solvedAt === b.solvedAt ? null : a.solvedAt < b.solvedAt ? a.userId : b.userId;
  }
  const pa = bestProgress(a);
  const pb = bestProgress(b);
  if (pa.exact !== pb.exact) return pa.exact > pb.exact ? a.userId : b.userId;
  if (pa.partial !== pb.partial) return pa.partial > pb.partial ? a.userId : b.userId;
  const ta = lastGuessAt(a);
  const tb = lastGuessAt(b);
  if (ta !== tb && a.guesses.length > 0 && b.guesses.length > 0) return ta < tb ? a.userId : b.userId;
  return null;
}

/** Tournament matches cannot end in a draw: the first-listed player (higher seed) wins a remaining tie. */
export function decideWinner(match: LiveMatch, requireWinner: boolean): string | null {
  const winner = decideByProgress(match);
  if (winner !== null || !requireWinner) return winner;
  return match.players[0].userId;
}

export interface PlayerOutcome {
  score: ScoreBreakdown;
  durationMs: number;
}

export function scorePlayer(match: LiveMatch, player: LivePlayer, now: number): PlayerOutcome {
  const solved = player.solvedAt !== null;
  const durationMs = Math.max(0, (player.solvedAt ?? match.endedAt ?? now) - match.startedAt);
  const score = calculateScore({ won: solved, attemptsUsed: Math.max(1, player.guesses.length), durationMs });
  return { score, durationMs };
}

export interface MatchSettlement {
  winnerId: string | null;
  reason: MatchEndReason;
  scores: Record<string, PlayerOutcome>;
  durationMs: number;
}

/** Final scores and duration for a match that ended now with the given winner/reason. */
export function settleMatch(
  match: LiveMatch,
  winnerId: string | null,
  reason: MatchEndReason,
  now: number,
): MatchSettlement {
  const scores: Record<string, PlayerOutcome> = {};
  for (const p of match.players) scores[p.userId] = scorePlayer(match, p, now);
  return {
    winnerId,
    reason,
    scores,
    durationMs: Math.max(0, now - match.startedAt),
  };
}
