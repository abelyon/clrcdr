import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, type PegColor } from '@mastermind/shared';
import { SoloGameError, applySoloGuess, createSoloGame } from './solo-logic';

const SECRET: PegColor[] = ['R', 'G', 'B', 'Y'];
const WRONG: PegColor[] = ['P', 'P', 'O', 'O'];

describe('solo game logic', () => {
  it('evaluates guesses and hides the secret while active', () => {
    const game = createSoloGame('g1', SECRET, null, 1000);
    const result = applySoloGuess(game, ['R', 'B', 'G', 'P'], 2000);
    expect(result).toEqual({ exact: 1, partial: 2, row: 0, isWin: false, isGameOver: false });
    expect(result).not.toHaveProperty('secretCode');
    expect(JSON.stringify(result)).not.toContain('"Y"');
  });

  it('reveals the secret and scores on a win', () => {
    const game = createSoloGame('g1', SECRET, 'u1', 0);
    applySoloGuess(game, WRONG, 1000);
    const result = applySoloGuess(game, SECRET, 31_000);
    expect(result.isWin).toBe(true);
    expect(result.isGameOver).toBe(true);
    expect(result.secretCode).toEqual(SECRET);
    expect(result.attemptsUsed).toBe(2);
    expect(result.durationMs).toBe(31_000);
    expect(result.score?.total).toBeGreaterThan(1000);
    expect(game.status).toBe('ENDED');
    expect(game.won).toBe(true);
  });

  it('ends the game after the last attempt and reveals the secret', () => {
    const game = createSoloGame('g1', SECRET, null, 0);
    let last;
    for (let i = 0; i < MAX_ATTEMPTS; i++) last = applySoloGuess(game, WRONG, i);
    expect(last?.isGameOver).toBe(true);
    expect(last?.isWin).toBe(false);
    expect(last?.secretCode).toEqual(SECRET);
    expect(last?.score?.total).toBe(0);
    expect(() => applySoloGuess(game, WRONG, 99)).toThrow(SoloGameError);
  });

  it('never leaks the secret before the game is over', () => {
    const game = createSoloGame('g1', SECRET, null, 0);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      const r = applySoloGuess(game, WRONG, i);
      expect(r.secretCode).toBeUndefined();
      expect(r.score).toBeUndefined();
    }
  });

  it('rejects invalid guesses', () => {
    const game = createSoloGame('g1', SECRET, null, 0);
    expect(() => applySoloGuess(game, ['R', 'G', 'B'] as PegColor[], 1)).toThrow(SoloGameError);
    expect(() => applySoloGuess(game, ['R', 'G', 'B', 'C'] as PegColor[], 1)).toThrow(SoloGameError);
    expect(game.guesses).toHaveLength(0);
  });
});
