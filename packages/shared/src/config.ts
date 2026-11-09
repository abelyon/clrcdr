import { z } from "zod";

export const MIN_CODE_LENGTH = 1;
export const MAX_CODE_LENGTH = 8;
export const MIN_COLORS = 2;
export const MAX_COLORS = 10;
export const MIN_ATTEMPTS = 1;
export const MAX_ATTEMPTS = 20;

/**
 * Colors are zero-based palette indices (`0 .. numColors - 1`). The mapping to
 * actual colors / colorblind symbols lives in the web app, never on the wire.
 */
export type Peg = number;
export type Code = Peg[];

export const gameConfigSchema = z
  .object({
    codeLength: z.number().int().min(MIN_CODE_LENGTH).max(MAX_CODE_LENGTH).default(4),
    numColors: z.number().int().min(MIN_COLORS).max(MAX_COLORS).default(6),
    maxAttempts: z.number().int().min(MIN_ATTEMPTS).max(MAX_ATTEMPTS).default(10),
    allowDuplicates: z.boolean().default(true),
  })
  .refine((c) => c.allowDuplicates || c.numColors >= c.codeLength, {
    message: "numColors must be >= codeLength when duplicates are not allowed",
    path: ["numColors"],
  });

export type GameConfig = z.infer<typeof gameConfigSchema>;

export const DEFAULT_GAME_CONFIG: Readonly<GameConfig> = Object.freeze({
  codeLength: 4,
  numColors: 6,
  maxAttempts: 10,
  allowDuplicates: true,
});

export const GAME_PRESETS = {
  classic: DEFAULT_GAME_CONFIG,
  hard: Object.freeze({
    codeLength: 5,
    numColors: 8,
    maxAttempts: 12,
    allowDuplicates: true,
  }),
} as const satisfies Record<string, Readonly<GameConfig>>;

export type GamePresetName = keyof typeof GAME_PRESETS;

/** Parses a (possibly partial) config, filling defaults. Throws a ZodError when invalid. */
export function resolveGameConfig(input: Partial<GameConfig> = {}): GameConfig {
  return gameConfigSchema.parse(input);
}
