import { describe, expect, it } from 'vitest';
import {
  codeGuessSchema,
  createTournamentSchema,
  guessResultSchema,
  leaderboardQuerySchema,
  registerSchema,
  roomJoinPayloadSchema,
} from './schemas';

describe('schemas', () => {
  it('accepts valid guesses only', () => {
    expect(codeGuessSchema.safeParse(['R', 'G', 'B', 'Y']).success).toBe(true);
    expect(codeGuessSchema.safeParse(['R', 'G', 'B']).success).toBe(false);
    expect(codeGuessSchema.safeParse(['R', 'G', 'B', 'Q']).success).toBe(false);
  });

  it('normalises room codes', () => {
    expect(roomJoinPayloadSchema.parse({ code: ' ab3d9k ' }).code).toBe('AB3D9K');
    expect(roomJoinPayloadSchema.safeParse({ code: 'abc' }).success).toBe(false);
  });

  it('validates registration', () => {
    expect(
      registerSchema.safeParse({ username: 'neo', email: 'NEO@Matrix.io', password: 'secret1' }),
    ).toMatchObject({ success: true, data: { email: 'neo@matrix.io' } });
    expect(registerSchema.safeParse({ username: 'a b', email: 'x', password: '1' }).success).toBe(
      false,
    );
  });

  it('defaults leaderboard query', () => {
    expect(leaderboardQuerySchema.parse({})).toEqual({ period: 'alltime', limit: 50 });
    expect(leaderboardQuerySchema.parse({ period: 'weekly', limit: '10' })).toEqual({
      period: 'weekly',
      limit: 10,
    });
  });

  it('accepts any player count for tournaments in range', () => {
    expect(createTournamentSchema.safeParse({ name: 'Cup', maxPlayers: 7 }).success).toBe(true);
    expect(createTournamentSchema.safeParse({ name: 'Cup', maxPlayers: 1 }).success).toBe(false);
  });

  it('allows an optional secret code in guess results', () => {
    expect(
      guessResultSchema.safeParse({ exact: 1, partial: 0, row: 0, isWin: false, isGameOver: false })
        .success,
    ).toBe(true);
  });
});
