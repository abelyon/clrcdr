import type { TournamentMatchStatus } from './constants';

export interface BracketSlotPlan {
  /** 1-based round number; the last round is the final. */
  round: number;
  /** 0-based position of the match inside its round. */
  matchOrder: number;
  player1Id: string | null;
  player2Id: string | null;
  /** 1-based seed numbers occupying the slots (null for BYE / TBD). */
  seed1: number | null;
  seed2: number | null;
  winnerId: string | null;
  status: TournamentMatchStatus;
  /** Round / order of the match the winner advances into (null for the final). */
  nextRound: number | null;
  nextMatchOrder: number | null;
  nextMatchSlot: 1 | 2 | null;
}

export interface BracketPlan {
  size: number;
  totalRounds: number;
  byeCount: number;
  matches: BracketSlotPlan[];
}

export function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Slot order of seeds for a standard bracket: seed 1 faces the lowest seed, seeds 1 and 2 meet only in the final. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const total = order.length * 2;
    order = order.flatMap((seed) => [seed, total + 1 - seed]);
  }
  return order;
}

/**
 * Builds a single-elimination bracket for any N >= 2 players. `playerIds` must be ordered by seed
 * (index 0 = seed 1). The bracket is padded to the next power of two; missing opponents become BYEs,
 * which are resolved immediately and the byed player is advanced into the next round.
 */
export function buildBracketPlan(playerIds: readonly string[]): BracketPlan {
  const n = playerIds.length;
  if (n < 2) {
    throw new RangeError('A bracket needs at least 2 players');
  }
  const size = nextPowerOfTwo(n);
  const totalRounds = Math.log2(size);
  const order = seedOrder(size);

  const rounds: BracketSlotPlan[][] = [];
  for (let round = 1; round <= totalRounds; round++) {
    const count = size / Math.pow(2, round);
    const row: BracketSlotPlan[] = [];
    for (let matchOrder = 0; matchOrder < count; matchOrder++) {
      const isFinal = round === totalRounds;
      row.push({
        round,
        matchOrder,
        player1Id: null,
        player2Id: null,
        seed1: null,
        seed2: null,
        winnerId: null,
        status: 'PENDING',
        nextRound: isFinal ? null : round + 1,
        nextMatchOrder: isFinal ? null : Math.floor(matchOrder / 2),
        nextMatchSlot: isFinal ? null : ((matchOrder % 2) + 1) as 1 | 2,
      });
    }
    rounds.push(row);
  }

  let byeCount = 0;
  const first = rounds[0] as BracketSlotPlan[];
  for (const match of first) {
    const seedA = order[match.matchOrder * 2] as number;
    const seedB = order[match.matchOrder * 2 + 1] as number;
    match.seed1 = seedA <= n ? seedA : null;
    match.seed2 = seedB <= n ? seedB : null;
    match.player1Id = seedA <= n ? (playerIds[seedA - 1] as string) : null;
    match.player2Id = seedB <= n ? (playerIds[seedB - 1] as string) : null;

    if (match.player1Id && match.player2Id) {
      match.status = 'READY';
    } else {
      byeCount++;
      match.status = 'BYE';
      match.winnerId = match.player1Id ?? match.player2Id;
    }
  }

  for (let r = 0; r < rounds.length; r++) {
    const row = rounds[r] as BracketSlotPlan[];
    for (const match of row) {
      if (match.winnerId && match.nextRound !== null && match.nextMatchOrder !== null) {
        const next = (rounds[match.nextRound - 1] as BracketSlotPlan[])[
          match.nextMatchOrder
        ] as BracketSlotPlan;
        const seed = seedOf(match, match.winnerId);
        if (match.nextMatchSlot === 1) {
          next.player1Id = match.winnerId;
          next.seed1 = seed;
        } else {
          next.player2Id = match.winnerId;
          next.seed2 = seed;
        }
        if (next.player1Id && next.player2Id) next.status = 'READY';
      }
    }
  }

  return { size, totalRounds, byeCount, matches: rounds.flat() };
}

function seedOf(match: BracketSlotPlan, playerId: string): number | null {
  if (match.player1Id === playerId) return match.seed1;
  if (match.player2Id === playerId) return match.seed2;
  return null;
}

export type RoundLabelKind = 'final' | 'semifinal' | 'quarterfinal' | 'round';

export interface RoundLabel {
  kind: RoundLabelKind;
  round: number;
}

export function roundLabel(round: number, totalRounds: number): RoundLabel {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return { kind: 'final', round };
  if (fromEnd === 1) return { kind: 'semifinal', round };
  if (fromEnd === 2) return { kind: 'quarterfinal', round };
  return { kind: 'round', round };
}

export function bracketMatchCount(playerCount: number): number {
  return nextPowerOfTwo(Math.max(2, playerCount)) - 1;
}
