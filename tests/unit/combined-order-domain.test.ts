import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POST_ORDER_ADDON_CONFIG,
  calculateCombinedOrderTotal,
  chooseEligibleAddonRoute,
  evaluateAddonOfferWindow,
  filterAddonMerchantCandidates,
  getCombinedOrderErrorMessage,
  rankAddonMerchantCandidates,
  type AddonMerchantCandidate,
  type AddonRouteOption
} from '../../src/features/combined-order/domain';

const merchant = (overrides: Partial<AddonMerchantCandidate> = {}): AddonMerchantCandidate => ({
  id: 'store-1',
  businessType: 'grocery',
  isActive: true,
  isOpen: true,
  acceptsOrders: true,
  supportsWayyaamDelivery: true,
  hasAvailableItems: true,
  latitude: 43.232,
  longitude: 46.006,
  assemblyMinutes: 4,
  rating: 4.8,
  straightLineDistanceFromRestaurantKm: 0.8,
  distanceToRouteCorridorKm: 0.2,
  ...overrides
});

const route = (overrides: Partial<AddonRouteOption> = {}): AddonRouteOption => ({
  sequence: ['store', 'primary', 'customer'],
  totalDistanceKm: 8.7,
  totalTravelMinutes: 18,
  postPrimaryPickupDelayMinutes: 0,
  customerArrivalAtMs: Date.parse('2026-08-15T10:24:00.000Z'),
  ...overrides
});

describe('combined order configuration', () => {
  it('keeps every MVP limit centralized and safe by default', () => {
    expect(DEFAULT_POST_ORDER_ADDON_CONFIG).toEqual({
      enabled: false,
      offerWindowMinutes: 5,
      addonDeliveryFee: 40,
      maxExtraDistanceKm: 3,
      maxExtraTimeMinutes: 10,
      maxPostMainPickupDelayMinutes: 3,
      maxAdditionalMerchants: 1,
      candidateStoreRadiusKm: 2,
      routeCorridorKm: 1.5,
      maxRouteCandidates: 15,
      maxShownMerchants: 5
    });
  });
});

describe('post-order offer window', () => {
  const active = {
    nowMs: Date.parse('2026-08-15T10:03:00.000Z'),
    expiresAtMs: Date.parse('2026-08-15T10:05:00.000Z'),
    offerStatus: 'available' as const,
    mainOrderStatus: 'preparing' as const,
    deliveryStatus: 'waiting_courier' as const,
    completedPickupCount: 0,
    additionalMerchantCount: 0,
    maxAdditionalMerchants: 1
  };

  it('allows an unused active offer before any pickup', () => {
    expect(evaluateAddonOfferWindow(active)).toEqual({ allowed: true });
    expect(evaluateAddonOfferWindow({ ...active, offerStatus: 'viewed' })).toEqual({ allowed: true });
  });

  it.each([
    [{ ...active, nowMs: active.expiresAtMs }, 'offer_expired'],
    [{ ...active, offerStatus: 'used' as const }, 'offer_already_used'],
    [{ ...active, mainOrderStatus: 'cancelled' as const }, 'main_order_inactive'],
    [{ ...active, mainOrderStatus: 'completed' as const }, 'main_order_inactive'],
    [{ ...active, completedPickupCount: 1 }, 'delivery_critical_point_passed'],
    [{ ...active, deliveryStatus: 'on_the_way' as const }, 'delivery_critical_point_passed'],
    [{ ...active, additionalMerchantCount: 1 }, 'merchant_limit_reached']
  ])('closes the offer for %j', (input, reason) => {
    expect(evaluateAddonOfferWindow(input)).toEqual({ allowed: false, reason });
  });

  it('rejects malformed time bounds and every non-actionable status', () => {
    expect(evaluateAddonOfferWindow({ ...active, nowMs: Number.NaN }))
      .toEqual({ allowed: false, reason: 'offer_expired' });
    expect(evaluateAddonOfferWindow({ ...active, expiresAtMs: Number.POSITIVE_INFINITY }))
      .toEqual({ allowed: false, reason: 'offer_expired' });
    expect(evaluateAddonOfferWindow({ ...active, offerStatus: 'evaluating' }))
      .toEqual({ allowed: false, reason: 'offer_not_available' });
    expect(evaluateAddonOfferWindow({ ...active, mainOrderStatus: 'picked_up' }))
      .toEqual({ allowed: false, reason: 'main_order_inactive' });
  });

  it.each(['handed_over', 'arrived_to_client', 'delivered', 'failed', 'canceled', 'cancelled'])
  ('closes after critical delivery status %s', (deliveryStatus) => {
    expect(evaluateAddonOfferWindow({ ...active, deliveryStatus }))
      .toEqual({ allowed: false, reason: 'delivery_critical_point_passed' });
  });

  it('rejects a disabled merchant limit even before the first addon', () => {
    expect(evaluateAddonOfferWindow({ ...active, maxAdditionalMerchants: 0 }))
      .toEqual({ allowed: false, reason: 'merchant_limit_reached' });
  });
});

