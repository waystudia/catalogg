import { z } from 'zod';
import { calculateBearing, type DeliveryMapCoordinates } from './deliveryMap';

const roadRouteSchema = z.object({
  code: z.literal('Ok'),
  routes: z.array(z.object({
    distance: z.number().nonnegative(),
    duration: z.number().nonnegative(),
    geometry: z.object({
      type: z.literal('LineString'),
      coordinates: z.array(z.tuple([z.number(), z.number()])).min(2)
    }),
    legs: z.array(z.object({
      steps: z.array(z.object({
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        name: z.string(),
        maneuver: z.object({
          type: z.string(),
          modifier: z.string().optional()
        })
      }))
    })).optional()
  })).min(1)
});
const noRoadRouteSchema = z.object({ code: z.literal('NoRoute') });

export type RoadRoute = {
  readonly distanceM: number;
  readonly durationS: number;
  readonly geometry: ReadonlyArray<DeliveryMapCoordinates>;
  readonly nextManeuver?: {
    readonly distanceM: number;
    readonly instruction: string;
    readonly street: string;
  };
  readonly maneuvers?: ReadonlyArray<{
    readonly distanceFromStartM: number;
    readonly instruction: string;
    readonly street: string;
  }>;
};

export type RoadRouteProgress = {
  readonly traveledDistanceM: number;
  readonly remainingDistanceM: number;
  readonly remainingDurationS: number;
  readonly snappedPosition: DeliveryMapCoordinates;
  readonly heading: number;
  readonly distanceFromRouteM: number;
  readonly isOnRoute: boolean;
  readonly nextManeuver?: RoadRoute['nextManeuver'];
};

export type DriverLocationReading = DeliveryMapCoordinates & {
  readonly accuracyM?: number | null;
  readonly heading?: number | null;
  readonly speedMps?: number | null;
  readonly recordedAtMs: number;
};

type DriverMovementAnchor = DeliveryMapCoordinates & {
  readonly accuracyM: number | null;
  readonly recordedAtMs: number;
};

export type DriverMovementState = {
  readonly anchor: DriverMovementAnchor;
  readonly lastReadingAtMs?: number;
  readonly candidateHeading: number | null;
  readonly candidateReadings: number;
  readonly heading: number | null;
  readonly isMoving: boolean;
};

export type TimedDriverLocation = DeliveryMapCoordinates & {
  readonly recordedAtMs: number;
};

type ParseRoadRouteResult =
  | { readonly success: true; readonly data: RoadRoute }
  | { readonly success: false; readonly error: string };

type BuildRoadRouteRequestUrlInput = {
  readonly baseUrl: string;
  readonly points: ReadonlyArray<DeliveryMapCoordinates>;
};

type LoadRoadRouteInput = {
  readonly points: ReadonlyArray<DeliveryMapCoordinates>;
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
};

const defaultRoadRouterUrl = import.meta.env?.VITE_ROAD_ROUTER_URL ?? 'https://router.project-osrm.org';
const routeCache = new Map<string, RoadRoute>();

const maneuverInstruction = (type: string, modifier?: string) => {
  if (type === 'roundabout' || type === 'rotary') return 'Въезжайте на круговое движение';
  if (type === 'arrive') return 'Вы прибыли';
  if (modifier === 'right') return 'Поверните направо';
  if (modifier === 'left') return 'Поверните налево';
  if (modifier === 'slight right') return 'Держитесь правее';
  if (modifier === 'slight left') return 'Держитесь левее';
  if (modifier === 'uturn') return 'Развернитесь';
  return 'Продолжайте движение';
};

const earthRadiusM = 6_371_000;
const minimumReliableMovementSpeedMps = 1.5;
const minimumReliableMovementDistanceM = 12;
const fallbackReliableMovementDistanceM = 18;
const maximumCandidateHeadingDifference = 45;
const reverseRouteHeadingDifference = 110;
const routeHeadingLookAheadM = 30;
const maximumAccurateDriverLocationM = 25;
const minimumStaleDriverCorrectionM = 60;
const toRadians = (value: number) => (value * Math.PI) / 180;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const finiteOrNull = (value: number | null | undefined) =>
  Number.isFinite(value) ? value as number : null;
