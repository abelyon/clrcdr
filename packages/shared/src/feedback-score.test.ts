import { describe, expect, it } from "vitest";
import {
  buildFeedback,
  calculateScore,
  difficultyMultiplier,
  feedbackSchema,
  resolveGameConfig,
} from "./index";

const config = resolveGameConfig({ maxAttempts: 3 });

describe("buildFeedback", () => {
  it("flags a win and game over", () => {
    const fb = buildFeedback([1, 2, 3, 4], [1, 2, 3, 4], 1, config);
    expect(fb).toEqual({ exact: 4, partial: 0, isWin: true, isGameOver: true });
    expect(feedbackSchema.parse(fb)).toEqual(fb);
  });

  it("continues while attempts remain", () => {
    expect(buildFeedback([1, 2, 3, 4], [4, 3, 2, 1], 2, config)).toEqual({
      exact: 0,
      partial: 4,
      isWin: false,
      isGameOver: false,
    });
  });

  it("ends the game on the final attempt without a win", () => {
    expect(buildFeedback([1, 2, 3, 4], [0, 0, 0, 0], 3, config).isGameOver).toBe(true);
  });

  it("contains only the whitelisted keys", () => {
    const fb = buildFeedback([1, 2, 3, 4], [1, 1, 1, 1], 1, config);
    expect(Object.keys(fb).sort()).toEqual(["exact", "isGameOver", "isWin", "partial"]);
  });

  it("rejects invalid guesses", () => {
    expect(() => buildFeedback([1, 2, 3, 4], [1, 2, 3], 1, config)).toThrow(RangeError);
    expect(() => buildFeedback([1, 2, 3, 4], [1, 2, 3, 9], 1, config)).toThrow(RangeError);
  });
});

describe("calculateScore", () => {
  it("is 0 for a loss", () => {
    expect(calculateScore({ won: false, attemptsUsed: 10, timeMs: 1000 })).toBe(0);
  });

  it("gives the max (with full speed bonus) for an instant first-try win", () => {
    expect(calculateScore({ won: true, attemptsUsed: 1, timeMs: 0 })).toBe(1200);
  });

  it("decreases with more attempts", () => {
    const fast = calculateScore({ won: true, attemptsUsed: 2, timeMs: 60_000 });
    const slow = calculateScore({ won: true, attemptsUsed: 8, timeMs: 60_000 });
    expect(fast).toBeGreaterThan(slow);
  });

  it("decreases with time and has no negative bonus", () => {
    const quick = calculateScore({ won: true, attemptsUsed: 5, timeMs: 10_000 });
    const slow = calculateScore({ won: true, attemptsUsed: 5, timeMs: 10 * 60_000 });
    expect(quick).toBeGreaterThan(slow);
    expect(slow).toBe(600);
  });

  it("scales with difficulty", () => {
    const hard = resolveGameConfig({ codeLength: 5, numColors: 8, maxAttempts: 10 });
    const classic = resolveGameConfig();
    expect(difficultyMultiplier(hard)).toBeGreaterThan(difficultyMultiplier(classic));
    expect(calculateScore({ won: true, attemptsUsed: 4, timeMs: 0, config: hard })).toBeGreaterThan(
      calculateScore({ won: true, attemptsUsed: 4, timeMs: 0, config: classic }),
    );
  });

  it("discounts no-duplicate games", () => {
    const nd = resolveGameConfig({ allowDuplicates: false });
    expect(difficultyMultiplier(nd)).toBe(0.75);
  });

  it("clamps attemptsUsed to the valid range", () => {
    expect(calculateScore({ won: true, attemptsUsed: 99, timeMs: 10 * 60_000 })).toBe(100);
    expect(calculateScore({ won: true, attemptsUsed: 0, timeMs: 10 * 60_000 })).toBe(1000);
  });
});
