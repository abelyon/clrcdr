import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  LANGUAGES,
  MATCH_MODES,
  MATCH_STATUSES,
  RATING,
  THEMES,
  TOURNAMENT_MATCH_STATUSES,
  TOURNAMENT_STATUSES,
  USER_ROLES,
  type GuessRecord,
  type PegColor,
} from '@mastermind/shared';

export const userRoleEnum = pgEnum('user_role', USER_ROLES);
export const languageEnum = pgEnum('language', LANGUAGES);
export const themeEnum = pgEnum('theme', THEMES);
export const matchModeEnum = pgEnum('match_mode', MATCH_MODES);
export const matchStatusEnum = pgEnum('match_status', MATCH_STATUSES);
export const tournamentStatusEnum = pgEnum('tournament_status', TOURNAMENT_STATUSES);
export const tournamentMatchStatusEnum = pgEnum(
  'tournament_match_status',
  TOURNAMENT_MATCH_STATUSES,
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 32 }).notNull().unique(),
    email: varchar('email', { length: 254 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('PLAYER'),
    rating: integer('rating').notNull().default(RATING.INITIAL),
    gamesPlayed: integer('games_played').notNull().default(0),
    gamesWon: integer('games_won').notNull().default(0),
    /** Lifetime leaderboard score (sum of match scores). */
    totalScore: integer('total_score').notNull().default(0),
    /** Fastest winning time in ms. */
    bestTimeMs: integer('best_time_ms'),
    /** Sum of attempts used across won games; avg guesses = totalWinAttempts / gamesWon. */
    totalWinAttempts: integer('total_win_attempts').notNull().default(0),
    isBot: boolean('is_bot').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_total_score_idx').on(t.totalScore), index('users_rating_idx').on(t.rating)],
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  language: languageEnum('language').notNull().default('en'),
  colorblindMode: boolean('colorblind_mode').notNull().default(false),
  highContrast: boolean('high_contrast').notNull().default(false),
  theme: themeEnum('theme').notNull().default('dark'),
  soundEnabled: boolean('sound_enabled').notNull().default(true),
});

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mode: matchModeEnum('mode').notNull(),
    secretCode: jsonb('secret_code').$type<PegColor[]>().notNull(),
    player1Id: uuid('player1_id').references(() => users.id, { onDelete: 'set null' }),
    player2Id: uuid('player2_id').references(() => users.id, { onDelete: 'set null' }),
    winnerId: uuid('winner_id').references(() => users.id, { onDelete: 'set null' }),
    player1Guesses: jsonb('player1_guesses').$type<GuessRecord[]>().notNull().default([]),
    player2Guesses: jsonb('player2_guesses').$type<GuessRecord[]>().notNull().default([]),
    player1Score: integer('player1_score').notNull().default(0),
    player2Score: integer('player2_score').notNull().default(0),
    durationMs: integer('duration_ms'),
    status: matchStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('matches_player1_idx').on(t.player1Id),
    index('matches_player2_idx').on(t.player2Id),
    index('matches_status_completed_idx').on(t.status, t.completedAt),
  ],
);

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description'),
  status: tournamentStatusEnum('status').notNull().default('REGISTRATION'),
  /** Any N >= 2; the bracket is padded to the next power of two with BYE slots. */
  maxPlayers: integer('max_players').notNull(),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  startTime: timestamp('start_time', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentParticipants = pgTable(
  'tournament_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seed: integer('seed'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tournament_participants_unique').on(t.tournamentId, t.userId),
    index('tournament_participants_tournament_idx').on(t.tournamentId),
  ],
);

export const tournamentMatches = pgTable(
  'tournament_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    round: integer('round').notNull(),
    matchOrder: integer('match_order').notNull(),
    player1Id: uuid('player1_id').references(() => users.id, { onDelete: 'set null' }),
    player2Id: uuid('player2_id').references(() => users.id, { onDelete: 'set null' }),
    winnerId: uuid('winner_id').references(() => users.id, { onDelete: 'set null' }),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
    nextMatchId: uuid('next_match_id').references((): AnyPgColumn => tournamentMatches.id, {
      onDelete: 'set null',
    }),
    nextMatchSlot: smallint('next_match_slot').$type<1 | 2>(),
    status: tournamentMatchStatusEnum('status').notNull().default('PENDING'),
  },
  (t) => [
    unique('tournament_matches_position_unique').on(t.tournamentId, t.round, t.matchOrder),
    index('tournament_matches_tournament_idx').on(t.tournamentId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type MatchRow = typeof matches.$inferSelect;
export type NewMatchRow = typeof matches.$inferInsert;
export type TournamentRow = typeof tournaments.$inferSelect;
export type NewTournamentRow = typeof tournaments.$inferInsert;
export type TournamentParticipantRow = typeof tournamentParticipants.$inferSelect;
export type NewTournamentParticipantRow = typeof tournamentParticipants.$inferInsert;
export type TournamentMatchRow = typeof tournamentMatches.$inferSelect;
export type NewTournamentMatchRow = typeof tournamentMatches.$inferInsert;
