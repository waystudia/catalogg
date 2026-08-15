export type OrderGroupStatus = 'active' | 'completed' | 'cancelled';

export type MerchantOrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'completed'
  | 'cancelled';

export type AddonOfferStatus =
  | 'evaluating'
  | 'available'
  | 'viewed'
  | 'used'
  | 'expired'
  | 'ineligible'
  | 'cancelled';

export type DeliveryStopStatus = 'pending' | 'arrived' | 'completed' | 'skipped' | 'cancelled';

export type PostOrderAddonConfig = {
  readonly enabled: boolean;
  readonly offerWindowMinutes: number;
  readonly addonDeliveryFee: number;
  readonly maxExtraDistanceKm: number;
  readonly maxExtraTimeMinutes: number;
  readonly maxPostMainPickupDelayMinutes: number;
  readonly maxAdditionalMerchants: number;
  readonly candidateStoreRadiusKm: number;
  readonly routeCorridorKm: number;
  readonly maxRouteCandidates: number;
  readonly maxShownMerchants: number;
  readonly eligibleAddonBusinessTypes?: ReadonlyArray<string>;
};

export const DEFAULT_POST_ORDER_ADDON_CONFIG = {
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
} as const satisfies PostOrderAddonConfig;

export type AddonMerchantCandidate = {
  readonly id: string;
  readonly businessType: string;
  readonly isActive: boolean;
  readonly isOpen: boolean;
  readonly acceptsOrders: boolean;
  readonly supportsWayyaamDelivery: boolean;
  readonly hasAvailableItems: boolean;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly assemblyMinutes: number;
  readonly rating: number;
  readonly straightLineDistanceFromRestaurantKm: number;
  readonly distanceToRouteCorridorKm: number;
};

export type AddonRouteStop = 'store' | 'primary' | 'customer';

export type AddonRouteOption = {
  readonly sequence: readonly [AddonRouteStop, AddonRouteStop, AddonRouteStop];
  readonly totalDistanceKm: number;
  readonly totalTravelMinutes: number;
  readonly postPrimaryPickupDelayMinutes: number;
  readonly customerArrivalAtMs: number;
};

export type AddonOfferWindowInput = {
  readonly nowMs: number;
  readonly expiresAtMs: number;
  readonly offerStatus: AddonOfferStatus;
  readonly mainOrderStatus: MerchantOrderStatus;
  readonly deliveryStatus: string;
  readonly completedPickupCount: number;
  readonly additionalMerchantCount: number;
  readonly maxAdditionalMerchants: number;
};

export type AddonOfferWindowReason =
  | 'offer_expired'
  | 'offer_already_used'
  | 'offer_not_available'
  | 'main_order_inactive'
  | 'delivery_critical_point_passed'
  | 'merchant_limit_reached';

export type AddonOfferWindowResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AddonOfferWindowReason };

const inactiveMainOrderStatuses = new Set<MerchantOrderStatus>([
  'picked_up',
  'completed',
  'cancelled'
]);

const criticalDeliveryStatuses = new Set([
  'handed_over',
  'on_the_way',
  'arrived_to_client',
  'delivered',
  'failed',
  'canceled',
  'cancelled'
]);

export const evaluateAddonOfferWindow = (
  input: AddonOfferWindowInput
): AddonOfferWindowResult => {
  if (!Number.isFinite(input.nowMs) || !Number.isFinite(input.expiresAtMs) || input.nowMs >= input.expiresAtMs) {
    return { allowed: false, reason: 'offer_expired' };
  }
  if (input.offerStatus === 'used') {
    return { allowed: false, reason: 'offer_already_used' };
  }
  if (input.offerStatus !== 'available' && input.offerStatus !== 'viewed') {
    return { allowed: false, reason: 'offer_not_available' };
  }
  if (inactiveMainOrderStatuses.has(input.mainOrderStatus)) {
    return { allowed: false, reason: 'main_order_inactive' };
  }
  if (input.completedPickupCount > 0 || criticalDeliveryStatuses.has(input.deliveryStatus)) {
    return { allowed: false, reason: 'delivery_critical_point_passed' };
  }
  if (input.additionalMerchantCount >= input.maxAdditionalMerchants) {
    return { allowed: false, reason: 'merchant_limit_reached' };
  }
  return { allowed: true };
};