const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;
const headingDifference = (first: number, second: number) =>
  Math.abs(((first - second + 540) % 360) - 180);

const distanceM = (from: DeliveryMapCoordinates, to: DeliveryMapCoordinates) => {
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const movementAnchor = (reading: DriverLocationReading): DriverMovementAnchor => ({
  lat: reading.lat,
  lng: reading.lng,
  accuracyM: finiteOrNull(reading.accuracyM),
  recordedAtMs: reading.recordedAtMs
});

export const updateDriverMovementState = (
  previous: DriverMovementState | null,
  reading: DriverLocationReading
): DriverMovementState => {
  if (!previous) {
    return {
      anchor: movementAnchor(reading),
      lastReadingAtMs: reading.recordedAtMs,
      candidateHeading: null,
      candidateReadings: 0,
      heading: null,
      isMoving: false
    };
  }

  if (previous.lastReadingAtMs === reading.recordedAtMs) return previous;

  const speedMps = finiteOrNull(reading.speedMps);
  if (speedMps !== null && speedMps < minimumReliableMovementSpeedMps) {
    return {
      ...previous,
      anchor: movementAnchor(reading),
      lastReadingAtMs: reading.recordedAtMs,
      candidateHeading: null,
      candidateReadings: 0,
      isMoving: false
    };
  }

  const reportedHeading = speedMps === null ? null : finiteOrNull(reading.heading);
  let nextHeading: number | null = reportedHeading === null ? null : normalizeHeading(reportedHeading);
  if (nextHeading === null) {
    const currentAccuracyM = finiteOrNull(reading.accuracyM);
    const requiredDistanceM = previous.anchor.accuracyM !== null && currentAccuracyM !== null
      ? Math.max(minimumReliableMovementDistanceM, previous.anchor.accuracyM + currentAccuracyM)
      : fallbackReliableMovementDistanceM;
    if (distanceM(previous.anchor, reading) < requiredDistanceM) {
      return { ...previous, lastReadingAtMs: reading.recordedAtMs, isMoving: false };
    }
    nextHeading = calculateBearing(previous.anchor, reading);
  }

  const agreesWithCandidate = previous.candidateHeading !== null &&
    headingDifference(previous.candidateHeading, nextHeading) <= maximumCandidateHeadingDifference;
  const candidateReadings = agreesWithCandidate ? previous.candidateReadings + 1 : 1;
  const isMoving = candidateReadings >= 2;

  return {
    anchor: movementAnchor(reading),
    lastReadingAtMs: reading.recordedAtMs,
    candidateHeading: nextHeading,
    candidateReadings,
    heading: isMoving ? nextHeading : previous.heading,
    isMoving
  };
};

export const resolveDriverNavigationHeading = ({
  routeHeading,
  fallbackHeading,
  movement,
  isOnRoute
}: {
  readonly routeHeading: number | null;
  readonly fallbackHeading: number;
  readonly movement: DriverMovementState | null;
  readonly isOnRoute: boolean;
}) => {
  const reliableMovementHeading = movement?.isMoving ? movement.heading : null;
  if (!isOnRoute) return reliableMovementHeading ?? fallbackHeading;
  if (reliableMovementHeading !== null && (
    routeHeading === null ||
    headingDifference(reliableMovementHeading, routeHeading) >= reverseRouteHeadingDifference
  )) {
    return reliableMovementHeading;
  }
  return routeHeading ?? fallbackHeading;
};

export const getFreshestDriverLocation = <TStored extends TimedDriverLocation, TLocal extends TimedDriverLocation>(
  stored: TStored | null,
  local: TLocal | null
): TStored | TLocal | null => {
  if (!stored) return local;
  if (!local) return stored;
  return local.recordedAtMs >= stored.recordedAtMs ? local : stored;
};

export const getMaximumDriverRouteProgressM = ({
  routeDistanceM,
  previousTraveledDistanceM,
  candidateTraveledDistanceM,
  elapsedSeconds,
  locationAccuracyM,
  isMoving,
  isOnRoute
}: {
  readonly routeDistanceM: number;
  readonly previousTraveledDistanceM: number;
  readonly candidateTraveledDistanceM: number;
  readonly elapsedSeconds: number;
  readonly locationAccuracyM?: number | null;
  readonly isMoving: boolean;
  readonly isOnRoute: boolean;
}) => {
  const safeRouteDistanceM = Math.max(0, routeDistanceM);
  const safePreviousM = clamp(previousTraveledDistanceM, 0, safeRouteDistanceM);
  const safeCandidateM = clamp(candidateTraveledDistanceM, safePreviousM, safeRouteDistanceM);
  const accuracyM = finiteOrNull(locationAccuracyM);
  const hasAccurateLocation = accuracyM !== null && accuracyM <= maximumAccurateDriverLocationM;
  const correctionDistanceM = safeCandidateM - safePreviousM;
  const isReliableStalePositionCorrection = hasAccurateLocation &&
    isOnRoute &&
    correctionDistanceM >= Math.max(minimumStaleDriverCorrectionM, accuracyM * 3);

  if ((hasAccurateLocation && isMoving) || isReliableStalePositionCorrection) {
    return safeRouteDistanceM;
  }
  if (!isMoving) return safePreviousM;
  return Math.min(
    safeRouteDistanceM,
    safePreviousM + Math.max(40, Math.max(0, elapsedSeconds) * 55)
  );
};

const interpolateCoordinates = (
  from: DeliveryMapCoordinates,
  to: DeliveryMapCoordinates,
  fraction: number
): DeliveryMapCoordinates => ({
  lat: from.lat + (to.lat - from.lat) * fraction,
  lng: from.lng + (to.lng - from.lng) * fraction
});

const getCoordinateAtGeometryDistance = (
  geometry: ReadonlyArray<DeliveryMapCoordinates>,
  targetDistanceM: number
) => {
  let traversedM = 0;
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const start = geometry[index];
    const end = geometry[index + 1];
    const segmentDistanceM = distanceM(start, end);
    if (traversedM + segmentDistanceM >= targetDistanceM || index === geometry.length - 2) {
      const fraction = segmentDistanceM === 0
        ? 0
        : clamp((targetDistanceM - traversedM) / segmentDistanceM, 0, 1);
      return {
        coordinates: interpolateCoordinates(start, end, fraction),
        heading: calculateBearing(start, end)
      };
    }
    traversedM += segmentDistanceM;
  }
  return { coordinates: geometry[0], heading: 0 };
};

