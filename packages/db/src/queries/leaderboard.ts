import { desc, gt, sql } from 'drizzle-orm';
import {
  isoWeekStart,
  winRatePercent,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from '@mastermind/shared';
import { users } from '../schema';
import type { DbLike } from './users';

export interface LeaderboardOptions {
  period?: LeaderboardPeriod;
  limit?: number;
  now?: Date;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** All-time standings come from lifetime user stats; weekly standings are aggregated from matches completed since Monday 00:00 UTC. */
export async function getLeaderboard(
  db: DbLike,
  options: LeaderboardOptions = {},
): Promise<LeaderboardEntry[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  return options.period === 'weekly'
    ? getWeeklyLeaderboard(db, limit, options.now ?? new Date())
    : getAllTimeLeaderboard(db, limit);
}

async function getAllTimeLeaderboard(db: DbLike, limit: number): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select()
    .from(users)
    .where(gt(users.gamesPlayed, 0))
    .orderBy(desc(users.totalScore), desc(users.rating), desc(users.gamesWon))
    .limit(limit);

  return rows.map((u, i) => ({
    rank: i + 1,
    userId: u.id,
    username: u.username,
    rating: u.rating,
    score: u.totalScore,
    gamesPlayed: u.gamesPlayed,
    gamesWon: u.gamesWon,
    winRate: winRatePercent(u.gamesWon, u.gamesPlayed),
    bestTimeMs: u.bestTimeMs,
    avgGuesses: u.gamesWon > 0 ? round1(u.totalWinAttempts / u.gamesWon) : null,
  }));
}

interface WeeklyRow extends Record<string, unknown> {
  id: string;
  username: string;
  rating: number;
  score: number;
  games: number;
  wins: number;
  best_time: number | null;
  avg_guesses: string | number | null;
}

async function getWeeklyLeaderboard(
  db: DbLike,
  limit: number,
  now: Date,
): Promise<LeaderboardEntry[]> {
  const since = isoWeekStart(now).toISOString();
  const result = await db.execute<WeeklyRow>(sql`
    WITH sides AS (
      SELECT player1_id AS user_id, player1_score AS score, duration_ms,
             jsonb_array_length(player1_guesses) AS guess_count,
             (winner_id IS NOT NULL AND winner_id = player1_id) AS won
      FROM matches
      WHERE status = 'COMPLETED' AND completed_at >= ${since}::timestamptz AND player1_id IS NOT NULL
      UNION ALL
      SELECT player2_id, player2_score, duration_ms,
             jsonb_array_length(player2_guesses),
             (winner_id IS NOT NULL AND winner_id = player2_id)
      FROM matches
      WHERE status = 'COMPLETED' AND completed_at >= ${since}::timestamptz AND player2_id IS NOT NULL
    )
    SELECT u.id, u.username, u.rating,
           COALESCE(SUM(s.score), 0)::int AS score,
           COUNT(*)::int AS games,
           (COUNT(*) FILTER (WHERE s.won))::int AS wins,
           (MIN(s.duration_ms) FILTER (WHERE s.won))::int AS best_time,
           AVG(s.guess_count) FILTER (WHERE s.won) AS avg_guesses
    FROM sides s
    JOIN users u ON u.id = s.user_id
    GROUP BY u.id, u.username, u.rating
    ORDER BY score DESC, wins DESC, u.rating DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    username: row.username,
    rating: Number(row.rating),
    score: Number(row.score),
    gamesPlayed: Number(row.games),
    gamesWon: Number(row.wins),
    winRate: winRatePercent(Number(row.wins), Number(row.games)),
    bestTimeMs: row.best_time === null ? null : Number(row.best_time),
    avgGuesses: row.avg_guesses === null ? null : round1(Number(row.avg_guesses)),
  }));
}

/** Rank (1-based) of a user by lifetime score among players with at least one game, or null. */
export async function getAllTimeRank(db: DbLike, userId: string): Promise<number | null> {
  const result = await db.execute<{ rank: string | null }>(sql`
    SELECT rank FROM (
      SELECT id, RANK() OVER (ORDER BY total_score DESC, rating DESC, games_won DESC) AS rank
      FROM users WHERE games_played > 0
    ) r WHERE id = ${userId}
  `);
  const rank = result.rows[0]?.rank;
  return rank == null ? null : Number(rank);
}
