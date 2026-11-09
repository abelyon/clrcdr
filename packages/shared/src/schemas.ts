import { z } from 'zod';
import {
  ALL_PEG_COLORS,
  CODE_LENGTH,
  GAME_LIMITS,
  GAME_PALETTE,
  LANGUAGES,
  LEADERBOARD_PERIODS,
  MATCH_MODES,
  MATCH_STATUSES,
  THEMES,
  TOURNAMENT_LIMITS,
  TOURNAMENT_MATCH_STATUSES,
  TOURNAMENT_STATUSES,
  USER_ROLES,
} from './constants';

/* ---------- primitives ---------- */

export const pegColorSchema = z.enum(ALL_PEG_COLORS);
export const gameColorSchema = z.enum(GAME_PALETTE);
export const codeGuessSchema = z.array(gameColorSchema).length(CODE_LENGTH);
export const secretCodeSchema = z.array(pegColorSchema).length(CODE_LENGTH);

export const languageSchema = z.enum(LANGUAGES);
export const themeSchema = z.enum(THEMES);
export const userRoleSchema = z.enum(USER_ROLES);
export const matchModeSchema = z.enum(MATCH_MODES);
export const matchStatusSchema = z.enum(MATCH_STATUSES);
export const tournamentStatusSchema = z.enum(TOURNAMENT_STATUSES);
export const tournamentMatchStatusSchema = z.enum(TOURNAMENT_MATCH_STATUSES);
export const leaderboardPeriodSchema = z.enum(LEADERBOARD_PERIODS);

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, underscore and hyphen');
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(6).max(72);
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(GAME_LIMITS.ROOM_CODE_LENGTH)
  .regex(/^[A-Z0-9]+$/);

/* ---------- auth ---------- */

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const guestSchema = z.object({
  username: z.string().trim().min(2).max(20).optional(),
});
export type GuestInput = z.infer<typeof guestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  role: userRoleSchema,
  rating: z.number().int(),
  gamesPlayed: z.number().int(),
  gamesWon: z.number().int(),
  isGuest: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/* ---------- settings ---------- */