export const getRemainingRoadRouteGeometry = (
  route: RoadRoute,
  traveledDistanceM: number
): ReadonlyArray<DeliveryMapCoordinates> => {
  if (route.geometry.length < 2 || traveledDistanceM <= 0) return route.geometry;

  const segmentLengthsM = route.geometry
    .slice(0, -1)
    .map((point, index) => distanceM(point, route.geometry[index + 1]));
  const geometryDistanceM = segmentLengthsM.reduce((sum, value) => sum + value, 0);
  if (geometryDistanceM === 0) return route.geometry.slice(-1);

  const targetGeometryDistanceM = geometryDistanceM * clamp(
    traveledDistanceM / Math.max(route.distanceM, 1),
    0,
    1
  );
  let elapsedGeometryM = 0;

  for (let index = 0; index < segmentLengthsM.length; index += 1) {
    const segmentDistanceM = segmentLengthsM[index];
    if (elapsedGeometryM + segmentDistanceM >= targetGeometryDistanceM) {
      const fraction = segmentDistanceM === 0
        ? 0
        : (targetGeometryDistanceM - elapsedGeometryM) / segmentDistanceM;
      return [
        interpolateCoordinates(route.geometry[index], route.geometry[index + 1], fraction),
        ...route.geometry.slice(index + 1)
      ];
    }
    elapsedGeometryM += segmentDistanceM;
  }

  return route.geometry.slice(-1);
};

