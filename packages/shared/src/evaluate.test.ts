import { describe, expect, it } from "vitest";
import {
  evaluateGuess,
  generateSecretCode,
  isValidCode,
  type RandomSource,
} from "./index";

describe("evaluateGuess", () => {
  it("all exact", () => {
    expect(evaluateGuess([1, 2, 3, 4], [1, 2, 3, 4])).toEqual({ exact: 4, partial: 0 });
  });

  it("no matches", () => {
    expect(evaluateGuess([0, 0, 0, 0], [1, 1, 1, 1])).toEqual({ exact: 0, partial: 0 });
  });

  it("all partial (permutation)", () => {
    expect(evaluateGuess([1, 2, 3, 4], [4, 3, 2, 1])).toEqual({ exact: 0, partial: 4 });
  });

  it("mixed exact and partial", () => {
    expect(evaluateGuess([1, 2, 3, 4], [1, 3, 2, 5])).toEqual({ exact: 1, partial: 2 });
  });

  it("does not over-count duplicates in the guess", () => {
    expect(evaluateGuess([1, 2, 3, 4], [1, 1, 1, 1])).toEqual({ exact: 1, partial: 0 });
    expect(evaluateGuess([1, 2, 3, 4], [2, 2, 2, 2])).toEqual({ exact: 1, partial: 0 });
  });

  it("does not over-count duplicates in the secret", () => {
    expect(evaluateGuess([1, 1, 2, 3], [1, 2, 2, 2])).toEqual({ exact: 2, partial: 0 });
    expect(evaluateGuess([1, 1, 2, 3], [2, 1, 4, 4])).toEqual({ exact: 1, partial: 1 });
  });

  it("consumes exact matches before partials", () => {
    // secret has a single 1; guess places 1 correctly at idx0 and again at idx1.
    expect(evaluateGuess([1, 2, 3, 4], [1, 1, 5, 5])).toEqual({ exact: 1, partial: 0 });
    // exact on the later slot must still be preferred over a partial on the earlier one.
    expect(evaluateGuess([2, 1, 3, 4], [1, 1, 5, 5])).toEqual({ exact: 1, partial: 0 });
  });

  it("handles repeated colors in both", () => {
    expect(evaluateGuess([0, 0, 1, 1], [1, 1, 0, 0])).toEqual({ exact: 0, partial: 4 });
    expect(evaluateGuess([0, 0, 0, 1], [0, 0, 1, 0])).toEqual({ exact: 2, partial: 2 });
    expect(evaluateGuess([3, 3, 3, 3], [3, 3, 3, 3])).toEqual({ exact: 4, partial: 0 });
  });

  it("is symmetric in total matches", () => {
    const a = [1, 2, 2, 3, 0];
    const b = [2, 1, 3, 3, 3];
    const ab = evaluateGuess(a, b);
    const ba = evaluateGuess(b, a);
    expect(ab.exact + ab.partial).toBe(ba.exact + ba.partial);
    expect(ab.exact).toBe(ba.exact);
  });

  it("supports other code lengths", () => {
    expect(evaluateGuess([5], [5])).toEqual({ exact: 1, partial: 0 });
    expect(evaluateGuess([5], [4])).toEqual({ exact: 0, partial: 0 });
    expect(evaluateGuess([0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0])).toEqual({ exact: 0, partial: 6 });
  });

  it("throws on length mismatch", () => {
    expect(() => evaluateGuess([1, 2, 3], [1, 2])).toThrow(RangeError);
  });
});

describe("isValidCode", () => {
  const cfg = { codeLength: 4, numColors: 6 };
  it("accepts valid codes", () => expect(isValidCode([0, 5, 2, 2], cfg)).toBe(true));
  it("rejects wrong length", () => expect(isValidCode([0, 1, 2], cfg)).toBe(false));
  it("rejects out-of-range and non-integers", () => {
    expect(isValidCode([0, 6, 1, 1], cfg)).toBe(false);
    expect(isValidCode([0, -1, 1, 1], cfg)).toBe(false);
    expect(isValidCode([0, 1.5, 1, 1], cfg)).toBe(false);
  });
});

describe("generateSecretCode", () => {
  const seq = (values: number[]): RandomSource => {
    let i = 0;
    return () => values[i++ % values.length] as number;
  };

  it("uses config length and color range", () => {
    for (let n = 0; n < 200; n++) {
      const code = generateSecretCode({ codeLength: 5, numColors: 8, allowDuplicates: true });
      expect(isValidCode(code, { codeLength: 5, numColors: 8 })).toBe(true);
    }
  });

  it("is deterministic with an injected RNG", () => {
    const code = generateSecretCode(
      { codeLength: 4, numColors: 6, allowDuplicates: true },
      seq([0, 0.5, 0.99, 0.17]),
    );
    expect(code).toEqual([0, 3, 5, 1]);
  });

  it("never produces duplicates when disallowed", () => {
    for (let n = 0; n < 200; n++) {
      const code = generateSecretCode({ codeLength: 6, numColors: 6, allowDuplicates: false });
      expect(new Set(code).size).toBe(6);
    }
  });

  it("handles an RNG returning values near 1", () => {
    const code = generateSecretCode(
      { codeLength: 4, numColors: 6, allowDuplicates: false },
      () => 0.9999999,
    );
    expect(new Set(code).size).toBe(4);
  });

  it("rejects impossible no-duplicate configs", () => {
    expect(() =>
      generateSecretCode({ codeLength: 5, numColors: 4, allowDuplicates: false }),
    ).toThrow(RangeError);
  });
});
