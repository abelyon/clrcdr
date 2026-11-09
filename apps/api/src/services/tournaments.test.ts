import { describe, expect, it } from 'vitest';
import { buildBracketPlan, type BracketMatch, type PlayerRef } from '@mastermind/shared';
import { resolveBotMatch } from './tournaments';

const ref = (id: string, rating: number, isBot = false): PlayerRef => ({
  id,
  username: id,
  rating,
  seed: null,
  isBot,
});

const match = (p1: PlayerRef | null, p2: PlayerRef | null): BracketMatch => ({
  id: 'm',
  tournamentId: 't',
  round: 1,
  matchOrder: 0,
  player1: p1,
  player2: p2,
  winnerId: null,
  matchId: null,
  nextMatchId: null,
  nextMatchSlot: null,
  status: 'READY',
});

describe('resolveBotMatch', () => {
  it('lets the human advance against a bot', () => {
    expect(resolveBotMatch(match(ref('h', 900), ref('b', 1500, true)))).toBe('h');
    expect(resolveBotMatch(match(ref('b', 1500, true), ref('h', 900)))).toBe('h');
  });

  it('decides bot versus bot by rating (ties go to player 1)', () => {
    expect(resolveBotMatch(match(ref('b1', 900, true), ref('b2', 1100, true)))).toBe('b2');
    expect(resolveBotMatch(match(ref('b1', 1000, true), ref('b2', 1000, true)))).toBe('b1');
  });

  it('leaves human matches and incomplete matches alone', () => {
    expect(resolveBotMatch(match(ref('a', 1), ref('b', 2)))).toBeNull();
    expect(resolveBotMatch(match(ref('a', 1, true), null))).toBeNull();
  });
});

describe('bracket plan used by the tournament flow', () => {
  it('pads 5 players to 8 slots with byes and links matches', () => {
    const plan = buildBracketPlan(['a', 'b', 'c', 'd', 'e']);
    expect(plan.size).toBe(8);
    expect(plan.byeCount).toBe(3);
    expect(plan.totalRounds).toBe(3);
    const final = plan.matches.find((m) => m.round === 3);
    expect(final?.nextRound).toBeNull();
    const round1 = plan.matches.filter((m) => m.round === 1);
    expect(round1.every((m) => m.nextRound === 2)).toBe(true);
  });
});
