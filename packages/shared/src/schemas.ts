import { z } from "zod";
import {
  MAX_CODE_LENGTH,
  MAX_COLORS,
  MIN_CODE_LENGTH,
  type GameConfig,
} from "./config";

/** A guess/code: palette indices. Structure only; see `createGuessSchema` for config-bound checks. */
export const guessSchema = z
  .array(z.number().int().min(0).max(MAX_COLORS - 1))
  .min(MIN_CODE_LENGTH)
  .max(MAX_CODE_LENGTH);

export type Guess = z.infer<typeof guessSchema>;

/** Guess schema bound to a specific game configuration (length and color range). */
export function createGuessSchema(config: Pick<GameConfig, "codeLength" | "numColors">) {
  return z
    .array(z.number().int().min(0).max(config.numColors - 1))
    .length(config.codeLength);
}

export const gameModeSchema = z.enum(["solo", "1v1", "tournament"]);
export type GameMode = z.infer<typeof gameModeSchema>;

export const guessRequestSchema = z.object({
  gameId: z.string().min(1),
  guess: guessSchema,
});
export type GuessRequest = z.infer<typeof guessRequestSchema>;

export const languageSchema = z.enum(["en", "hu"]);
export type Language = z.infer<typeof languageSchema>;

export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;

export const audioSettingsSchema = z.object({
  muted: z.boolean().default(false),
  masterVolume: z.number().min(0).max(1).default(0.8),
  sfxVolume: z.number().min(0).max(1).default(1),
  musicVolume: z.number().min(0).max(1).default(0.4),
});
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

export const settingsSchema = z.object({
  language: languageSchema.default("en"),
  theme: themeSchema.default("system"),
  audio: audioSettingsSchema.default({}),
  /** Colorblind Accessibility Mode: symbols/letters on pegs. */
  colorblindMode: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const updateSettingsSchema = z.object({
  language: languageSchema.optional(),
  theme: themeSchema.optional(),
  audio: audioSettingsSchema.partial().optional(),
  colorblindMode: z.boolean().optional(),
});
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

export const userRoleSchema = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(2).max(32),
  role: userRoleSchema,
  createdAt: z.string().datetime(),
});
export type UserDto = z.infer<typeof userSchema>;

export const userWithSettingsSchema = userSchema.extend({ settings: settingsSchema });
export type UserWithSettingsDto = z.infer<typeof userWithSettingsSchema>;

export const createUserSchema = z.object({
  username: userSchema.shape.username,
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const leaderboardPeriodSchema = z.enum(["all-time", "weekly"]);
export type LeaderboardPeriod = z.infer<typeof leaderboardPeriodSchema>;

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().min(1),
  userId: z.string().min(1),
  username: z.string(),
  score: z.number().min(0),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardResponseSchema = z.object({
  period: leaderboardPeriodSchema,
  entries: z.array(leaderboardEntrySchema),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

/** Response when a solo game starts. Never contains the secret. */
export const startGameResponseSchema = z.object({
  gameId: z.string().min(1),
  config: z.object({
    codeLength: z.number().int(),
    numColors: z.number().int(),
    maxAttempts: z.number().int(),
    allowDuplicates: z.boolean(),
  }),
});
export type StartGameResponse = z.infer<typeof startGameResponseSchema>;
