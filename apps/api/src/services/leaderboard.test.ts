import { describe, expect, it } from 'vitest';
import type { User } from '@mastermind/db';
import { DbAccess } from '../db';
import { silentLogger } from '../lib/logger';
import { MemoryStore } from '../store';
import { LeaderboardService } from './leaderboard';

const user = (id: string, over: Partial<User> = {}): User =>
  ({
    id,
    username: `user-${id}`,
    email: `${id}@x.gg`,
    passwordHash: 'x',
    role: 'PLAYER',
    rating: 1000,
    gamesPlayed: 1,
    gamesWon: 1,
    totalScore: 1500,
    bestTimeMs: 30_000,
    totalWinAttempts: 4,
    isBot: false,
    createdAt: new Date(),
    ...over,
  }) as User;

describe('LeaderboardService (in-memory sorted sets)', () => {
  const make = () => new LeaderboardService(new MemoryStore(), new DbAccess(silentLogger), silentLogger);

  it('ranks players by score for all-time and weekly', async () => {
    const lb = make();
    await lb.record(user('a', { totalScore: 1500 }), { score: 1500, won: true, durationMs: 30_000, attempts: 4 });
    await lb.record(user('b', { totalScore: 2400, gamesPlayed: 2, gamesWon: 2, totalWinAttempts: 7 }), {
      score: 1200,
      won: true,
      durationMs: 20_000,
      attempts: 3,
    });
    const all = await lb.get('alltime', 10);
    expect(all.map((e) => [e.rank, e.userId, e.score])).toEqual([
      [1, 'b', 2400],
      [2, 'a', 1500],
    ]);
    expect(all[0]).toMatchObject({ winRate: 100, bestTimeMs: 30_000, avgGuesses: 3.5 });

    const weekly = await lb.get('weekly', 10);
    expect(weekly.map((e) => e.userId)).toEqual(['a', 'b']);
    expect(weekly[1]).toMatchObject({ score: 1200, gamesPlayed: 1, bestTimeMs: 20_000, avgGuesses: 3 });
    expect(await lb.rank('a')).toBe(2);
  });

  it('accumulates weekly stats and keeps the best time of solved games only', async () => {
    const lb = make();
    const u = user('a', { totalScore: 1000 });
    await lb.record(u, { score: 1000, won: true, durationMs: 50_000, attempts: 5 });
    await lb.record({ ...u, totalScore: 1000, gamesPlayed: 2 }, {
      score: 0,
      won: true,
      solved: false,
      durationMs: 1,
      attempts: 10,
    });
    const [entry] = await lb.get('weekly', 5);
    expect(entry).toMatchObject({ gamesPlayed: 2, gamesWon: 2, bestTimeMs: 50_000 });
  });

  it('returns an empty board without redis data or a database', async () => {
    expect(await make().get('alltime', 10)).toEqual([]);
  });
});
