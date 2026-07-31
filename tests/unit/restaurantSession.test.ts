import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RESTAURANT_SESSION_CHECK_TIMEOUT_MS,
  settleRestaurantSessionCheck
} from '../../src/shared/restaurantSession';

describe('restaurant session restoration', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a verified restaurant session', async () => {
    vi.useFakeTimers();
    await expect(settleRestaurantSessionCheck(Promise.resolve(true))).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops waiting when Supabase does not answer', async () => {
    vi.useFakeTimers();
    const result = settleRestaurantSessionCheck(new Promise<boolean>(() => undefined));

    await vi.advanceTimersByTimeAsync(RESTAURANT_SESSION_CHECK_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
  });
});