describe('merchant geographic pre-filter', () => {
  it('keeps only operational stores close to the restaurant or route corridor', () => {
    const candidates = [
      merchant(),
      merchant({ id: 'corridor-store', straightLineDistanceFromRestaurantKm: 4, distanceToRouteCorridorKm: 1.2 }),
      merchant({ id: 'closed-store', isOpen: false }),
      merchant({ id: 'far-store', straightLineDistanceFromRestaurantKm: 4, distanceToRouteCorridorKm: 2.5 }),
      merchant({ id: 'no-location', latitude: null }),
      merchant({ id: 'pharmacy', businessType: 'pharmacy' })
    ];

    expect(filterAddonMerchantCandidates(candidates, DEFAULT_POST_ORDER_ADDON_CONFIG).map(({ id }) => id))
      .toEqual(['store-1', 'corridor-store']);
  });

  it('bounds the cheap pre-filter before route matrix requests', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => merchant({
      id: `store-${index}`,
      straightLineDistanceFromRestaurantKm: index / 20
    }));

    expect(filterAddonMerchantCandidates(candidates, DEFAULT_POST_ORDER_ADDON_CONFIG)).toHaveLength(15);
  });

  it('accepts inclusive coordinate and distance boundaries but rejects malformed candidate data', () => {
    const candidates = [
      merchant({ id: 'boundary', latitude: -90, longitude: 180, assemblyMinutes: 0, straightLineDistanceFromRestaurantKm: 2, distanceToRouteCorridorKm: 2 }),
      merchant({ id: 'zero-distance', straightLineDistanceFromRestaurantKm: 0, distanceToRouteCorridorKm: 2 }),
      merchant({ id: 'corridor-boundary', straightLineDistanceFromRestaurantKm: 4, distanceToRouteCorridorKm: 1.5 }),
      merchant({ id: 'latitude-low', latitude: -90.0001 }),
      merchant({ id: 'latitude-high', latitude: 90.0001 }),
      merchant({ id: 'longitude-low', longitude: -180.0001 }),
      merchant({ id: 'longitude-high', longitude: 180.0001 }),
      merchant({ id: 'nan-coordinate', longitude: Number.NaN }),
      merchant({ id: 'bad-assembly', assemblyMinutes: -1 }),
      merchant({ id: 'nan-assembly', assemblyMinutes: Number.NaN }),
      merchant({ id: 'negative-distance', straightLineDistanceFromRestaurantKm: -1, distanceToRouteCorridorKm: -1 }),
      merchant({ id: 'nan-distance', straightLineDistanceFromRestaurantKm: Number.NaN, distanceToRouteCorridorKm: Number.NaN })
    ];

    expect(filterAddonMerchantCandidates(candidates, DEFAULT_POST_ORDER_ADDON_CONFIG).map(({ id }) => id))
      .toEqual(['zero-distance', 'corridor-boundary', 'boundary']);
  });

  it.each([
    ['inactive', { isActive: false }],
    ['closed', { isOpen: false }],
    ['paused', { acceptsOrders: false }],
    ['own-delivery', { supportsWayyaamDelivery: false }],
    ['sold-out', { hasAvailableItems: false }]
  ] as const)('rejects %s merchants', (_label, overrides) => {
    expect(filterAddonMerchantCandidates([merchant(overrides)], DEFAULT_POST_ORDER_ADDON_CONFIG)).toEqual([]);
  });

  it('allows future merchant types only when the server configuration lists them', () => {
    const config = { ...DEFAULT_POST_ORDER_ADDON_CONFIG, eligibleAddonBusinessTypes: ['pharmacy'] };
    expect(filterAddonMerchantCandidates([
      merchant({ id: 'grocery' }),
      merchant({ id: 'pharmacy', businessType: 'pharmacy' })
    ], config).map(({ id }) => id)).toEqual(['pharmacy']);
  });

  it('orders pre-filtered candidates by nearest qualifying distance and uses a stable id tie-break', () => {
    const candidates = [
      merchant({ id: 'z', straightLineDistanceFromRestaurantKm: 1, distanceToRouteCorridorKm: 1 }),
      merchant({ id: 'a', straightLineDistanceFromRestaurantKm: 1, distanceToRouteCorridorKm: 1 }),
      merchant({ id: 'corridor', straightLineDistanceFromRestaurantKm: 1.5, distanceToRouteCorridorKm: 0.5 })
    ];
    expect(filterAddonMerchantCandidates(candidates, DEFAULT_POST_ORDER_ADDON_CONFIG).map(({ id }) => id))
      .toEqual(['corridor', 'a', 'z']);
  });

  it('sorts by the nearest qualifying distance rather than the farther endpoint', () => {
    const candidates = [
      merchant({ id: 'near-corridor', straightLineDistanceFromRestaurantKm: 0.8, distanceToRouteCorridorKm: 0.1 }),
      merchant({ id: 'near-restaurant', straightLineDistanceFromRestaurantKm: 0.2, distanceToRouteCorridorKm: 1.4 })
    ];
    expect(filterAddonMerchantCandidates(candidates, DEFAULT_POST_ORDER_ADDON_CONFIG).map(({ id }) => id))
      .toEqual(['near-corridor', 'near-restaurant']);
  });
});