const isFiniteCoordinate = (value: number | null, min: number, max: number) =>
  Number.isFinite(value) && value !== null && value >= min && value <= max;

const normalizedDistance = (value: number) => Number.isFinite(value) && value >= 0
  ? value
  : Number.POSITIVE_INFINITY;

export const filterAddonMerchantCandidates = (
  candidates: ReadonlyArray<AddonMerchantCandidate>,
  config: PostOrderAddonConfig
): AddonMerchantCandidate[] => {
  const eligibleBusinessTypes = new Set(config.eligibleAddonBusinessTypes ?? ['grocery']);

  return candidates
    .filter((candidate) => (
      eligibleBusinessTypes.has(candidate.businessType)
      && candidate.isActive
      && candidate.isOpen
      && candidate.acceptsOrders
      && candidate.supportsWayyaamDelivery
      && candidate.hasAvailableItems
      && isFiniteCoordinate(candidate.latitude, -90, 90)
      && isFiniteCoordinate(candidate.longitude, -180, 180)
      && Number.isFinite(candidate.assemblyMinutes)
      && candidate.assemblyMinutes >= 0
      && (
        normalizedDistance(candidate.straightLineDistanceFromRestaurantKm) <= config.candidateStoreRadiusKm
        || normalizedDistance(candidate.distanceToRouteCorridorKm) <= config.routeCorridorKm
      )
    ))
    .sort((left, right) => {
      const leftDistance = Math.min(
        normalizedDistance(left.straightLineDistanceFromRestaurantKm),
        normalizedDistance(left.distanceToRouteCorridorKm)
      );
      const rightDistance = Math.min(
        normalizedDistance(right.straightLineDistanceFromRestaurantKm),
        normalizedDistance(right.distanceToRouteCorridorKm)
      );
      return leftDistance - rightDistance || left.id.localeCompare(right.id);
    })
    .slice(0, Math.max(0, Math.floor(config.maxRouteCandidates)));
};

export type AddonRouteEligibilityReason =
  | 'feature_disabled'
  | 'route_unavailable'
  | 'detour_too_large'
  | 'hot_food_delay';

export type AddonRouteEligibility =
  | {
    readonly eligible: true;
    readonly route: AddonRouteOption;
    readonly extraDistanceKm: number;
    readonly extraTimeMinutes: number;
  }
  | { readonly eligible: false; readonly reason: AddonRouteEligibilityReason };

const roundMetric = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

const isValidRouteOption = (option: AddonRouteOption) => {
  const sequence = option.sequence.join(':');
  return (
    sequence === 'store:primary:customer'
    || sequence === 'primary:store:customer'
  )
    && Number.isFinite(option.totalDistanceKm)
    && option.totalDistanceKm >= 0
    && Number.isFinite(option.totalTravelMinutes)
    && option.totalTravelMinutes >= 0
    && Number.isFinite(option.postPrimaryPickupDelayMinutes)
    && option.postPrimaryPickupDelayMinutes >= 0
    && Number.isFinite(option.customerArrivalAtMs);
};

export const chooseEligibleAddonRoute = ({
  baseDistanceKm,
  baseTravelMinutes,
  options,
  config
}: {
  readonly baseDistanceKm: number;
  readonly baseTravelMinutes: number;
  readonly options: ReadonlyArray<AddonRouteOption>;
  readonly config: PostOrderAddonConfig;
}): AddonRouteEligibility => {
  if (!config.enabled) return { eligible: false, reason: 'feature_disabled' };
  if (
    !Number.isFinite(baseDistanceKm)
    || baseDistanceKm < 0
    || !Number.isFinite(baseTravelMinutes)
    || baseTravelMinutes < 0
  ) {
    return { eligible: false, reason: 'route_unavailable' };
  }

  const evaluated = options
    .filter(isValidRouteOption)
    .map((option) => ({
      option,
      extraDistanceKm: roundMetric(Math.max(0, option.totalDistanceKm - baseDistanceKm)),
      extraTimeMinutes: roundMetric(Math.max(0, option.totalTravelMinutes - baseTravelMinutes)),
      hotFoodSafe: option.sequence[0] !== 'primary'
        || option.postPrimaryPickupDelayMinutes <= config.maxPostMainPickupDelayMinutes
    }));

  if (evaluated.length === 0) return { eligible: false, reason: 'route_unavailable' };

  const insideDetour = evaluated.filter(({ extraDistanceKm, extraTimeMinutes }) => (
    extraDistanceKm <= config.maxExtraDistanceKm
    && extraTimeMinutes <= config.maxExtraTimeMinutes
  ));
  if (insideDetour.length === 0) return { eligible: false, reason: 'detour_too_large' };

  const eligible = insideDetour
    .filter(({ hotFoodSafe }) => hotFoodSafe)
    .sort((left, right) => (
      left.option.customerArrivalAtMs - right.option.customerArrivalAtMs
      || left.extraTimeMinutes - right.extraTimeMinutes
      || left.extraDistanceKm - right.extraDistanceKm
      || Number(left.option.sequence[0] !== 'store') - Number(right.option.sequence[0] !== 'store')
    ));

  const best = eligible[0];
  if (!best) return { eligible: false, reason: 'hot_food_delay' };
  return {
    eligible: true,
    route: best.option,
    extraDistanceKm: best.extraDistanceKm,
    extraTimeMinutes: best.extraTimeMinutes
  };
};

