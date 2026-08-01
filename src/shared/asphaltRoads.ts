import type { DeliveryMapCoordinates } from './deliveryMap';

export type AsphaltRoadCorridor = {
  readonly id: string;
  readonly name: string;
  readonly points: ReadonlyArray<DeliveryMapCoordinates>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AsphaltRoadCandidate = {
  readonly corridor: AsphaltRoadCorridor;
  readonly points: ReadonlyArray<DeliveryMapCoordinates>;
  readonly asphaltDistanceM: number;
  readonly approachDistanceM: number;
};

const earthRadiusM = 6_371_000;
const toRadians = (value: number) => (value * Math.PI) / 180;

export const getCoordinateDistanceM = (from: DeliveryMapCoordinates, to: DeliveryMapCoordinates) => {
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const getPolylineDistanceM = (points: ReadonlyArray<DeliveryMapCoordinates>) =>
  points.slice(0, -1).reduce(
    (total, point, index) => total + getCoordinateDistanceM(point, points[index + 1]),
    0
  );

const isValidPoint = (point: DeliveryMapCoordinates) =>
  Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
  point.lat >= -85 && point.lat <= 85 && point.lng >= -180 && point.lng <= 180;

export const normalizeAsphaltRoadPoints = (points: ReadonlyArray<DeliveryMapCoordinates>) =>
  points
    .filter(isValidPoint)
    .map((point) => ({
      lat: Number(point.lat.toFixed(7)),
      lng: Number(point.lng.toFixed(7))
    }))
    .filter((point, index, values) => index === 0 ||
      getCoordinateDistanceM(values[index - 1], point) >= 2)
    .slice(0, 100);

export const getAsphaltRoadCandidates = (
  routePoints: ReadonlyArray<DeliveryMapCoordinates>,
  corridors: ReadonlyArray<AsphaltRoadCorridor>,
  maximumCandidates = 6
): AsphaltRoadCandidate[] => {
  if (routePoints.length < 2) return [];
  const routeStart = routePoints[0];
  const routeEnd = routePoints[routePoints.length - 1];
  const directDistanceM = Math.max(1, getCoordinateDistanceM(routeStart, routeEnd));

  return corridors.flatMap((corridor) => {
    const points = normalizeAsphaltRoadPoints(corridor.points);
    if (points.length < 2) return [];
    const forwardApproachM =
      getCoordinateDistanceM(routeStart, points[0]) +
      getCoordinateDistanceM(points[points.length - 1], routeEnd);
    const reverseApproachM =
      getCoordinateDistanceM(routeStart, points[points.length - 1]) +
      getCoordinateDistanceM(points[0], routeEnd);
    const orientedPoints = reverseApproachM < forwardApproachM ? [...points].reverse() : points;
    const approachDistanceM = Math.min(forwardApproachM, reverseApproachM);

    // Ignore remote markings so an unrelated asphalt road cannot pull a delivery
    // far away from its destination. The final router still enforces a detour cap.
    if (approachDistanceM > Math.max(2_500, directDistanceM * 1.65)) return [];

    return [{
      corridor,
      points: orientedPoints,
      asphaltDistanceM: getPolylineDistanceM(orientedPoints),
      approachDistanceM
    }];
  })
    .sort((first, second) => first.approachDistanceM - second.approachDistanceM)
    .slice(0, maximumCandidates);
};
