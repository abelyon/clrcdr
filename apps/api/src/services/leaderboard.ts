import { getLeaderboard as queryLeaderboard, type User } from '@mastermind/db';
import {
  REDIS_KEYS,
  isoWeekId,
  winRatePercent,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '@mastermind/shared';
import type { DbAccess } from '../db';
import type { Logger } from '../lib/logger';
import type { Store } from '../store';

const WEEKLY_TTL_SEC = 15 * 24 * 3600;
const statsKey = (period: LeaderboardPeriod, weekId: string) =>
  period === 'weekly' ? `lb:stats:weekly:${weekId}` : 'lb:stats:alltime';

interface StoredStats {
  username: string;
  rating: number;
  score: number;
  gamesPlayed: number;
  gamesWon: number;
  bestTimeMs: number | null;
  totalWinAttempts: number;
}

export interface RecordedResult {
  /** Points earned in this game (added to the weekly score). */
  score: number;
  won: boolean;
  /** True when the player actually cracked the code (only then does the time count as a best time). */
  solved?: boolean;
  durationMs: number;
  attempts: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toEntry(rank: number, userId: string, s: StoredStats): LeaderboardEntry {
  return {
    rank,
    userId,
    username: s.username,
    rating: s.rating,
    score: s.score,
    gamesPlayed: s.gamesPlayed,
    gamesWon: s.gamesWon,
    winRate: winRatePercent(s.gamesWon, s.gamesPlayed),
    bestTimeMs: s.bestTimeMs,
    avgGuesses: s.gamesWon > 0 ? round1(s.totalWinAttempts / s.gamesWon) : null,
  };
}

function parseStats(raw: string | null): StoredStats | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredStats;
  } catch {
    return null;
  }
}

/** Leaderboards backed by Redis sorted sets (ZADD / ZREVRANGE) with Postgres as the source of truth and fallback. */
export class LeaderboardService {
  private warmedWeek: string | null = null;
  private warmedAllTime = false;

  constructor(
    private readonly store: Store,
    private readonly db: DbAccess,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private zkey(period: LeaderboardPeriod, weekId: string): string {
    return period === 'weekly' ? REDIS_KEYS.leaderboardWeekly(weekId) : REDIS_KEYS.leaderboardAllTime;
  }

  /** Loads standings from Postgres into the sorted sets. Safe to call repeatedly. */
  async warm(): Promise<void> {
    const db = this.db.tryGet();
    if (!db) return;
    const weekId = isoWeekId(this.now());
    for (const period of ['alltime', 'weekly'] as const) {
      const entries = await queryLeaderboard(db, { period, limit: 100, now: this.now() });
      await this.load(period, weekId, entries);
    }
    this.warmedAllTime = true;
    this.warmedWeek = weekId;
  }

  private async load(period: LeaderboardPeriod, weekId: string, entries: LeaderboardEntry[]): Promise<void> {
    const zkey = this.zkey(period, weekId);
    const skey = statsKey(period, weekId);
    for (const e of entries) {
      await this.store.hset(
        skey,
        e.userId,
        JSON.stringify({
          username: e.username,
          rating: e.rating,
          score: e.score,
          gamesPlayed: e.gamesPlayed,
          gamesWon: e.gamesWon,
          bestTimeMs: e.bestTimeMs,
          totalWinAttempts: Math.round((e.avgGuesses ?? 0) * e.gamesWon),
        } satisfies StoredStats),
      );
      await this.store.zadd(zkey, e.score, e.userId);
    }
    if (period === 'weekly') {
      await this.store.expire(zkey, WEEKLY_TTL_SEC);
      await this.store.expire(skey, WEEKLY_TTL_SEC);
    }
  }

  private async ensureWarm(weekId: string): Promise<void> {
    if (this.warmedAllTime && this.warmedWeek === weekId) return;
    try {
      await this.warm();
    } catch (error) {
      this.logger.warn(`[leaderboard] warm-up failed: ${String(error)}`);
    }
  }

  /** Records a finished game for a registered player: updates all-time and weekly sorted sets. */
  async record(user: User, result: RecordedResult): Promise<void> {
    const weekId = isoWeekId(this.now());
    await this.ensureWarm(weekId);

    const allTime: StoredStats = {
      username: user.username,
      rating: user.rating,
      score: user.totalScore,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      bestTimeMs: user.bestTimeMs,
      totalWinAttempts: user.totalWinAttempts,
    };
    await this.store.hset(statsKey('alltime', weekId), user.id, JSON.stringify(allTime));
    await this.store.zadd(REDIS_KEYS.leaderboardAllTime, user.totalScore, user.id);

    const skey = statsKey('weekly', weekId);
    const previous = parseStats(await this.store.hget(skey, user.id));
    const weekly: StoredStats = {
      username: user.username,
      rating: user.rating,
      score: (previous?.score ?? 0) + Math.max(0, Math.round(result.score)),
      gamesPlayed: (previous?.gamesPlayed ?? 0) + 1,
      gamesWon: (previous?.gamesWon ?? 0) + (result.won ? 1 : 0),
      bestTimeMs: (result.solved ?? result.won)
        ? Math.min(previous?.bestTimeMs ?? Number.MAX_SAFE_INTEGER, Math.round(result.durationMs))
        : (previous?.bestTimeMs ?? null),
      totalWinAttempts: (previous?.totalWinAttempts ?? 0) + (result.won ? result.attempts : 0),
    };
    await this.store.hset(skey, user.id, JSON.stringify(weekly));
    await this.store.zadd(REDIS_KEYS.leaderboardWeekly(weekId), weekly.score, user.id);
    await this.store.expire(REDIS_KEYS.leaderboardWeekly(weekId), WEEKLY_TTL_SEC);
    await this.store.expire(skey, WEEKLY_TTL_SEC);
  }

  /** Refreshes the stored rating of players after an Elo change. */
  async updateRating(user: User): Promise<void> {
    const weekId = isoWeekId(this.now());
    for (const period of ['alltime', 'weekly'] as const) {
      const skey = statsKey(period, weekId);
      const stats = parseStats(await this.store.hget(skey, user.id));
      if (stats) await this.store.hset(skey, user.id, JSON.stringify({ ...stats, rating: user.rating }));
    }
  }

  async get(period: LeaderboardPeriod, limit: number): Promise<LeaderboardEntry[]> {
    const weekId = isoWeekId(this.now());
    await this.ensureWarm(weekId);

    const ranked = await this.store.zrevrange(this.zkey(period, weekId), 0, limit - 1);
    if (ranked.length > 0) {
      const skey = statsKey(period, weekId);
      const raw = await this.store.hmget(
        skey,
        ranked.map((r) => r.member),
      );
      const entries: LeaderboardEntry[] = [];
      ranked.forEach((r, i) => {
        const stats = parseStats(raw[i] ?? null);
        if (stats) entries.push(toEntry(entries.length + 1, r.member, { ...stats, score: r.score }));
      });
      if (entries.length > 0) return entries;
    }

    const db = this.db.tryGet();
    if (!db) return [];
    return queryLeaderboard(db, { period, limit, now: this.now() });
  }

  async rank(userId: string, period: LeaderboardPeriod = 'alltime'): Promise<number | null> {
    const index = await this.store.zrevrank(this.zkey(period, isoWeekId(this.now())), userId);
    return index === null ? null : index + 1;
  }
}
