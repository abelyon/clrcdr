import { DEFAULT_GAME_CONFIG, type Code, type GameConfig } from "./config";

export interface PegCounts {
  /** Right color in the right position. */
  exact: number;
  /** Right color in the wrong position (duplicate-aware). */
  partial: number;
}

/** Source of randomness returning a float in `[0, 1)`. */
export type RandomSource = () => number;

type CryptoLike = { getRandomValues<T extends Uint32Array>(array: T): T };

/** Uniform float in `[0, 1)` from the Web Crypto API when available, else `Math.random`. */
export const secureRandom: RandomSource = () => {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return (buf[0] as number) / 0x1_0000_0000;
  }
  return Math.random();
};

export function isValidCode(
  code: readonly number[],
  config: Pick<GameConfig, "codeLength" | "numColors"> = DEFAULT_GAME_CONFIG,
): boolean {
  return (
    code.length === config.codeLength &&
    code.every((p) => Number.isInteger(p) && p >= 0 && p < config.numColors)
  );
}

/**
 * Scores a guess against a secret using the standard Mastermind rules:
 * exact matches are removed first, then each remaining guess peg consumes at
 * most one still-unmatched secret peg of the same color. This keeps duplicate
 * colors correct (e.g. secret `1 1 2 3` vs guess `2 1 4 4` -> 1 exact, 1 partial).
 */
export function evaluateGuess(secret: readonly number[], guess: readonly number[]): PegCounts {
  if (secret.length !== guess.length) {
    throw new RangeError(
      `Guess length (${guess.length}) must match secret length (${secret.length})`,
    );
  }

  let exact = 0;
  const secretRemaining = new Map<number, number>();
  const guessRemaining: number[] = [];

  for (let i = 0; i < secret.length; i++) {
    const s = secret[i] as number;
    const g = guess[i] as number;
    if (s === g) {
      exact++;
    } else {
      secretRemaining.set(s, (secretRemaining.get(s) ?? 0) + 1);
      guessRemaining.push(g);
    }
  }

  let partial = 0;
  for (const g of guessRemaining) {
    const left = secretRemaining.get(g) ?? 0;
    if (left > 0) {
      partial++;
      secretRemaining.set(g, left - 1);
    }
  }

  return { exact, partial };
}

/**
 * Generates a random secret code. Server-only: never send the result to a
 * client before the game is over.
 */
export function generateSecretCode(
  config: Pick<GameConfig, "codeLength" | "numColors" | "allowDuplicates"> = DEFAULT_GAME_CONFIG,
  random: RandomSource = secureRandom,
): Code {
  const { codeLength, numColors, allowDuplicates } = config;
  if (!allowDuplicates && numColors < codeLength) {
    throw new RangeError("numColors must be >= codeLength when duplicates are not allowed");
  }

  const pick = (max: number) => Math.min(max - 1, Math.floor(random() * max));

  if (allowDuplicates) {
    return Array.from({ length: codeLength }, () => pick(numColors));
  }

  const pool = Array.from({ length: numColors }, (_, i) => i);
  const code: Code = [];
  for (let i = 0; i < codeLength; i++) {
    const idx = pick(pool.length);
    code.push(pool.splice(idx, 1)[0] as number);
  }
  return code;
}