const normalizeMoney = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
};

export const calculateCombinedOrderTotal = ({
  merchantSubtotals,
  baseDeliveryFee,
  addonDeliveryFee
}: {
  readonly merchantSubtotals: ReadonlyArray<number>;
  readonly baseDeliveryFee: number;
  readonly addonDeliveryFee: number;
}) => {
  const merchantSubtotal = normalizeMoney(
    merchantSubtotals.reduce((total, subtotal) => total + normalizeMoney(subtotal), 0)
  );
  const normalizedBaseDeliveryFee = normalizeMoney(baseDeliveryFee);
  const normalizedAddonDeliveryFee = normalizeMoney(addonDeliveryFee);
  const totalDeliveryFee = normalizeMoney(normalizedBaseDeliveryFee + normalizedAddonDeliveryFee);
  return {
    merchantSubtotal,
    baseDeliveryFee: normalizedBaseDeliveryFee,
    addonDeliveryFee: normalizedAddonDeliveryFee,
    totalDeliveryFee,
    grandTotal: normalizeMoney(merchantSubtotal + totalDeliveryFee)
  } as const;
};

export type RankedAddonMerchantCandidate = {
  readonly merchant: AddonMerchantCandidate;
  readonly extraTimeMinutes: number;
  readonly extraDistanceKm: number;
};

export const rankAddonMerchantCandidates = (
  candidates: ReadonlyArray<RankedAddonMerchantCandidate>,
  limit: number
) => candidates
  .filter(({ extraTimeMinutes, extraDistanceKm }) => (
    Number.isFinite(extraTimeMinutes)
    && extraTimeMinutes >= 0
    && Number.isFinite(extraDistanceKm)
    && extraDistanceKm >= 0
  ))
  .sort((left, right) => (
    left.extraTimeMinutes - right.extraTimeMinutes
    || left.extraDistanceKm - right.extraDistanceKm
    || left.merchant.assemblyMinutes - right.merchant.assemblyMinutes
    || left.merchant.straightLineDistanceFromRestaurantKm - right.merchant.straightLineDistanceFromRestaurantKm
    || right.merchant.rating - left.merchant.rating
    || left.merchant.id.localeCompare(right.merchant.id)
  ))
  .slice(0, Math.max(0, Math.floor(limit)));

export type CombinedOrderErrorCode =
  | 'offer_expired'
  | 'addon_already_created'
  | 'route_ineligible'
  | 'merchant_unavailable'
  | 'items_changed'
  | 'access_denied'
  | 'unknown';

const combinedOrderErrorMessages: Record<CombinedOrderErrorCode, string> = {
  offer_expired: 'К этой доставке уже нельзя добавить ещё один заказ.',
  addon_already_created: 'Заказ магазина уже был добавлен.',
  route_ineligible: 'Этот магазин уже нельзя добавить к текущей доставке.',
  merchant_unavailable: 'Магазин сейчас не принимает заказы.',
  items_changed: 'Наличие или цена товаров изменились. Проверьте корзину.',
  access_denied: 'Не удалось подтвердить владельца заказа.',
  unknown: 'Не удалось добавить заказ. Попробуйте ещё раз.'
};

export const getCombinedOrderErrorMessage = (code: CombinedOrderErrorCode) =>
  combinedOrderErrorMessages[code];