describe('route eligibility and hot food protection', () => {
  const limits = { ...DEFAULT_POST_ORDER_ADDON_CONFIG, enabled: true };

  it('accepts a store-first route inside both detour limits', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route()],
      config: limits
    })).toMatchObject({
      eligible: true,
      route: { sequence: ['store', 'primary', 'customer'] },
      extraDistanceKm: 0.7,
      extraTimeMinutes: 3
    });
  });

  it('requires the feature flag and a valid base route', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route()],
      config: DEFAULT_POST_ORDER_ADDON_CONFIG
    })).toEqual({ eligible: false, reason: 'feature_disabled' });

    for (const [baseDistanceKm, baseTravelMinutes] of [
      [Number.NaN, 15],
      [-1, 15],
      [8, Number.POSITIVE_INFINITY],
      [8, -1]
    ]) {
      expect(chooseEligibleAddonRoute({ baseDistanceKm, baseTravelMinutes, options: [route()], config: limits }))
        .toEqual({ eligible: false, reason: 'route_unavailable' });
    }
  });

  it('treats a zero-length base route as valid and clamps a shorter addon estimate to zero detour', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 0,
      baseTravelMinutes: 0,
      options: [route({ totalDistanceKm: 0, totalTravelMinutes: 0 })],
      config: limits
    })).toMatchObject({ eligible: true, extraDistanceKm: 0, extraTimeMinutes: 0 });

    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route({ totalDistanceKm: 7.5, totalTravelMinutes: 14.5 })],
      config: limits
    })).toMatchObject({ eligible: true, extraDistanceKm: 0, extraTimeMinutes: 0 });
  });

  it('rejects a route that exceeds either the distance or time tariff', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route({ totalDistanceKm: 11.1, totalTravelMinutes: 18 })],
      config: limits
    })).toEqual({ eligible: false, reason: 'detour_too_large' });

    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route({ totalDistanceKm: 9, totalTravelMinutes: 26 })],
      config: limits
    })).toEqual({ eligible: false, reason: 'detour_too_large' });
  });

  it('rejects a post-restaurant pickup that delays hot food beyond its separate limit', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route({
        sequence: ['primary', 'store', 'customer'],
        totalDistanceKm: 8.5,
        totalTravelMinutes: 18,
        postPrimaryPickupDelayMinutes: 4
      })],
      config: limits
    })).toEqual({ eligible: false, reason: 'hot_food_delay' });
  });

  it('accepts exact detour and post-pickup boundaries', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route({
        sequence: ['primary', 'store', 'customer'],
        totalDistanceKm: 11,
        totalTravelMinutes: 25,
        postPrimaryPickupDelayMinutes: 3
      })],
      config: limits
    })).toMatchObject({ eligible: true, extraDistanceKm: 3, extraTimeMinutes: 10 });
  });

  it('does not apply post-primary hot-food delay to a store-first pickup', () => {
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [route({ postPrimaryPickupDelayMinutes: 99 })],
      config: limits
    })).toMatchObject({ eligible: true });
  });

  it('ignores malformed route options and reports when none remain', () => {
    const invalidOptions: AddonRouteOption[] = [
      route({ sequence: ['store', 'customer', 'primary'] }),
      route({ totalDistanceKm: Number.NaN }),
      route({ totalDistanceKm: -1 }),
      route({ totalTravelMinutes: Number.POSITIVE_INFINITY }),
      route({ totalTravelMinutes: -1 }),
      route({ postPrimaryPickupDelayMinutes: -1 }),
      route({ customerArrivalAtMs: Number.NaN })
    ];
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: invalidOptions,
      config: limits
    })).toEqual({ eligible: false, reason: 'route_unavailable' });
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [],
      config: limits
    })).toEqual({ eligible: false, reason: 'route_unavailable' });
  });

  it('prefers the route with earlier customer arrival and then the smaller detour', () => {
    const later = route({
      sequence: ['store', 'primary', 'customer'],
      totalDistanceKm: 8.4,
      totalTravelMinutes: 19,
      customerArrivalAtMs: Date.parse('2026-08-15T10:25:00.000Z')
    });
    const earlier = route({
      sequence: ['primary', 'store', 'customer'],
      totalDistanceKm: 9,
      totalTravelMinutes: 18,
      postPrimaryPickupDelayMinutes: 2,
      customerArrivalAtMs: Date.parse('2026-08-15T10:23:00.000Z')
    });

    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [later, earlier],
      config: limits
    })).toMatchObject({ eligible: true, route: earlier });
  });

  it('uses extra time, distance, and store-first safety as deterministic tie-breakers', () => {
    const commonArrival = Date.parse('2026-08-15T10:23:00.000Z');
    const slower = route({ totalTravelMinutes: 19, customerArrivalAtMs: commonArrival });
    const fasterFarther = route({ totalTravelMinutes: 18, totalDistanceKm: 9, customerArrivalAtMs: commonArrival });
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [slower, fasterFarther],
      config: limits
    })).toMatchObject({ eligible: true, route: fasterFarther });

    const primaryFirst = route({
      sequence: ['primary', 'store', 'customer'],
      postPrimaryPickupDelayMinutes: 1,
      customerArrivalAtMs: commonArrival
    });
    const storeFirst = route({ customerArrivalAtMs: commonArrival });
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [primaryFirst, storeFirst],
      config: limits
    })).toMatchObject({ eligible: true, route: storeFirst });
    expect(chooseEligibleAddonRoute({
      baseDistanceKm: 8,
      baseTravelMinutes: 15,
      options: [storeFirst, primaryFirst],
      config: limits
    })).toMatchObject({ eligible: true, route: storeFirst });
  });
});

