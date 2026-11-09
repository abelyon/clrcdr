import { DEFAULT_GAME_CONFIG, type GameConfig } from "./config";

export const BASE_SCORE = 1000;
/** Maximum extra share of the attempt score granted for speed. */
export const MAX_TIME_BONUS_RATIO = 0.2;
export const DEFAULT_TIME_LIMIT_MS = 5 * 60 * 1000;
/** Duplicate-free codes are easier, so they are worth less. */
export const NO_DUPLICATES_MULTIPLIER = 0.75;

export interface ScoreInput {
  won: boolean;
  /** Guesses used, including the winning one (1-based). */
  attemptsUsed: number;
  /** Elapsed time in milliseconds. */
  timeMs: number;
  config?: GameConfig;
  /** Time after which the speed bonus is zero. */
  timeLimitMs?: number;
}

/** (codeLength / 4) * (numColors / 6) * (0.75 when duplicates are disallowed). */
export function difficultyMultiplier(
  config: Pick<GameConfig, "codeLength" | "numColors" | "allowDuplicates"> = DEFAULT_GAME_CONFIG,
): number {
  const m = (config.codeLength / 4) * (config.numColors / 6);
  return config.allowDuplicates ? m : m * NO_DUPLICATES_MULTIPLIER;
}

/**
 * Score for a finished game (documented on the /rules page):
 *
 *   attemptScore = 1000 * (maxAttempts - attemptsUsed + 1) / maxAttempts
 *   timeBonus    = attemptScore * 0.2 * max(0, 1 - timeMs / timeLimitMs)
 *   score        = round((attemptScore + timeBonus) * difficultyMultiplier)
 *
 * Lost games score 0.
 */
export function calculateScore(input: ScoreInput): number {
  const config = input.config ?? DEFAULT_GAME_CONFIG;
  const timeLimitMs = input.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  if (!input.won) return 0;

  const attemptsUsed = Math.min(Math.max(1, Math.floor(input.attemptsUsed)), config.maxAttempts);
  const attemptScore = (BASE_SCORE * (config.maxAttempts - attemptsUsed + 1)) / config.maxAttempts;
  const timeRatio = Math.max(0, 1 - Math.max(0, input.timeMs) / timeLimitMs);
  const timeBonus = attemptScore * MAX_TIME_BONUS_RATIO * timeRatio;

  return Math.round((attemptScore + timeBonus) * difficultyMultiplier(config));
}
