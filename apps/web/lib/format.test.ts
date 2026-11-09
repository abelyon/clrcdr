import { describe, expect, it } from 'vitest';
import { formatDateTime, localInputToIso } from './format';

describe('format helpers', () => {
  it('returns null for missing or invalid dates', () => {
    expect(formatDateTime(null, 'en-US')).toBeNull();
    expect(formatDateTime('nope', 'en-US')).toBeNull();
  });

  it('formats valid dates', () => {
    expect(formatDateTime('2026-01-02T03:04:00.000Z', 'en-US')).toMatch(/2026/);
  });

  it('converts datetime-local values to ISO', () => {
    expect(localInputToIso('')).toBeUndefined();
    expect(localInputToIso('garbage')).toBeUndefined();
    expect(localInputToIso('2026-05-01T10:30')).toMatch(/^2026-05-01T|^2026-04-30T/);
  });
});
