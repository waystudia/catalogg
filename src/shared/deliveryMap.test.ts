import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMapTileGrid,
  buildOsmTileGrid,
  calculateBearing,
  getMapCenter,
  getMapZoomForPoints,
  mapPointToCoordinates,
  coordinatesToMapPoint,
  rotateMapDelta,
  rotateMapPoint,
  type DeliveryMapPoint
} from './deliveryMap';
import { buildRoadRouteRequestUrl, parseRoadRoutePayload } from './deliveryNavigation';

describe('delivery map picker geometry', () => {
  it('centers a tracking map on all available delivery points', () => {
    assert.deepEqual(
      getMapCenter([
        { lat: 43.3, lng: 45.7 },
        { lat: 43.4, lng: 45.9 },
        { lat: null, lng: null }
      ]),
      { lat: 43.35, lng: 45.8 }
    );
  });

  it('zooms out for a delivery that spans different settlements', () => {
    assert.equal(
      getMapZoomForPoints([
        { lat: 43.3184, lng: 45.6927 },
        { lat: 43.7234, lng: 46.1102 }
      ]),
      11
    );
  });

  it('round-trips delivery coordinates through a map point', () => {
    const center = { lat: 43.3181235, lng: 45.6987654 };
    const point = coordinatesToMapPoint(center, center, 16, 320);
    const next = mapPointToCoordinates(point, center, 16, 320);

    assert.deepEqual(point, { x: 160, y: 160 });
    assert.equal(Number(next.lat.toFixed(7)), center.lat);
    assert.equal(Number(next.lng.toFixed(7)), center.lng);
  });

  it('calculates driver heading bearings for a map arrow', () => {
    assert.equal(Math.round(calculateBearing({ lat: 43, lng: 45 }, { lat: 44, lng: 45 })), 0);
    assert.equal(Math.round(calculateBearing({ lat: 43, lng: 45 }, { lat: 43, lng: 46 })), 90);
    assert.equal(Math.round(calculateBearing({ lat: 43, lng: 45 }, { lat: 42, lng: 45 })), 180);
  });

  it('rotates projected map points around the viewport center', () => {
    const point = rotateMapPoint({ x: 160, y: 60 }, 90, { x: 160, y: 160 });

    assert.deepEqual({ x: Math.round(point.x), y: Math.round(point.y) }, { x: 260, y: 160 });
  });

  it('converts a screen drag into the rotated map coordinate space', () => {
    const delta = rotateMapDelta({ x: 0, y: 10 }, -90);

    assert.deepEqual({ x: Math.round(delta.x), y: Math.round(delta.y) }, { x: 10, y: 0 });
  });

  it('clamps dragged markers inside the map viewport', () => {
    const center = { lat: 43.3181235, lng: 45.6987654 };
    const point: DeliveryMapPoint = { x: 400, y: -40 };

    assert.deepEqual(coordinatesToMapPoint(mapPointToCoordinates(point, center, 16, 320), center, 16, 320), {
      x: 320,
      y: 0
    });
  });

  it('can project tracking routes outside the viewport without pinning them to the edge', () => {
    const center = { lat: 43.3181235, lng: 45.6987654 };
    const point = coordinatesToMapPoint(
      { lat: 43.38, lng: 45.6987654 },
      center,
      16,
      320,
      { clampToViewport: false }
    );

    assert.equal(point.y < 0, true);
  });

  it('builds a non-empty free OSM tile grid around the current point', () => {
    const tiles = buildOsmTileGrid({ lat: 43.3181235, lng: 45.6987654 }, 16, 320);

    assert.equal(tiles.length > 0, true);
    assert.equal(tiles.every((tile) => tile.url.startsWith('https://tile.openstreetmap.org/16/')), true);
  });

  it('builds a labeled satellite tile stack without changing tile coordinates', () => {
    const tiles = buildMapTileGrid({
      center: { lat: 43.3181235, lng: 45.6987654 },
      zoom: 16,
      mapSize: 320,
      style: 'satellite'
    });

    assert.equal(tiles.length > 0, true);
    assert.equal(
      tiles.every((tile) => tile.url.includes('/World_Imagery/MapServer/tile/16/')),
      true
    );
    assert.equal(
      tiles.every((tile) => tile.overlayUrls.some((url) => url.includes('/World_Transportation/MapServer/tile/16/'))),
      true
    );
    assert.equal(
      tiles.every((tile) => tile.overlayUrls.some((url) => url.includes('/World_Boundaries_and_Places/MapServer/tile/16/'))),
      true
    );
  });

  it('adds offscreen tile buffer while zooming between tile levels', () => {
    const tiles = buildMapTileGrid({
      center: { lat: 43.3181235, lng: 45.6987654 },
      zoom: 16.5,
      mapSize: 320,
      style: 'satellite'
    });

    assert.equal(tiles.length > 9, true);
    assert.equal(Math.min(...tiles.map((tile) => tile.x)) < 0, true);
    assert.equal(Math.max(...tiles.map((tile) => tile.x + (tile.size ?? 256))) > 320, true);
    assert.equal(Math.min(...tiles.map((tile) => tile.y)) < 0, true);
    assert.equal(Math.max(...tiles.map((tile) => tile.y + (tile.size ?? 256))) > 320, true);
  });

  it('builds a road-route request with longitude before latitude', () => {
    assert.equal(
      buildRoadRouteRequestUrl({
        baseUrl: 'https://router.project-osrm.org',
        points: [
          { lat: 43.322, lng: 45.705 },
          { lat: 43.318123, lng: 45.698456 }
        ]
      }),
      'https://router.project-osrm.org/route/v1/driving/45.705,43.322;45.698456,43.318123?overview=full&geometries=geojson&steps=false'
    );
  });

  it('validates and converts road geometry into map coordinates', () => {
    assert.deepEqual(
      parseRoadRoutePayload({
        code: 'Ok',
        routes: [{
          distance: 3450,
          duration: 482,
          geometry: {
            type: 'LineString',
            coordinates: [[45.705, 43.322], [45.701, 43.32], [45.698456, 43.318123]]
          }
        }]
      }),
      {
        success: true,
        data: {
          distanceM: 3450,
          durationS: 482,
          geometry: [
            { lat: 43.322, lng: 45.705 },
            { lat: 43.32, lng: 45.701 },
            { lat: 43.318123, lng: 45.698456 }
          ]
        }
      }
    );
  });

  it('rejects empty and malformed road-route responses', () => {
    assert.deepEqual(parseRoadRoutePayload({ code: 'NoRoute', routes: [] }), {
      success: false,
      error: 'Маршрут по дорогам не найден.'
    });
    assert.deepEqual(parseRoadRoutePayload({ code: 'Ok', routes: [{ geometry: null }] }), {
      success: false,
      error: 'Сервис маршрутов вернул некорректные данные.'
    });
  });
});
