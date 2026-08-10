import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RESTAURANT_SESSION_CHECK_TIMEOUT_MS,
  SessionRestorationUnavailableError,
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

  it('does not turn a Supabase timeout into a signed-out restaurant session', async () => {
    vi.useFakeTimers();
    const result = settleRestaurantSessionCheck(new Promise<boolean>(() => undefined));
    const rejection = expect(result).rejects.toBeInstanceOf(SessionRestorationUnavailableError);

    await vi.advanceTimersByTimeAsync(RESTAURANT_SESSION_CHECK_TIMEOUT_MS);

    await rejection;
  });
});
