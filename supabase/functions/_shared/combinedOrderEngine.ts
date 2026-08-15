export type Coordinate = {
  readonly lat: number;
  readonly lng: number;
};

export type RouteMatrix = {
  readonly distances: ReadonlyArray<ReadonlyArray<number | null>>;
  readonly durations: ReadonlyArray<ReadonlyArray<number | null>>;
};

export type CombinedRouteStop = "store" | "primary" | "customer";

export type CombinedRouteEligibility =
  | {
      readonly eligible: true;
      readonly sequence: readonly [
        CombinedRouteStop,
        CombinedRouteStop,
        CombinedRouteStop,
      ];
      readonly totalDistanceKm: number;
      readonly totalTravelMinutes: number;
      readonly extraDistanceKm: number;
      readonly extraTimeMinutes: number;
      readonly postPrimaryPickupDelayMinutes: number;
      readonly customerArrivalAtMs: number;
    }
  | {
      readonly eligible: false;
      readonly reason:
        | "route_unavailable"
        | "detour_too_large"
        | "hot_food_delay";
    };

const EARTH_KM_PER_LATITUDE_DEGREE = 110.574;
const EARTH_KM_PER_LONGITUDE_DEGREE = 111.32;

const finiteCoordinate = ({ lat, lng }: Coordinate) =>
  Number.isFinite(lat) &&
  lat >= -90 &&
  lat <= 90 &&
  Number.isFinite(lng) &&
  lng >= -180 &&
  lng <= 180;

export const distanceToRouteCorridorKm = (
  start: Coordinate,
  end: Coordinate,
  point: Coordinate,
) => {
  if (![start, end, point].every(finiteCoordinate))
    return Number.POSITIVE_INFINITY;
  const averageLatitudeRadians =
    (((start.lat + end.lat + point.lat) / 3) * Math.PI) / 180;
  const longitudeScale =
    EARTH_KM_PER_LONGITUDE_DEGREE * Math.cos(averageLatitudeRadians);
  const endX = (end.lng - start.lng) * longitudeScale;
  const endY = (end.lat - start.lat) * EARTH_KM_PER_LATITUDE_DEGREE;
  const pointX = (point.lng - start.lng) * longitudeScale;
  const pointY = (point.lat - start.lat) * EARTH_KM_PER_LATITUDE_DEGREE;
  const segmentLengthSquared = endX * endX + endY * endY;
  const projection =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, (pointX * endX + pointY * endY) / segmentLengthSquared),
        );
  return Math.hypot(pointX - projection * endX, pointY - projection * endY);
};

const matrixMetric = (
  matrix: ReadonlyArray<ReadonlyArray<number | null>>,
  from: number,
  to: number,
) => {
  const value = matrix[from]?.[to];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
};

const round = (value: number, digits = 3) => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

type Sequence = readonly [
  CombinedRouteStop,
  CombinedRouteStop,
  CombinedRouteStop,
];

const defaultSequences: ReadonlyArray<Sequence> = [
  ["store", "primary", "customer"],
  ["primary", "store", "customer"],
];