export type ManeuverAnnouncementStage = '300m' | '50m' | 'turn';

export const getManeuverAnnouncementStage = (distanceToManeuverM: number): ManeuverAnnouncementStage | null => {
  if (distanceToManeuverM <= 15) return 'turn';
  if (distanceToManeuverM <= 50) return '50m';
  if (distanceToManeuverM <= 300) return '300m';
  return null;
};

type GetRoadRouteProgressInput = {
  readonly route: RoadRoute;
  readonly position: DeliveryMapCoordinates;
  readonly minimumTraveledDistanceM?: number;
  readonly maximumTraveledDistanceM?: number;
  readonly maximumSnapDistanceM?: number;
};

export const getRoadRouteProgress = ({
  route,
  position,
  minimumTraveledDistanceM = 0,
  maximumTraveledDistanceM = route.distanceM,
  maximumSnapDistanceM = 70
}: GetRoadRouteProgressInput): RoadRouteProgress => {
  const geometry = route.geometry;
  const minimumProgressM = clamp(minimumTraveledDistanceM, 0, route.distanceM);
  if (geometry.length < 2) {
    return {
      traveledDistanceM: minimumProgressM,
      remainingDistanceM: Math.max(0, route.distanceM - minimumProgressM),
      remainingDurationS: route.distanceM === 0
        ? 0
        : route.durationS * Math.max(0, route.distanceM - minimumProgressM) / route.distanceM,
      snappedPosition: position,
      heading: 0,
      distanceFromRouteM: Number.POSITIVE_INFINITY,
      isOnRoute: false,
      nextManeuver: route.nextManeuver
    };
  }

  const referenceLatitude = toRadians(position.lat);
  const toLocalPoint = (coordinates: DeliveryMapCoordinates) => ({
    x: toRadians(coordinates.lng - position.lng) * earthRadiusM * Math.cos(referenceLatitude),
    y: toRadians(coordinates.lat - position.lat) * earthRadiusM
  });
  const segmentLengthsM = geometry.slice(0, -1).map((point, index) => distanceM(point, geometry[index + 1]));
  const geometryDistanceM = segmentLengthsM.reduce((sum, value) => sum + value, 0);
  let elapsedGeometryM = 0;
  let closestDistanceM = Number.POSITIVE_INFINITY;
  let closestGeometryDistanceM = 0;

  segmentLengthsM.forEach((segmentDistanceM, index) => {
    const start = toLocalPoint(geometry[index]);
    const end = toLocalPoint(geometry[index + 1]);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = dx * dx + dy * dy;
    const fraction = denominator === 0
      ? 0
      : clamp(((-start.x) * dx + (-start.y) * dy) / denominator, 0, 1);
    const nearestX = start.x + dx * fraction;
    const nearestY = start.y + dy * fraction;
    const candidateDistanceM = Math.hypot(nearestX, nearestY);
    if (candidateDistanceM < closestDistanceM) {
      closestDistanceM = candidateDistanceM;
      closestGeometryDistanceM = elapsedGeometryM + segmentDistanceM * fraction;
    }
    elapsedGeometryM += segmentDistanceM;
  });

  const isOnRoute = closestDistanceM <= maximumSnapDistanceM;
  const candidateProgressM = geometryDistanceM === 0
    ? minimumProgressM
    : route.distanceM * closestGeometryDistanceM / geometryDistanceM;
  const traveledDistanceM = isOnRoute
    ? clamp(
      Math.max(minimumProgressM, candidateProgressM),
      minimumProgressM,
      clamp(maximumTraveledDistanceM, minimumProgressM, route.distanceM)
    )
    : minimumProgressM;
  const remainingDistanceM = Math.max(0, route.distanceM - traveledDistanceM);
  const geometryProgressM = route.distanceM === 0
    ? 0
    : geometryDistanceM * traveledDistanceM / route.distanceM;
  const snapped = getCoordinateAtGeometryDistance(geometry, geometryProgressM);
  const headingTarget = getCoordinateAtGeometryDistance(
    geometry,
    Math.min(geometryDistanceM, geometryProgressM + routeHeadingLookAheadM)
  );
  const routeHeading = distanceM(snapped.coordinates, headingTarget.coordinates) >= 1
    ? calculateBearing(snapped.coordinates, headingTarget.coordinates)
    : snapped.heading;
  const nextManeuver = route.maneuvers
    ?.find((maneuver) => maneuver.distanceFromStartM >= traveledDistanceM - 1);
  const legacyNextManeuver = !route.maneuvers && route.nextManeuver &&
    route.nextManeuver.distanceM >= traveledDistanceM - 1
    ? {
      distanceM: Math.max(0, route.nextManeuver.distanceM - traveledDistanceM),
      instruction: route.nextManeuver.instruction,
      street: route.nextManeuver.street
    }
    : undefined;

  return {
    traveledDistanceM,
    remainingDistanceM,
    remainingDurationS: route.distanceM === 0
      ? 0
      : route.durationS * remainingDistanceM / route.distanceM,
    snappedPosition: snapped.coordinates,
    heading: routeHeading,
    distanceFromRouteM: closestDistanceM,
    isOnRoute,
    ...((nextManeuver || legacyNextManeuver) ? {
      nextManeuver: nextManeuver ? {
        distanceM: Math.max(0, nextManeuver.distanceFromStartM - traveledDistanceM),
        instruction: nextManeuver.instruction,
        street: nextManeuver.street
      } : legacyNextManeuver
    } : {})
  };
};