export const userSettingsSchema = z.object({
  language: languageSchema,
  colorblindMode: z.boolean(),
  highContrast: z.boolean(),
  theme: themeSchema,
  soundEnabled: z.boolean(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateSettingsSchema = userSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/* ---------- gameplay ---------- */

export const guessRecordSchema = z.object({
  guess: secretCodeSchema,
  exact: z.number().int().min(0).max(CODE_LENGTH),
  partial: z.number().int().min(0).max(CODE_LENGTH),
  at: z.number().int().optional(),
});
export type GuessRecord = z.infer<typeof guessRecordSchema>;

export const scoreBreakdownSchema = z.object({
  base: z.number().int(),
  attemptBonus: z.number().int(),
  timeBonus: z.number().int(),
  total: z.number().int(),
});

export const soloStartResponseSchema = z.object({
  gameId: z.string(),
  codeLength: z.number().int(),
  maxAttempts: z.number().int(),
  palette: z.array(gameColorSchema),
  startedAt: z.number().int(),
});
export type SoloStartResponse = z.infer<typeof soloStartResponseSchema>;

export const soloGuessRequestSchema = z.object({
  gameId: z.string().min(1),
  guess: codeGuessSchema,
});
export type SoloGuessRequest = z.infer<typeof soloGuessRequestSchema>;

/** Server response to a guess. `secretCode` is present only when `isGameOver` is true. */
export const guessResultSchema = z.object({
  exact: z.number().int().min(0).max(CODE_LENGTH),
  partial: z.number().int().min(0).max(CODE_LENGTH),
  row: z.number().int().min(0),
  isWin: z.boolean(),
  isGameOver: z.boolean(),
  attemptsUsed: z.number().int().min(1).optional(),
  durationMs: z.number().int().min(0).optional(),
  score: scoreBreakdownSchema.optional(),
  secretCode: secretCodeSchema.optional(),
});
export type GuessResult = z.infer<typeof guessResultSchema>;

/* ---------- leaderboard ---------- */

export const leaderboardQuerySchema = z.object({
  period: leaderboardPeriodSchema.default('alltime'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().min(1),
  userId: z.string(),
  username: z.string(),
  rating: z.number().int(),
  score: z.number().int(),
  gamesPlayed: z.number().int(),
  gamesWon: z.number().int(),
  winRate: z.number(),
  bestTimeMs: z.number().int().nullable(),
  avgGuesses: z.number().nullable(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardResponseSchema = z.object({
  period: leaderboardPeriodSchema,
  entries: z.array(leaderboardEntrySchema),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

export const submitScoreSchema = z.object({
  gameId: z.string().min(1),
});
export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;

/* ---------- tournaments ---------- */

export const createTournamentSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(500).optional(),
  maxPlayers: z.number().int().min(TOURNAMENT_LIMITS.MIN_PLAYERS).max(TOURNAMENT_LIMITS.MAX_PLAYERS),
  startTime: z.string().datetime().optional(),
});
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

export const addParticipantsSchema = z.object({
  userIds: z.array(z.string().uuid()).max(TOURNAMENT_LIMITS.MAX_PLAYERS).optional(),
  botCount: z.number().int().min(0).max(TOURNAMENT_LIMITS.MAX_PLAYERS).optional(),
});
export type AddParticipantsInput = z.infer<typeof addParticipantsSchema>;

export const playerRefSchema = z.object({
  id: z.string(),
  username: z.string(),
  rating: z.number().int(),
  seed: z.number().int().nullable(),
  isBot: z.boolean().optional(),
});
export type PlayerRef = z.infer<typeof playerRefSchema>;

export const bracketMatchSchema = z.object({
  id: z.string(),
  tournamentId: z.string(),
  round: z.number().int().min(1),
  matchOrder: z.number().int().min(0),
  player1: playerRefSchema.nullable(),
  player2: playerRefSchema.nullable(),
  winnerId: z.string().nullable(),
  matchId: z.string().nullable(),
  nextMatchId: z.string().nullable(),
  nextMatchSlot: z.union([z.literal(1), z.literal(2)]).nullable(),
  status: tournamentMatchStatusSchema,
});
export type BracketMatch = z.infer<typeof bracketMatchSchema>;

export const tournamentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: tournamentStatusSchema,
  maxPlayers: z.number().int(),
  participantCount: z.number().int(),
  createdById: z.string().nullable(),
  startTime: z.string().nullable(),
  createdAt: z.string(),
  isJoined: z.boolean().optional(),
});
export type TournamentSummary = z.infer<typeof tournamentSummarySchema>;

export const tournamentDetailSchema = tournamentSummarySchema.extend({
  totalRounds: z.number().int(),
  participants: z.array(playerRefSchema),
  matches: z.array(bracketMatchSchema),
  winner: playerRefSchema.nullable(),
});
export type TournamentDetail = z.infer<typeof tournamentDetailSchema>;

export const tournamentListResponseSchema = z.object({
  tournaments: z.array(tournamentSummarySchema),
});
export type TournamentListResponse = z.infer<typeof tournamentListResponseSchema>;

/* ---------- socket payloads ---------- */

export const matchGuessPayloadSchema = z.object({
  matchId: z.string().min(1),
  guess: codeGuessSchema,
});
export type MatchGuessPayload = z.infer<typeof matchGuessPayloadSchema>;

export const roomJoinPayloadSchema = z.object({ code: roomCodeSchema });
export type RoomJoinPayload = z.infer<typeof roomJoinPayloadSchema>;

export const matchRefPayloadSchema = z.object({ matchId: z.string().min(1) });
export type MatchRefPayload = z.infer<typeof matchRefPayloadSchema>;

export const tournamentMatchJoinPayloadSchema = z.object({
  tournamentId: z.string().min(1),
  tournamentMatchId: z.string().min(1),
});
export type TournamentMatchJoinPayload = z.infer<typeof tournamentMatchJoinPayloadSchema>;

export const tournamentRefPayloadSchema = z.object({ tournamentId: z.string().min(1) });
export type TournamentRefPayload = z.infer<typeof tournamentRefPayloadSchema>;

export const opponentSchema = z.object({
  id: z.string(),
  username: z.string(),
  rating: z.number().int(),
  isGuest: z.boolean(),
});
export type OpponentInfo = z.infer<typeof opponentSchema>;
