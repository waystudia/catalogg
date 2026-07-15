import { describe, expect, it, vi } from 'vitest';
import { getDriverNavigationStage, getDriverRoutePoints } from '../../src/features/order/orderLifecycle';
import { buildMapTileGrid } from '../../src/shared/deliveryMap';
import {
  buildRoadRouteRequestUrl,
  loadRoadRoute,
  parseRoadRoutePayload
} from '../../src/shared/deliveryNavigation';

const restaurant = { lat: 43.322, lng: 45.705 };
const client = { lat: 43.318123, lng: 45.698456 };
const driver = { lat: 43.31, lng: 45.69 };

const routePayload = {
  code: 'Ok',
  routes: [{
    distance: 3450,
    duration: 482,
    geometry: {
      type: 'LineString',
      coordinates: [[45.705, 43.322], [45.701, 43.32], [45.698456, 43.318123]]
    }
  }]
} as const;

const response = (payload: unknown, ok = true) => ({
  ok,
  json: vi.fn(async () => payload)
}) as unknown as Response;

describe('delivery navigation providers', () => {
  it('keeps asymmetric x/y/z tile coordinates for street and labeled satellite layers', () => {
    const input = { center: restaurant, zoom: 16, mapSize: 320 } as const;
    const street = buildMapTileGrid({ ...input, style: 'street' });
    const satellite = buildMapTileGrid({ ...input, style: 'satellite' });

    expect(street.length).toBeGreaterThan(0);
    expect(street.map((tile) => tile.key)).toEqual(satellite.map((tile) => tile.key));
    expect(street.every((tile) => tile.url.startsWith('https://tile.openstreetmap.org/16/'))).toBe(true);
    expect(street.every((tile) => tile.overlayUrls.length === 0)).toBe(true);
    expect(satellite.every((tile) => tile.url.includes('/World_Imagery/MapServer/tile/16/'))).toBe(true);
    expect(satellite.every((tile) => tile.overlayUrls.length === 2)).toBe(true);
    const sample = satellite[0];
    if (!sample) throw new Error('Satellite tile is required for this scenario.');
    const [, x, y] = sample.key.split('-');
    expect(sample.url).toBe(
      `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/16/${y}/${x}`
    );
    expect(sample.overlayUrls).toEqual([
      `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/16/${y}/${x}`,
      `https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/16/${y}/${x}`
    ]);
  });

  it('sends OSRM longitude before latitude and trims trailing provider slashes', () => {
    expect(buildRoadRouteRequestUrl({
      baseUrl: 'https://router.example///',
      points: [restaurant, client]
    })).toBe(
      'https://router.example/route/v1/driving/45.705,43.322;45.698456,43.318123?overview=full&geometries=geojson&steps=false'
    );
  });

  it('validates and converts road geometry without swapping latitude and longitude', () => {
    expect(parseRoadRoutePayload(routePayload)).toEqual({
      success: true,
      data: {
        distanceM: 3450,
        durationS: 482,
        geometry: [restaurant, { lat: 43.32, lng: 45.701 }, client]
      }
    });
    expect(parseRoadRoutePayload({ code: 'NoRoute', routes: [] })).toEqual({
      success: false,
      error: 'Маршрут по дорогам не найден.'
    });
    expect(parseRoadRoutePayload({ code: 'Ok', routes: [] })).toEqual({
      success: false,
      error: 'Сервис маршрутов вернул некорректные данные.'
    });
    expect(parseRoadRoutePayload(null)).toEqual({
      success: false,
      error: 'Сервис маршрутов вернул некорректные данные.'
    });
    expect(parseRoadRoutePayload('NoRoute')).toEqual({
      success: false,
      error: 'Сервис маршрутов вернул некорректные данные.'
    });
  });

  it('caches the same route request and fetches again when an endpoint changes', async () => {
    const fetcher = vi.fn(async () => response(routePayload));
    const input = {
      points: [restaurant, client],
      baseUrl: 'https://route-cache.example',
      fetcher: fetcher as typeof fetch
    } as const;

    const first = await loadRoadRoute(input);
    const cached = await loadRoadRoute(input);
    const changed = await loadRoadRoute({ ...input, points: [restaurant, driver] });

    expect(first).toEqual({
      distanceM: 3450,
      durationS: 482,
      geometry: [restaurant, { lat: 43.32, lng: 45.701 }, client]
    });
    expect(cached).toBe(first);
    expect(changed).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the straight fallback available by reporting provider and input failures', async () => {
    const fetcher = vi.fn(async () => response({}, false));

    await expect(loadRoadRoute({ points: [restaurant], fetcher: fetcher as typeof fetch }))
      .rejects.toThrow('Для маршрута нужны две точки.');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(loadRoadRoute({
      points: [restaurant, client],
      baseUrl: 'https://unavailable-route.example',
      fetcher: fetcher as typeof fetch
    })).rejects.toThrow('Сервис маршрутов временно недоступен.');

    await expect(loadRoadRoute({
      points: [restaurant, client],
      baseUrl: 'https://invalid-route.example',
      fetcher: vi.fn(async () => response({ code: 'NoRoute', routes: [] })) as typeof fetch
    })).rejects.toThrow('Маршрут по дорогам не найден.');
  });

  it('uses the configured default-compatible OSRM endpoint when a base URL is omitted', async () => {
    const fetcher = vi.fn(async () => response(routePayload));

    await loadRoadRoute({
      points: [{ lat: 43.300001, lng: 45.600001 }, { lat: 43.300002, lng: 45.600002 }],
      fetcher: fetcher as typeof fetch
    });

    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(
      /^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\//
    ));
  });
});

describe('driver workflow navigation', () => {
  it('switches to the client only after pickup and keeps the restaurant confirmation boundary', () => {
    expect(getDriverNavigationStage('assigned')).toEqual({
      activeLeg: 'restaurant',
      canConfirmPickup: false,
      clientRouteAvailable: false
    });
    expect(getDriverNavigationStage('arrived_to_restaurant')).toEqual({
      activeLeg: 'restaurant',
      canConfirmPickup: true,
      clientRouteAvailable: false
    });
    expect(getDriverNavigationStage('handed_over')).toEqual({
      activeLeg: 'client',
      canConfirmPickup: false,
      clientRouteAvailable: true
    });
    expect(getDriverNavigationStage('on_the_way')).toEqual({
      activeLeg: 'client',
      canConfirmPickup: false,
      clientRouteAvailable: true
    });
    expect(getDriverNavigationStage('arrived_to_client')).toEqual({
      activeLeg: 'client',
      canConfirmPickup: false,
      clientRouteAvailable: true
    });
  });

  it('routes from the live driver point and never invents zero coordinates', () => {
    expect(getDriverRoutePoints({ status: 'assigned', driver, restaurant, client }))
      .toEqual([driver, restaurant]);
    expect(getDriverRoutePoints({ status: 'handed_over', driver, restaurant, client }))
      .toEqual([driver, client]);
    expect(getDriverRoutePoints({ status: 'assigned', driver: null, restaurant, client }))
      .toEqual([restaurant]);
    expect(getDriverRoutePoints({
      status: 'handed_over',
      driver,
      restaurant,
      client: { lat: null, lng: null }
    })).toEqual([]);
  });
});
