import { getAsphaltRoadCorridors } from './api/asphaltRoadsApi';
import { getAsphaltRoadCandidates, type AsphaltRoadCorridor } from './asphaltRoads';
import type { DeliveryMapCoordinates } from './deliveryMap';
import { loadRoadRoute, type RoadRoute } from './deliveryNavigation';

type LoadAsphaltPreferredRoadRouteInput = {
  readonly points: ReadonlyArray<DeliveryMapCoordinates>;
  readonly corridors?: ReadonlyArray<AsphaltRoadCorridor>;
  readonly routeLoader?: (points: ReadonlyArray<DeliveryMapCoordinates>) => Promise<RoadRoute>;
};

export const loadAsphaltPreferredRoadRoute = async ({
  points,
  corridors,
  routeLoader = (routePoints) => loadRoadRoute({ points: routePoints })
}: LoadAsphaltPreferredRoadRouteInput): Promise<RoadRoute> => {
  const baseline = await routeLoader(points);
  const availableCorridors = corridors ?? await getAsphaltRoadCorridors().catch(() => []);
  const candidates = getAsphaltRoadCandidates(points, availableCorridors);
  if (candidates.length === 0) return baseline;

  const start = points[0];
  const end = points[points.length - 1];
  const routedCandidates = await Promise.allSettled(candidates.map(async (candidate) => ({
    candidate,
    route: await routeLoader([start, ...candidate.points, end])
  })));
  const maximumDetourM = Math.max(baseline.distanceM + 2_000, baseline.distanceM * 1.7);
  const usableCandidates = routedCandidates.flatMap((result) => {
    if (result.status !== 'fulfilled' || result.value.route.distanceM > maximumDetourM) return [];
    return [result.value];
  });

  return usableCandidates.reduce((best, value) => {
    const asphaltCreditM = Math.min(value.candidate.asphaltDistanceM, value.route.distanceM) * 0.8;
    const score = value.route.distanceM - asphaltCreditM;
    return score < best.score ? { route: value.route, score } : best;
  }, { route: baseline, score: baseline.distanceM }).route;
};