export const buildRoadRouteRequestUrl = ({ baseUrl, points }: BuildRoadRouteRequestUrlInput) => {
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  return `${baseUrl.replace(/\/+$/, '')}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
};

export const parseRoadRoutePayload = (payload: unknown): ParseRoadRouteResult => {
  if (noRoadRouteSchema.safeParse(payload).success) {
    return { success: false, error: 'Маршрут по дорогам не найден.' };
  }

  const parsed = roadRouteSchema.safeParse(payload);
  if (!parsed.success) {
    return { success: false, error: 'Сервис маршрутов вернул некорректные данные.' };
  }

  const route = parsed.data.routes[0];
  const steps = route.legs?.flatMap((leg) => leg.steps) ?? [];
  let distanceFromStartM = 0;
  const maneuvers = steps.flatMap((step) => {
    const maneuver = step.maneuver.type === 'depart' || step.distance <= 0
      ? []
      : [{
        distanceFromStartM,
        instruction: maneuverInstruction(step.maneuver.type, step.maneuver.modifier),
        street: step.name
      }];
    distanceFromStartM += step.distance;
    return maneuver;
  });
  const nextManeuver = maneuvers[0];

  return {
    success: true,
    data: {
      distanceM: route.distance,
      durationS: route.duration,
      geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      ...(nextManeuver ? {
        nextManeuver: {
          distanceM: nextManeuver.distanceFromStartM,
          instruction: nextManeuver.instruction,
          street: nextManeuver.street
        }
      } : {}),
      ...(maneuvers.length > 0 ? { maneuvers } : {})
    }
  };
};

export const loadRoadRoute = async ({
  points,
  baseUrl = defaultRoadRouterUrl,
  fetcher = fetch
}: LoadRoadRouteInput): Promise<RoadRoute> => {
  if (points.length < 2) throw new Error('Для маршрута нужны две точки.');
  const requestUrl = buildRoadRouteRequestUrl({ baseUrl, points });
  const cachedRoute = routeCache.get(requestUrl);
  if (cachedRoute) return cachedRoute;

  const response = await fetcher(requestUrl);
  if (!response.ok) throw new Error('Сервис маршрутов временно недоступен.');
  const result = parseRoadRoutePayload(await response.json());
  if (!result.success) throw new Error(result.error);
  routeCache.set(requestUrl, result.data);
  return result.data;
};
