import { describe, expect, it } from 'vitest';
import type { MatchEndedPayload } from '@mastermind/shared';
import { countdownSeconds, initialMatchState, isWaitingOnOpponent, matchReducer, outcomeFor, type MatchStart } from './match';

const started: MatchStart = {
  matchId: 'm1',
  mode: '1V1',
  codeLength: 4,
  maxAttempts: 10,
  palette: ['R', 'G', 'B', 'Y', 'P', 'O'],
  startedAt: 1000,
  opponent: { id: 'u2', username: 'Rival', rating: 1000, isGuest: false },
};

function fill(state = matchReducer(initialMatchState(), { type: 'started', payload: started })) {
  let s = state;
  for (const color of ['R', 'G', 'B', 'Y'] as const) s = matchReducer(s, { type: 'place', color });
  return s;
}

const ended: MatchEndedPayload = {
  matchId: 'm1',
  winnerId: 'u1',
  reason: 'solved',
  secretCode: ['R', 'G', 'B', 'Y'],
  yourScore: { base: 1000, attemptBonus: 900, timeBonus: 400, total: 2300 },
  opponentScore: { base: 0, attemptBonus: 0, timeBonus: 0, total: 0 },
  durationMs: 30000,
  ratingChange: 12,
  newRating: 1012,
};

describe('matchReducer', () => {
  it('ignores input before a match starts', () => {
    const s = matchReducer(initialMatchState(), { type: 'place', color: 'R' });
    expect(s.board.current).toEqual([null, null, null, null]);
  });

  it('commits a guess exactly once even if the ack and the event both arrive', () => {
    let s = fill();
    s = matchReducer(s, { type: 'submitting' });
    expect(s.pending).toEqual(['R', 'G', 'B', 'Y']);
    const result = { exact: 2, partial: 1, row: 0, isWin: false, isGameOver: false };
    s = matchReducer(s, { type: 'guessResult', result });
    s = matchReducer(s, { type: 'guessResult', result });
    expect(s.board.rows).toHaveLength(1);
    expect(s.board.rows[0]).toEqual({ guess: ['R', 'G', 'B', 'Y'], exact: 2, partial: 1 });
    expect(s.pending).toBeNull();
  });

  it('blocks edits while a guess is pending', () => {
    let s = fill();
    s = matchReducer(s, { type: 'submitting' });
    s = matchReducer(s, { type: 'remove' });
    expect(s.board.current).toEqual(['R', 'G', 'B', 'Y']);
    s = matchReducer(s, { type: 'guessFailed' });
    s = matchReducer(s, { type: 'remove' });
    expect(s.board.current[3]).toBeNull();
  });

  it('records opponent progress without colors and fills gaps', () => {
    let s = matchReducer(initialMatchState(), { type: 'started', payload: started });
    s = matchReducer(s, {
      type: 'opponentProgress',
      payload: { matchId: 'm1', row: 1, exact: 1, partial: 2, attemptsUsed: 2, elapsedMs: 5000 },
    });
    expect(s.opponentRows).toHaveLength(2);
    expect(s.opponentRows[0]).toEqual({ exact: 0, partial: 0, atMs: null });
    expect(s.opponentRows[1]).toEqual({ exact: 1, partial: 2, atMs: 5000 });
  });

  it('ignores progress for another match', () => {
    let s = matchReducer(initialMatchState(), { type: 'started', payload: started });
    s = matchReducer(s, {
      type: 'opponentProgress',
      payload: { matchId: 'other', row: 0, exact: 1, partial: 0, attemptsUsed: 1, elapsedMs: 1 },
    });
    expect(s.opponentRows).toHaveLength(0);
  });

  it('restores state from a resume payload', () => {
    const s = matchReducer(initialMatchState(), {
      type: 'started',
      payload: {
        ...started,
        resume: {
          yourGuesses: [{ guess: ['R', 'R', 'G', 'G'], exact: 1, partial: 1 }],
          opponentRows: [{ row: 0, exact: 0, partial: 2 }],
        },
      },
    });
    expect(s.board.rows).toHaveLength(1);
    expect(s.opponentRows[0]).toMatchObject({ exact: 0, partial: 2 });
  });

  it('tracks opponent disconnect grace and reconnect', () => {
    let s = matchReducer(initialMatchState(), { type: 'started', payload: started });
    s = matchReducer(s, { type: 'opponentStatus', status: 'disconnected', graceMs: 30000, now: 1000 });
    expect(s.opponentConnected).toBe(false);
    expect(s.graceEndsAt).toBe(31000);
    s = matchReducer(s, { type: 'opponentStatus', status: 'connected' });
    expect(s.opponentConnected).toBe(true);
    expect(s.graceEndsAt).toBeNull();
  });

  it('stores the secret only when the match ends and freezes input', () => {
    let s = fill();
    expect(s.secret).toBeNull();
    s = matchReducer(s, { type: 'ended', payload: ended });
    expect(s.secret).toEqual(['R', 'G', 'B', 'Y']);
    s = matchReducer(s, { type: 'clear' });
    expect(s.board.current).toEqual(['R', 'G', 'B', 'Y']);
  });

  it('detects waiting on the opponent after exhausting attempts', () => {
    let s = matchReducer(initialMatchState(), { type: 'started', payload: { ...started, maxAttempts: 1 } });
    s = fill(s);
    s = matchReducer(s, { type: 'submitting' });
    s = matchReducer(s, { type: 'guessResult', result: { exact: 0, partial: 0, row: 0, isWin: false, isGameOver: false } });
    expect(isWaitingOnOpponent(s)).toBe(true);
  });
});

describe('helpers', () => {
  it('derives outcomes', () => {
    expect(outcomeFor(ended, 'u1')).toBe('win');
    expect(outcomeFor(ended, 'u2')).toBe('loss');
    expect(outcomeFor({ ...ended, winnerId: null }, 'u1')).toBe('draw');
  });

  it('counts down in whole seconds', () => {
    expect(countdownSeconds(5000, 2100)).toBe(3);
    expect(countdownSeconds(5000, 4999)).toBe(1);
    expect(countdownSeconds(5000, 6000)).toBe(0);
  });
});
