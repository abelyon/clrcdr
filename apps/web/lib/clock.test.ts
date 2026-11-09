import { describe, expect, it } from 'vitest';
import { computeOffset } from './clock';

describe('computeOffset', () => {
  it('assumes the server timestamp was taken halfway through the round trip', () => {
    expect(computeOffset(10_500, 10_000, 11_000)).toBe(0);
    expect(computeOffset(15_500, 10_000, 11_000)).toBe(5_000);
    expect(computeOffset(5_500, 10_000, 11_000)).toBe(-5_000);
  });
});
