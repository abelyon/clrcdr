import { describe, expect, it } from 'vitest';
import { createTranslator, type BracketMatch } from '@mastermind/shared';
import { demoBracket, findPlayableMatch, groupByRound, isPlayableBy, opponentOf, roundTitle } from './bracket';

describe('bracket helpers', () => {
  const { matches, totalRounds } = demoBracket(['A', 'B', 'C', 'D', 'E', 'F']);

  it('pads 6 players to an 8 slot bracket with 2 byes', () => {
    expect(totalRounds).toBe(3);
    expect(matches).toHaveLength(7);
    expect(matches.filter((m) => m.status === 'BYE')).toHaveLength(2);
  });

  it('groups matches by round in order', () => {
    const rounds = groupByRound([...matches].reverse());
    expect(rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(rounds[0]?.map((m) => m.matchOrder)).toEqual([0, 1, 2, 3]);
  });

  it('labels the last rounds', () => {
    const t = createTranslator('en');
    expect(roundTitle(3, 3, t)).toBe('Final');
    expect(roundTitle(2, 3, t)).toBe('Semifinal');
    expect(roundTitle(1, 3, t)).toBe('Quarterfinal');
    expect(roundTitle(1, 4, t)).toBe('Round 1');
  });

  it('finds the playable match for a participant only', () => {
    const ready = matches.find((m) => m.status === 'READY') as BracketMatch;
    const userId = ready.player1?.id as string;
    expect(isPlayableBy(ready, userId)).toBe(true);
    expect(isPlayableBy(ready, 'nobody')).toBe(false);
    expect(findPlayableMatch(matches, userId)?.id).toBe(ready.id);
    expect(opponentOf(ready, userId)?.id).toBe(ready.player2?.id);
  });

  it('does not allow playing finished matches', () => {
    const done: BracketMatch = { ...(matches.find((m) => m.status === 'READY') as BracketMatch), winnerId: 'p1', status: 'COMPLETED' };
    expect(isPlayableBy(done, done.player1?.id)).toBe(false);
  });
});