describe('combined order pricing and ranking', () => {
  it('keeps merchant subtotals separate from base and addon delivery fees', () => {
    expect(calculateCombinedOrderTotal({
      merchantSubtotals: [650, 260],
      baseDeliveryFee: 150,
      addonDeliveryFee: 40
    })).toEqual({
      merchantSubtotal: 910,
      baseDeliveryFee: 150,
      addonDeliveryFee: 40,
      totalDeliveryFee: 190,
      grandTotal: 1100
    });
  });

  it('normalizes invalid money and rounds only at currency precision', () => {
    expect(calculateCombinedOrderTotal({
      merchantSubtotals: [100.005, -10, Number.NaN],
      baseDeliveryFee: Number.POSITIVE_INFINITY,
      addonDeliveryFee: 40.004
    })).toEqual({
      merchantSubtotal: 100.01,
      baseDeliveryFee: 0,
      addonDeliveryFee: 40,
      totalDeliveryFee: 40,
      grandTotal: 140.01
    });
  });

  it('ranks eligible candidates by detour, assembly, distance, then rating and caps the result', () => {
    const ranked = rankAddonMerchantCandidates([
      { merchant: merchant({ id: 'slow', assemblyMinutes: 8 }), extraTimeMinutes: 2, extraDistanceKm: 0.5 },
      { merchant: merchant({ id: 'best', assemblyMinutes: 3 }), extraTimeMinutes: 2, extraDistanceKm: 0.5 },
      { merchant: merchant({ id: 'detour' }), extraTimeMinutes: 3, extraDistanceKm: 0.2 },
      { merchant: merchant({ id: 'farther', assemblyMinutes: 3 }), extraTimeMinutes: 2, extraDistanceKm: 0.7 }
    ], 3);

    expect(ranked.map(({ merchant: candidate }) => candidate.id)).toEqual(['best', 'slow', 'farther']);
  });

  it('filters malformed ranking metrics and supports zero or fractional limits', () => {
    const candidates = [
      { merchant: merchant({ id: 'zero' }), extraTimeMinutes: 0, extraDistanceKm: 0 },
      { merchant: merchant({ id: 'bad-time' }), extraTimeMinutes: Number.NaN, extraDistanceKm: 0 },
      { merchant: merchant({ id: 'negative-time' }), extraTimeMinutes: -1, extraDistanceKm: 0 },
      { merchant: merchant({ id: 'bad-distance' }), extraTimeMinutes: 0, extraDistanceKm: Number.POSITIVE_INFINITY },
      { merchant: merchant({ id: 'negative-distance' }), extraTimeMinutes: 0, extraDistanceKm: -1 }
    ];
    expect(rankAddonMerchantCandidates(candidates, 1.9).map(({ merchant: candidate }) => candidate.id))
      .toEqual(['zero']);
    expect(rankAddonMerchantCandidates(candidates, 0)).toEqual([]);
  });

  it('applies every ranking tie-break deterministically', () => {
    const common = { extraTimeMinutes: 2, extraDistanceKm: 0.5 };
    const candidates = [
      { merchant: merchant({ id: 'z-id', assemblyMinutes: 3, straightLineDistanceFromRestaurantKm: 0.3, rating: 4.9 }), ...common },
      { merchant: merchant({ id: 'a-id', assemblyMinutes: 3, straightLineDistanceFromRestaurantKm: 0.3, rating: 4.9 }), ...common },
      { merchant: merchant({ id: 'low-rating', assemblyMinutes: 3, straightLineDistanceFromRestaurantKm: 0.3, rating: 4.5 }), ...common },
      { merchant: merchant({ id: 'far', assemblyMinutes: 3, straightLineDistanceFromRestaurantKm: 0.8, rating: 5 }), ...common },
      { merchant: merchant({ id: 'slow-assembly', assemblyMinutes: 6, straightLineDistanceFromRestaurantKm: 0.1, rating: 5 }), ...common }
    ];
    expect(rankAddonMerchantCandidates(candidates, 10).map(({ merchant: candidate }) => candidate.id))
      .toEqual(['a-id', 'z-id', 'low-rating', 'far', 'slow-assembly']);
  });

  it('returns customer-safe messages instead of internal error codes', () => {
    expect(getCombinedOrderErrorMessage('offer_expired')).toBe('К этой доставке уже нельзя добавить ещё один заказ.');
    expect(getCombinedOrderErrorMessage('addon_already_created')).toBe('Заказ магазина уже был добавлен.');
    expect(getCombinedOrderErrorMessage('route_ineligible')).toBe('Этот магазин уже нельзя добавить к текущей доставке.');
    expect(getCombinedOrderErrorMessage('merchant_unavailable')).toBe('Магазин сейчас не принимает заказы.');
    expect(getCombinedOrderErrorMessage('items_changed')).toBe('Наличие или цена товаров изменились. Проверьте корзину.');
    expect(getCombinedOrderErrorMessage('access_denied')).toBe('Не удалось подтвердить владельца заказа.');
    expect(getCombinedOrderErrorMessage('unknown')).toBe('Не удалось добавить заказ. Попробуйте ещё раз.');
  });
});
