import { describe, expect, it } from 'vitest';
import { driverHasCapacity, normalizeDriverCapacity } from '../../src/shared/driverCapacity';

describe('driver capacity', () => {
  it('normalizes invalid values and database limits', () => {
    expect(normalizeDriverCapacity(undefined)).toBe(1);
    expect(normalizeDriverCapacity(0)).toBe(1);
    expect(normalizeDriverCapacity(2.9)).toBe(2);
    expect(normalizeDriverCapacity(11)).toBe(10);
  });

  it('allows another order only below the exact limit', () => {
    expect(driverHasCapacity(0, 1)).toBe(true);
    expect(driverHasCapacity(1, 1)).toBe(false);
    expect(driverHasCapacity(1, 2)).toBe(true);
    expect(driverHasCapacity(2, 2)).toBe(false);
  });
});
