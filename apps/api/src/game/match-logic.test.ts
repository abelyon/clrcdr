import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, type PegColor } from '@mastermind/shared';
import {
  MatchRuleError,
  applyMatchGuess,
  bestProgress,
  decideByProgress,
  decideWinner,
  isPlayerDone,
  settleMatch,
  type LiveMatch,
  type LivePlayer,
} from './match-logic';

const SECRET: PegColor[] = ['R', 'G', 'B', 'Y'];
const WRONG: PegColor[] = ['P', 'P', 'O', 'O'];

const mkPlayer = (id: string): LivePlayer => ({
  userId: id,
  username: id,
  rating: 1000,
  isGuest: true,
  guesses: [],
  solvedAt: null,
});

const mkMatch = (startedAt = 0): LiveMatch => ({
  id: 'm1',
  mode: '1V1',
  secret: SECRET,
  createdAt: 0,
  startedAt,
  players: [mkPlayer('a'), mkPlayer('b')],
  status: 'ACTIVE',
});

describe('applyMatchGuess', () => {
  it('records feedback and flags a solve', () => {
    const m = mkMatch();
    expect(applyMatchGuess(m, 'a', ['R', 'B', 'G', 'P'], 10)).toMatchObject({ exact: 1, partial: 2, row: 0, solved: false });
    const r = applyMatchGuess(m, 'a', SECRET, 20);
    expect(r.solved).toBe(true);
    expect(m.players[0].solvedAt).toBe(20);
  });

  it('rejects outsiders, early guesses and finished players', () => {
    const m = mkMatch(1000);
    expect(() => applyMatchGuess(m, 'zzz', WRONG, 2000)).toThrow(MatchRuleError);
    expect(() => applyMatchGuess(m, 'a', WRONG, 500)).toThrowError(/not started/);
    for (let i = 0; i < MAX_ATTEMPTS; i++) applyMatchGuess(m, 'a', WRONG, 2000 + i);
    expect(isPlayerDone(m.players[0])).toBe(true);
    expect(() => applyMatchGuess(m, 'a', WRONG, 3000)).toThrowError(/No attempts/);
    m.status = 'ENDED';
    expect(() => applyMatchGuess(m, 'b', WRONG, 3000)).toThrowError(/over/);
  });
});

describe('winner decision', () => {
  it('prefers the better best guess, then the earlier last guess', () => {
    const m = mkMatch();
    applyMatchGuess(m, 'a', ['R', 'G', 'P', 'P'], 10);
    applyMatchGuess(m, 'b', ['R', 'P', 'P', 'P'], 12);
    expect(bestProgress(m.players[0])).toEqual({ exact: 2, partial: 0 });
    expect(decideByProgress(m)).toBe('a');

    const tie = mkMatch();
    applyMatchGuess(tie, 'a', ['R', 'P', 'P', 'P'], 30);
    applyMatchGuess(tie, 'b', ['R', 'P', 'P', 'P'], 20);
    expect(decideByProgress(tie)).toBe('b');
  });

  it('draws when nothing separates the players, but tournaments need a winner', () => {
    const m = mkMatch();
    expect(decideByProgress(m)).toBeNull();
    expect(decideWinner(m, false)).toBeNull();
    expect(decideWinner(m, true)).toBe('a');
  });

  it('a solver always beats a non-solver', () => {
    const m = mkMatch();
    applyMatchGuess(m, 'b', SECRET, 50);
    applyMatchGuess(m, 'a', ['R', 'G', 'B', 'P'], 10);
    expect(decideByProgress(m)).toBe('b');
  });
});

describe('settleMatch', () => {
  it('scores the solver and zeroes the other player', () => {
    const m = mkMatch(0);
    applyMatchGuess(m, 'a', SECRET, 40_000);
    m.endedAt = 40_000;
    const s = settleMatch(m, 'a', 'solved', 40_000);
    expect(s.scores.a?.score.total).toBeGreaterThan(1000);
    expect(s.scores.a?.durationMs).toBe(40_000);
    expect(s.scores.b?.score.total).toBe(0);
    expect(s.durationMs).toBe(40_000);
  });
});
