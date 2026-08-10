import { describe, expect, it } from 'vitest';
import {
  prioritizeEligibleDrivers,
  selectPriorityDriverSubscriptions
} from '../../supabase/functions/send-web-push/premiumDispatch';

const eligibleDriver = (id: string, isPremium: boolean | null) => ({
  id,
  is_premium: isPremium
});

describe('premium driver notification priority', () => {
  it('keeps only premium drivers when at least one eligible premium driver exists', () => {
    const drivers = [
      eligibleDriver('regular-1', false),
      eligibleDriver('premium-1', true),
      eligibleDriver('regular-2', null),
      eligibleDriver('premium-2', true)
    ];

    expect(prioritizeEligibleDrivers(drivers).map((driver) => driver.id)).toEqual([
      'premium-1',
      'premium-2'
    ]);
  });

  it('keeps every eligible driver when no premium driver is available', () => {
    const drivers = [
      eligibleDriver('regular-1', false),
      eligibleDriver('regular-2', null)
    ];

    expect(prioritizeEligibleDrivers(drivers)).toEqual(drivers);
  });

  it('keeps an empty eligible pool empty', () => {
    expect(prioritizeEligibleDrivers([])).toEqual([]);
  });

  it('falls back to subscribed regular drivers when an eligible premium driver has no subscription', () => {
    const drivers = [eligibleDriver('premium-no-push', true), eligibleDriver('regular-push', false)];
    const subscriptions = [
      { id: 'regular-subscription', driver_id: 'regular-push' }
    ];

    expect(selectPriorityDriverSubscriptions(drivers, subscriptions)).toEqual(subscriptions);
  });

  it('keeps only subscribed premium drivers when at least one can receive push', () => {
    const drivers = [eligibleDriver('premium-push', true), eligibleDriver('regular-push', false)];
    const subscriptions = [
      { id: 'regular-subscription', driver_id: 'regular-push' },
      { id: 'premium-subscription', driver_id: 'premium-push' }
    ];

    expect(selectPriorityDriverSubscriptions(drivers, subscriptions)).toEqual([
      { id: 'premium-subscription', driver_id: 'premium-push' }
    ]);
  });
});
