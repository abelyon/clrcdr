import { z } from "zod";
import type { GameConfig } from "./config";
import { evaluateGuess, isValidCode } from "./evaluate";

/** The only per-guess information a client may receive before the game ends. */
export const feedbackSchema = z.object({
  exact: z.number().int().min(0),
  partial: z.number().int().min(0),
  isWin: z.boolean(),
  isGameOver: z.boolean(),
});

export type Feedback = z.infer<typeof feedbackSchema>;

/**
 * Evaluates a guess server-side and builds the client-safe feedback payload.
 * @param attemptNumber 1-based number of this guess (including it).
 */
export function buildFeedback(
  secret: readonly number[],
  guess: readonly number[],
  attemptNumber: number,
  config: Pick<GameConfig, "codeLength" | "numColors" | "maxAttempts">,
): Feedback {
  if (!isValidCode(guess, config)) {
    throw new RangeError("Guess is not a valid code for this game configuration");
  }
  const { exact, partial } = evaluateGuess(secret, guess);
  const isWin = exact === config.codeLength;
  return {
    exact,
    partial,
    isWin,
    isGameOver: isWin || attemptNumber >= config.maxAttempts,
  };
}
