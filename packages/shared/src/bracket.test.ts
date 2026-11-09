import { describe, expect, it } from 'vitest';
import { buildBracketPlan, nextPowerOfTwo, roundLabel, seedOrder } from './bracket';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('seedOrder', () => {
  it('produces standard seeding', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('nextPowerOfTwo', () => {
  it('pads to the next power of two', () => {
    expect([2, 3, 4, 5, 8, 9, 100].map(nextPowerOfTwo)).toEqual([2, 4, 4, 8, 8, 16, 128]);
  });
});

describe('buildBracketPlan', () => {
  it('rejects fewer than two players', () => {
    expect(() => buildBracketPlan(['a'])).toThrow(RangeError);
  });

  it('builds a full 4 player bracket without byes', () => {
    const plan = buildBracketPlan(ids(4));
    expect(plan.size).toBe(4);
    expect(plan.totalRounds).toBe(2);
    expect(plan.byeCount).toBe(0);
    expect(plan.matches).toHaveLength(3);
    const first = plan.matches.filter((m) => m.round === 1);
    expect(first.map((m) => [m.player1Id, m.player2Id])).toEqual([
      ['p1', 'p4'],
      ['p2', 'p3'],
    ]);
    expect(first.every((m) => m.status === 'READY')).toBe(true);
    const final = plan.matches.find((m) => m.round === 2)!;
    expect(final.status).toBe('PENDING');
    expect(final.nextRound).toBeNull();
  });

  it('pads 5 players to 8 and advances the byed top seeds', () => {
    const plan = buildBracketPlan(ids(5));
    expect(plan.size).toBe(8);
    expect(plan.byeCount).toBe(3);
    expect(plan.matches).toHaveLength(7);

    const round1 = plan.matches.filter((m) => m.round === 1);
    const byes = round1.filter((m) => m.status === 'BYE');
    expect(byes.map((m) => m.winnerId).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(round1.filter((m) => m.status === 'READY')).toHaveLength(1);

    const round2 = plan.matches.filter((m) => m.round === 2);
    expect(round2[0]).toMatchObject({ player1Id: 'p1', player2Id: null, status: 'PENDING' });
    expect(round2[1]).toMatchObject({ player1Id: 'p2', player2Id: 'p3', status: 'READY' });
  });

  it('links every non-final match to a valid next slot exactly once', () => {
    for (const n of [2, 3, 5, 6, 7, 9, 13, 16, 17, 33]) {
      const plan = buildBracketPlan(ids(n));
      const targets = new Set<string>();
      for (const m of plan.matches) {
        if (m.round === plan.totalRounds) {
          expect(m.nextRound).toBeNull();
          continue;
        }
        const key = `${m.nextRound}:${m.nextMatchOrder}:${m.nextMatchSlot}`;
        expect(targets.has(key)).toBe(false);
        targets.add(key);
      }
      expect(plan.matches).toHaveLength(plan.size - 1);
    }
  });

  it('never creates a double BYE and every player appears exactly once in round one', () => {
    for (const n of [3, 5, 9, 17, 33, 65]) {
      const plan = buildBracketPlan(ids(n));
      const round1 = plan.matches.filter((m) => m.round === 1);
      for (const m of round1) {
        expect(m.player1Id !== null || m.player2Id !== null).toBe(true);
      }
      const seen = round1.flatMap((m) => [m.player1Id, m.player2Id]).filter(Boolean);
      expect(new Set(seen).size).toBe(n);
      expect(plan.byeCount).toBe(plan.size - n);
    }
  });

  it('handles two players as a single final', () => {
    const plan = buildBracketPlan(ids(2));
    expect(plan.matches).toHaveLength(1);
    expect(plan.matches[0]).toMatchObject({ round: 1, status: 'READY', nextRound: null });
  });
});

describe('roundLabel', () => {
  it('labels late rounds', () => {
    expect(roundLabel(3, 3).kind).toBe('final');
    expect(roundLabel(2, 3).kind).toBe('semifinal');
    expect(roundLabel(1, 3).kind).toBe('quarterfinal');
    expect(roundLabel(1, 4).kind).toBe('round');
  });
});
