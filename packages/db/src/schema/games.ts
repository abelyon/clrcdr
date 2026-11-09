import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { gameModeEnum, gamePlayerResultEnum, gameStatusEnum } from "./enums";
import { matches } from "./tournaments";
import { users } from "./users";

/**
 * Match history for Solo and 1V1 games (tournament matches are 1V1 games
 * linked through `matchId`).
 *
 * The secret code is deliberately NOT stored here: it lives only in API
 * memory / Redis while the game runs, so no query over this table can leak it.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: gameModeEnum("mode").notNull(),
    status: gameStatusEnum("status").notNull().default("IN_PROGRESS"),
    codeLength: smallint("code_length").notNull().default(4),
    colorCount: smallint("color_count").notNull().default(6),
    maxAttempts: smallint("max_attempts").notNull().default(10),
    allowDuplicates: boolean("allow_duplicates").notNull().default(true),
    winnerId: uuid("winner_id").references(() => users.id, { onDelete: "set null" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("games_mode_status_idx").on(t.mode, t.status),
    index("games_ended_at_idx").on(t.endedAt),
    index("games_winner_idx").on(t.winnerId),
    index("games_match_idx").on(t.matchId),
    check("games_code_length_range", sql`${t.codeLength} between 2 and 8`),
    check("games_duration_non_negative", sql`${t.durationMs} is null or ${t.durationMs} >= 0`),
  ],
);

export const gamePlayers = pgTable(
  "game_players",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Display name snapshot so history stays readable if the profile changes. */
    displayName: varchar("display_name", { length: 64 }).notNull(),
    result: gamePlayerResultEnum("result"),
    score: integer("score").notNull().default(0),
    guessesCount: smallint("guesses_count").notNull().default(0),
    durationMs: integer("duration_ms"),
    solvedAt: timestamp("solved_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.userId] }),
    index("game_players_user_created_idx").on(t.userId, t.joinedAt),
    index("game_players_score_idx").on(t.score),
    check("game_players_score_non_negative", sql`${t.score} >= 0`),
    check("game_players_guesses_non_negative", sql`${t.guessesCount} >= 0`),
  ],
);