export const calculateMerchantRouteEligibility = ({
  matrix,
  primaryIndex,
  customerIndex,
  storeIndex,
  courierIndex,
  nowMs,
  primaryReadyAtMs,
  storeAssemblyMinutes,
  limits,
  allowedSequences = defaultSequences,
}: {
  readonly matrix: RouteMatrix;
  readonly primaryIndex: number;
  readonly customerIndex: number;
  readonly storeIndex: number;
  readonly courierIndex?: number;
  readonly nowMs: number;
  readonly primaryReadyAtMs: number;
  readonly storeAssemblyMinutes: number;
  readonly limits: {
    readonly maxExtraDistanceKm: number;
    readonly maxExtraTimeMinutes: number;
    readonly maxPostMainPickupDelayMinutes: number;
  };
  readonly allowedSequences?: ReadonlyArray<Sequence>;
}): CombinedRouteEligibility => {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(primaryReadyAtMs) ||
    !Number.isFinite(storeAssemblyMinutes) ||
    storeAssemblyMinutes < 0
  )
    return { eligible: false, reason: "route_unavailable" };

  const originIndex = courierIndex ?? primaryIndex;
  const originToPrimaryDistance =
    courierIndex === undefined
      ? 0
      : matrixMetric(matrix.distances, originIndex, primaryIndex);
  const originToPrimaryDuration =
    courierIndex === undefined
      ? 0
      : matrixMetric(matrix.durations, originIndex, primaryIndex);
  const primaryToCustomerDistance = matrixMetric(
    matrix.distances,
    primaryIndex,
    customerIndex,
  );
  const primaryToCustomerDuration = matrixMetric(
    matrix.durations,
    primaryIndex,
    customerIndex,
  );
  if (
    originToPrimaryDistance === null ||
    originToPrimaryDuration === null ||
    primaryToCustomerDistance === null ||
    primaryToCustomerDuration === null
  )
    return { eligible: false, reason: "route_unavailable" };

  const storeReadyAtMs = nowMs + storeAssemblyMinutes * 60_000;
  const basePrimaryPickupAtMs = Math.max(
    nowMs + originToPrimaryDuration * 1000,
    primaryReadyAtMs,
  );
  const baseCustomerArrivalAtMs =
    basePrimaryPickupAtMs + primaryToCustomerDuration * 1000;
  const baseDistanceM = originToPrimaryDistance + primaryToCustomerDistance;
  const options: Array<Extract<CombinedRouteEligibility, { eligible: true }>> =
    [];

  for (const sequence of allowedSequences) {
    if (sequence.join(":") === "store:primary:customer") {
      const originToStoreDistance =
        courierIndex === undefined
          ? 0
          : matrixMetric(matrix.distances, originIndex, storeIndex);
      const originToStoreDuration =
        courierIndex === undefined
          ? 0
          : matrixMetric(matrix.durations, originIndex, storeIndex);
      const storeToPrimaryDistance = matrixMetric(
        matrix.distances,
        storeIndex,
        primaryIndex,
      );
      const storeToPrimaryDuration = matrixMetric(
        matrix.durations,
        storeIndex,
        primaryIndex,
      );
      if (
        originToStoreDistance === null ||
        originToStoreDuration === null ||
        storeToPrimaryDistance === null ||
        storeToPrimaryDuration === null
      )
        continue;
      const storePickupAtMs = Math.max(
        nowMs + originToStoreDuration * 1000,
        storeReadyAtMs,
      );
      const primaryPickupAtMs = Math.max(
        storePickupAtMs + storeToPrimaryDuration * 1000,
        primaryReadyAtMs,
      );
      const customerArrivalAtMs =
        primaryPickupAtMs + primaryToCustomerDuration * 1000;
      const totalDistanceM =
        originToStoreDistance +
        storeToPrimaryDistance +
        primaryToCustomerDistance;
      const totalTravelSeconds =
        originToStoreDuration +
        storeToPrimaryDuration +
        primaryToCustomerDuration;
      options.push({
        eligible: true,
        sequence,
        totalDistanceKm: round(totalDistanceM / 1000),
        totalTravelMinutes: round(totalTravelSeconds / 60),
        extraDistanceKm: round(
          Math.max(0, totalDistanceM - baseDistanceM) / 1000,
        ),
        extraTimeMinutes: round(
          Math.max(0, customerArrivalAtMs - baseCustomerArrivalAtMs) / 60_000,
        ),
        postPrimaryPickupDelayMinutes: 0,
        customerArrivalAtMs,
      });
      continue;
    }

    if (sequence.join(":") === "primary:store:customer") {
      const primaryToStoreDistance = matrixMetric(
        matrix.distances,
        primaryIndex,
        storeIndex,
      );
      const primaryToStoreDuration = matrixMetric(
        matrix.durations,
        primaryIndex,
        storeIndex,
      );
      const storeToCustomerDistance = matrixMetric(
        matrix.distances,
        storeIndex,
        customerIndex,
      );
      const storeToCustomerDuration = matrixMetric(
        matrix.durations,
        storeIndex,
        customerIndex,
      );
      if (
        primaryToStoreDistance === null ||
        primaryToStoreDuration === null ||
        storeToCustomerDistance === null ||
        storeToCustomerDuration === null
      )
        continue;
      const primaryPickupAtMs = basePrimaryPickupAtMs;
      const storeArrivalAtMs =
        primaryPickupAtMs + primaryToStoreDuration * 1000;
      const storePickupAtMs = Math.max(storeArrivalAtMs, storeReadyAtMs);
      const customerArrivalAtMs =
        storePickupAtMs + storeToCustomerDuration * 1000;
      const totalDistanceM =
        originToPrimaryDistance +
        primaryToStoreDistance +
        storeToCustomerDistance;
      const totalTravelSeconds =
        originToPrimaryDuration +
        primaryToStoreDuration +
        storeToCustomerDuration;
      options.push({
        eligible: true,
        sequence,
        totalDistanceKm: round(totalDistanceM / 1000),
        totalTravelMinutes: round(totalTravelSeconds / 60),
        extraDistanceKm: round(
          Math.max(0, totalDistanceM - baseDistanceM) / 1000,
        ),
        extraTimeMinutes: round(
          Math.max(0, customerArrivalAtMs - baseCustomerArrivalAtMs) / 60_000,
        ),
        postPrimaryPickupDelayMinutes: round(
          Math.max(0, storePickupAtMs - primaryPickupAtMs) / 60_000,
        ),
        customerArrivalAtMs,
      });
    }
  }

  if (options.length === 0)
    return { eligible: false, reason: "route_unavailable" };
  const insideDetour = options.filter(
    (option) =>
      option.extraDistanceKm <= limits.maxExtraDistanceKm &&
      option.extraTimeMinutes <= limits.maxExtraTimeMinutes,
  );
  if (insideDetour.length === 0)
    return { eligible: false, reason: "detour_too_large" };
  const hotFoodSafe = insideDetour.filter(
    (option) =>
      option.sequence[0] !== "primary" ||
      option.postPrimaryPickupDelayMinutes <=
        limits.maxPostMainPickupDelayMinutes,
  );
  if (hotFoodSafe.length === 0)
    return { eligible: false, reason: "hot_food_delay" };

  return hotFoodSafe.sort(
    (left, right) =>
      left.customerArrivalAtMs - right.customerArrivalAtMs ||
      left.extraTimeMinutes - right.extraTimeMinutes ||
      left.extraDistanceKm - right.extraDistanceKm ||
      Number(left.sequence[0] !== "store") -
        Number(right.sequence[0] !== "store"),
  )[0];
};
