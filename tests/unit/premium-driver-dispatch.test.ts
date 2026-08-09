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

  it('falls back to a subscribed regular driver when eligible premium drivers have no push subscription', () => {
    const drivers = [eligibleDriver('premium-without-push', true), eligibleDriver('regular-with-push', false)];
    const subscriptions = [
      { id: 'subscription-1', driver_id: 'regular-with-push', endpoint: 'https://push.example/regular' }
    ];

    expect(selectPriorityDriverSubscriptions(drivers, subscriptions)).toEqual(subscriptions);
  });

  it('keeps premium priority when an eligible premium driver has a push subscription', () => {
    const drivers = [eligibleDriver('premium-with-push', true), eligibleDriver('regular-with-push', false)];
    const subscriptions = [
      { id: 'subscription-1', driver_id: 'regular-with-push', endpoint: 'https://push.example/regular' },
      { id: 'subscription-2', driver_id: 'premium-with-push', endpoint: 'https://push.example/premium' },
      { id: 'subscription-3', driver_id: 'unavailable-driver', endpoint: 'https://push.example/unavailable' }
    ];

    expect(selectPriorityDriverSubscriptions(drivers, subscriptions)).toEqual([subscriptions[1]]);
  });
});
