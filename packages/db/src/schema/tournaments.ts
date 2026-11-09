import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { matchStatusEnum, tournamentStatusEnum } from "./enums";
import { users } from "./users";

export const tournaments = pgTable(
  "tournaments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    /** Number of participants (N) in the single-elimination bracket. */
    size: integer("size").notNull(),
    status: tournamentStatusEnum("status").notNull().default("DRAFT"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    winnerId: uuid("winner_id").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("tournaments_status_idx").on(t.status),
    index("tournaments_created_by_idx").on(t.createdBy),
    check("tournaments_size_min", sql`${t.size} >= 2`),
  ],
);

export const tournamentParticipants = pgTable(
  "tournament_participants",
  {
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 1-based seed; seed 1 faces the lowest seed and receives the bye when N is not a power of two. */
    seed: integer("seed").notNull(),
    eliminatedInRound: integer("eliminated_in_round"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tournamentId, t.userId] }),
    unique("tournament_participants_seed_unique").on(t.tournamentId, t.seed),
    index("tournament_participants_user_idx").on(t.userId),
    check("tournament_participants_seed_positive", sql`${t.seed} >= 1`),
  ],
);

/**
 * Bracket nodes. Each node points at the match its winner advances to
 * (`nextMatchId`) and the slot (1 = player1, 2 = player2) the winner fills.
 * Null `nextMatchId` marks the final.
 */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    /** 1 = first round; the highest round is the final. */
    round: integer("round").notNull(),
    /** 0-based position of the node within its round (top to bottom). */
    position: integer("position").notNull(),
    nextMatchId: uuid("next_match_id").references((): AnyPgColumn => matches.id, {
      onDelete: "set null",
    }),
    nextMatchSlot: smallint("next_match_slot"),
    player1Id: uuid("player1_id").references(() => users.id, { onDelete: "set null" }),
    player2Id: uuid("player2_id").references(() => users.id, { onDelete: "set null" }),
    winnerId: uuid("winner_id").references(() => users.id, { onDelete: "set null" }),
    /** True when one slot is permanently empty; the lone player advances automatically. */
    isBye: boolean("is_bye").notNull().default(false),
    status: matchStatusEnum("status").notNull().default("PENDING"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("matches_tournament_round_position_unique").on(t.tournamentId, t.round, t.position),
    index("matches_tournament_round_idx").on(t.tournamentId, t.round),
    index("matches_next_match_idx").on(t.nextMatchId),
    index("matches_player1_idx").on(t.player1Id),
    index("matches_player2_idx").on(t.player2Id),
    index("matches_winner_idx").on(t.winnerId),
    check("matches_round_positive", sql`${t.round} >= 1`),
    check("matches_position_non_negative", sql`${t.position} >= 0`),
    check(
      "matches_next_match_slot_valid",
      sql`(${t.nextMatchId} is null and ${t.nextMatchSlot} is null) or (${t.nextMatchId} is not null and ${t.nextMatchSlot} in (1, 2))`,
    ),
    check("matches_no_self_advance", sql`${t.nextMatchId} is null or ${t.nextMatchId} <> ${t.id}`),
    check(
      "matches_winner_is_player",
      sql`${t.winnerId} is null or ${t.winnerId} = ${t.player1Id} or ${t.winnerId} = ${t.player2Id}`,
    ),
  ],
);
