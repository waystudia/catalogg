import { z } from 'zod';
import type { DeliveryMapCoordinates } from './deliveryMap';

const roadRouteSchema = z.object({
  code: z.literal('Ok'),
  routes: z.array(z.object({
    distance: z.number().nonnegative(),
    duration: z.number().nonnegative(),
    geometry: z.object({
      type: z.literal('LineString'),
      coordinates: z.array(z.tuple([z.number(), z.number()])).min(2)
    })
  })).min(1)
});
const noRoadRouteSchema = z.object({ code: z.literal('NoRoute') });

export type RoadRoute = {
  readonly distanceM: number;
  readonly durationS: number;
  readonly geometry: ReadonlyArray<DeliveryMapCoordinates>;
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

export const buildRoadRouteRequestUrl = ({ baseUrl, points }: BuildRoadRouteRequestUrlInput) => {
  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(';');
  return `${baseUrl.replace(/\/+$/, '')}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
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

  return {
    success: true,
    data: {
      distanceM: route.distance,
      durationS: route.duration,
      geometry: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
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
