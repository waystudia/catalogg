import { describe, expect, it, vi } from 'vitest';
import { getDriverNavigationStage, getDriverRoutePoints } from '../../src/features/order/orderLifecycle';
import { buildMapTileGrid } from '../../src/shared/deliveryMap';
import {
  buildRoadRouteRequestUrl,
  getFreshestDriverLocation,
  getRoadRouteProgress,
  loadRoadRoute,
  parseRoadRoutePayload,
  resolveDriverNavigationHeading,
  updateDriverMovementState,
  type RoadRoute
} from '../../src/shared/deliveryNavigation';

const restaurant = { lat: 43.322, lng: 45.705 };
const client = { lat: 43.318123, lng: 45.698456 };
const driver = { lat: 43.31, lng: 45.69 };
const latitudeMeters = (meters: number) => 43 + (meters / 6_371_000) * (180 / Math.PI);

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
  it('keeps stationary GPS noise from becoming a camera heading', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: 12,
      speedMps: 0,
      heading: null,
      recordedAtMs: 1_000
    });
    const noisy = updateDriverMovementState(initial, {
      lat: 43.00014,
      lng: 45,
      accuracyM: 12,
      speedMps: 0,
      heading: 180,
      recordedAtMs: 6_000
    });

    expect(initial.isMoving).toBe(false);
    expect(noisy.isMoving).toBe(false);
    expect(noisy.heading).toBeNull();
    expect(noisy.candidateReadings).toBe(0);
    expect(noisy.anchor.lat).toBe(43.00014);
    expect(resolveDriverNavigationHeading({
      routeHeading: 90,
      fallbackHeading: 15,
      movement: noisy,
      isOnRoute: true
    })).toBe(90);
  });

  it('does not trust a reported course when speed is unavailable and the position did not move', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: 10,
      speedMps: null,
      heading: 90,
      recordedAtMs: 1_000
    });
    const staleCourse = updateDriverMovementState(initial, {
      lat: 43,
      lng: 45,
      accuracyM: 10,
      speedMps: null,
      heading: 90,
      recordedAtMs: 6_000
    });

    expect(staleCourse.isMoving).toBe(false);
    expect(staleCourse.candidateReadings).toBe(0);
    expect(staleCourse.heading).toBeNull();
  });

  it('uses the reported course at the moving-speed boundary and normalizes its angle', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: 5,
      speedMps: 1.5,
      heading: 450,
      recordedAtMs: 1_000
    });
    const first = updateDriverMovementState(initial, {
      lat: 43,
      lng: 45.0003,
      accuracyM: 5,
      speedMps: 1.5,
      heading: 450,
      recordedAtMs: 6_000
    });
    const confirmed = updateDriverMovementState(first, {
      lat: 43,
      lng: 45.0006,
      accuracyM: 5,
      speedMps: 1.5,
      heading: 450,
      recordedAtMs: 11_000
    });

    expect(first.candidateHeading).toBe(90);
    expect(confirmed.isMoving).toBe(true);
    expect(confirmed.heading).toBe(90);
  });

  it('requires displacement beyond the combined GPS accuracy before deriving a course', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: 8,
      speedMps: null,
      heading: null,
      recordedAtMs: 1_000
    });
    const insideAccuracy = updateDriverMovementState(initial, {
      lat: latitudeMeters(15),
      lng: 45,
      accuracyM: 8,
      speedMps: null,
      heading: null,
      recordedAtMs: 6_000
    });
    const outsideAccuracy = updateDriverMovementState(insideAccuracy, {
      lat: latitudeMeters(17),
      lng: 45,
      accuracyM: 8,
      speedMps: null,
      heading: null,
      recordedAtMs: 11_000
    });

    expect(insideAccuracy.candidateReadings).toBe(0);
    expect(insideAccuracy.isMoving).toBe(false);
    expect(outsideAccuracy.candidateReadings).toBe(1);
    expect(outsideAccuracy.candidateHeading).toBeCloseTo(0, 0);
  });

  it('uses the conservative fallback distance when GPS accuracy is unavailable', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: null,
      speedMps: null,
      heading: null,
      recordedAtMs: 1_000
    });
    const tooClose = updateDriverMovementState(initial, {
      lat: latitudeMeters(17),
      lng: 45,
      speedMps: null,
      heading: null,
      recordedAtMs: 6_000
    });
    const farEnough = updateDriverMovementState(tooClose, {
      lat: latitudeMeters(19),
      lng: 45,
      accuracyM: 5,
      speedMps: null,
      heading: null,
      recordedAtMs: 11_000
    });
    const onlyCurrentAccuracy = updateDriverMovementState(initial, {
      lat: latitudeMeters(15),
      lng: 45,
      accuracyM: 5,
      speedMps: null,
      heading: null,
      recordedAtMs: 16_000
    });
    const onlyPreviousAccuracy = updateDriverMovementState({
      ...initial,
      anchor: { ...initial.anchor, accuracyM: 5 }
    }, {
      lat: latitudeMeters(15),
      lng: 45,
      accuracyM: null,
      speedMps: null,
      heading: null,
      recordedAtMs: 16_000
    });

    expect(tooClose.candidateReadings).toBe(0);
    expect(farEnough.candidateReadings).toBe(1);
    expect(onlyCurrentAccuracy.candidateReadings).toBe(0);
    expect(onlyPreviousAccuracy.candidateReadings).toBe(0);
  });

  it('rejects invalid sensor numbers instead of treating them as motion', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: Number.NaN,
      speedMps: Number.NaN,
      heading: Number.POSITIVE_INFINITY,
      recordedAtMs: 1_000
    });
    const unchanged = updateDriverMovementState(initial, {
      lat: 43,
      lng: 45,
      accuracyM: Number.POSITIVE_INFINITY,
      speedMps: Number.NaN,
      heading: Number.NaN,
      recordedAtMs: 6_000
    });

    expect(initial.anchor.accuracyM).toBeNull();
    expect(unchanged.candidateReadings).toBe(0);
    expect(unchanged.isMoving).toBe(false);
  });

  it('accepts candidate headings at the agreement boundary but not beyond it', () => {
    const previous = {
      anchor: { lat: 43, lng: 45, accuracyM: 5, recordedAtMs: 1_000 },
      lastReadingAtMs: 1_000,
      candidateHeading: 0,
      candidateReadings: 1,
      heading: null,
      isMoving: false
    } as const;
    const boundary = updateDriverMovementState(previous, {
      lat: 43.0003,
      lng: 45,
      accuracyM: 5,
      speedMps: 2,
      heading: 45,
      recordedAtMs: 6_000
    });
    const beyond = updateDriverMovementState(previous, {
      lat: 43.0003,
      lng: 45,
      accuracyM: 5,
      speedMps: 2,
      heading: 45.1,
      recordedAtMs: 6_000
    });

    expect(boundary.isMoving).toBe(true);
    expect(boundary.candidateReadings).toBe(2);
    expect(beyond.isMoving).toBe(false);
    expect(beyond.candidateReadings).toBe(1);
  });

  it('confirms consistent real movement but rejects a single conflicting jump', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: 5,
      speedMps: null,
      heading: null,
      recordedAtMs: 1_000
    });
    const firstEast = updateDriverMovementState(initial, {
      lat: 43,
      lng: 45.0004,
      accuracyM: 5,
      speedMps: null,
      heading: null,
      recordedAtMs: 6_000
    });
    const secondEast = updateDriverMovementState(firstEast, {
      lat: 43,
      lng: 45.0008,
      accuracyM: 5,
      speedMps: null,
      heading: null,
      recordedAtMs: 11_000
    });
    const conflictingNorth = updateDriverMovementState(secondEast, {
      lat: 43.0004,
      lng: 45.0008,
      accuracyM: 5,
      speedMps: null,
      heading: null,
      recordedAtMs: 16_000
    });

    expect(firstEast.isMoving).toBe(false);
    expect(secondEast.isMoving).toBe(true);
    expect(secondEast.heading).toBeCloseTo(90, 0);
    expect(conflictingNorth.isMoving).toBe(false);
    expect(conflictingNorth.heading).toBeCloseTo(90, 0);
  });

  it('does not confirm the same geolocation reading twice after a React rerender', () => {
    const initial = updateDriverMovementState(null, {
      lat: 43,
      lng: 45,
      accuracyM: 5,
      speedMps: 5,
      heading: 90,
      recordedAtMs: 1_000
    });
    const firstReading = updateDriverMovementState(initial, {
      lat: 43,
      lng: 45.0002,
      accuracyM: 5,
      speedMps: 5,
      heading: 90,
      recordedAtMs: 6_000
    });
    const duplicate = updateDriverMovementState(firstReading, {
      lat: 43,
      lng: 45.0002,
      accuracyM: 5,
      speedMps: 5,
      heading: 90,
      recordedAtMs: 6_000
    });

    expect(firstReading.isMoving).toBe(false);
    expect(duplicate.isMoving).toBe(false);
    expect(duplicate.candidateReadings).toBe(1);
  });

  it('uses reliable reverse movement only when it truly opposes the road', () => {
    const movement = {
      anchor: { lat: 43, lng: 45, accuracyM: 5, recordedAtMs: 10_000 },
      candidateHeading: 270,
      candidateReadings: 2,
      heading: 270,
      isMoving: true
    } as const;

    expect(resolveDriverNavigationHeading({
      routeHeading: 90,
      fallbackHeading: 0,
      movement,
      isOnRoute: true
    })).toBe(270);
    expect(resolveDriverNavigationHeading({
      routeHeading: 100,
      fallbackHeading: 0,
      movement: { ...movement, heading: 80 },
      isOnRoute: true
    })).toBe(100);
    expect(resolveDriverNavigationHeading({
      routeHeading: 90,
      fallbackHeading: 0,
      movement: { ...movement, isMoving: false },
      isOnRoute: false
    })).toBe(0);
    expect(resolveDriverNavigationHeading({
      routeHeading: null,
      fallbackHeading: 15,
      movement,
      isOnRoute: true
    })).toBe(270);
    expect(resolveDriverNavigationHeading({
      routeHeading: 90,
      fallbackHeading: 15,
      movement: { ...movement, heading: 200 },
      isOnRoute: true
    })).toBe(200);
    expect(resolveDriverNavigationHeading({
      routeHeading: 90,
      fallbackHeading: 15,
      movement: { ...movement, heading: 199 },
      isOnRoute: true
    })).toBe(90);
    expect(resolveDriverNavigationHeading({
      routeHeading: null,
      fallbackHeading: 15,
      movement: null,
      isOnRoute: true
    })).toBe(15);
  });

  it('keeps the freshest local or server driver position', () => {
    const stored = { lat: 43, lng: 45, recordedAtMs: 5_000 };
    const local = { lat: 43.1, lng: 45.1, recordedAtMs: 10_000 };

    expect(getFreshestDriverLocation(stored, local)).toBe(local);
    expect(getFreshestDriverLocation({ ...stored, recordedAtMs: 15_000 }, local)?.lat).toBe(43);
    expect(getFreshestDriverLocation({ ...stored, recordedAtMs: 10_000 }, local)).toBe(local);
    expect(getFreshestDriverLocation(null, local)).toBe(local);
    expect(getFreshestDriverLocation(stored, null)).toBe(stored);
  });

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
      'https://router.example/route/v1/driving/45.705,43.322;45.698456,43.318123?overview=full&geometries=geojson&steps=true'
    );
  });

  it('exposes the next useful road maneuver for the driver navigation card', () => {
    expect(parseRoadRoutePayload({
      ...routePayload,
      routes: [{
        ...routePayload.routes[0],
        legs: [{
          steps: [
            {
              distance: 12,
              duration: 0,
              name: '',
              maneuver: { type: 'depart', modifier: 'straight' }
            },
            {
              distance: 0,
              duration: 0,
              name: 'служебный проезд',
              maneuver: { type: 'turn', modifier: 'left' }
            },
            {
              distance: 220,
              duration: 38,
              name: 'ул. Ленина',
              maneuver: { type: 'turn', modifier: 'right' }
            }
          ]
        }]
      }]
    })).toEqual({
      success: true,
      data: {
        distanceM: 3450,
        durationS: 482,
        geometry: [restaurant, { lat: 43.32, lng: 45.701 }, client],
        nextManeuver: {
          distanceM: 12,
          instruction: 'Поверните направо',
          street: 'ул. Ленина'
        },
        maneuvers: [{
          distanceFromStartM: 12,
          instruction: 'Поверните направо',
          street: 'ул. Ленина'
        }]
      }
    });
  });

  it.each([
    ['roundabout', undefined, 'Въезжайте на круговое движение'],
    ['rotary', undefined, 'Въезжайте на круговое движение'],
    ['arrive', undefined, 'Вы прибыли'],
    ['turn', 'left', 'Поверните налево'],
    ['turn', 'slight right', 'Держитесь правее'],
    ['turn', 'slight left', 'Держитесь левее'],
    ['turn', 'uturn', 'Развернитесь'],
    ['continue', 'straight', 'Продолжайте движение']
  ] as const)('formats %s/%s as a Russian navigation instruction', (type, modifier, instruction) => {
    const result = parseRoadRoutePayload({
      ...routePayload,
      routes: [{
        ...routePayload.routes[0],
        legs: [{
          steps: [{
            distance: 135,
            duration: 20,
            name: 'тестовая улица',
            maneuver: { type, ...(modifier ? { modifier } : {}) }
          }]
        }]
      }]
    });

    expect(result).toEqual({
      success: true,
      data: {
        distanceM: 3450,
        durationS: 482,
        geometry: [restaurant, { lat: 43.32, lng: 45.701 }, client],
        nextManeuver: {
          distanceM: 0,
          instruction,
          street: 'тестовая улица'
        },
        maneuvers: [{
          distanceFromStartM: 0,
          instruction,
          street: 'тестовая улица'
        }]
      }
    });
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

  it('snaps live GPS to the road and derives the real remaining turn, distance and time', () => {
    const route: RoadRoute = {
      distanceM: 1000,
      durationS: 600,
      geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45.01 }],
      maneuvers: [
        { distanceFromStartM: 250, instruction: 'Поверните налево', street: 'Первая улица' },
        { distanceFromStartM: 700, instruction: 'Поверните направо', street: 'Вторая улица' }
      ]
    };

    const progress = getRoadRouteProgress({ route, position: { lat: 43, lng: 45.005 } });

    expect(progress.isOnRoute).toBe(true);
    expect(progress.traveledDistanceM).toBeCloseTo(500, 0);
    expect(progress.remainingDistanceM).toBeCloseTo(500, 0);
    expect(progress.remainingDurationS).toBeCloseTo(300, 0);
    expect(progress.snappedPosition.lat).toBeCloseTo(43, 6);
    expect(progress.snappedPosition.lng).toBeCloseTo(45.005, 5);
    expect(progress.heading).toBeCloseTo(90, 0);
    expect(progress.distanceFromRouteM).toBeCloseTo(0, 0);
    expect(progress.nextManeuver).toEqual({
      distanceM: expect.closeTo(200, 0),
      instruction: 'Поверните направо',
      street: 'Вторая улица'
    });
  });

  it('looks ahead across tiny road segments instead of twitching with every segment bearing', () => {
    const route: RoadRoute = {
      distanceM: 50,
      durationS: 10,
      geometry: [
        { lat: 43, lng: 45 },
        { lat: 43.00004, lng: 45.00004 },
        { lat: 43, lng: 45.00008 },
        { lat: 43.00004, lng: 45.00012 },
        { lat: 43, lng: 45.0006 }
      ]
    };

    const progress = getRoadRouteProgress({ route, position: route.geometry[0] });

    expect(progress.heading).toBeGreaterThan(70);
    expect(progress.heading).toBeLessThan(110);
  });

  it('keeps the final road direction when the driver reaches the route endpoint', () => {
    const route: RoadRoute = {
      distanceM: 100,
      durationS: 20,
      geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45.001 }]
    };

    const progress = getRoadRouteProgress({ route, position: route.geometry[1] });

    expect(progress.traveledDistanceM).toBeCloseTo(100, 1);
    expect(progress.heading).toBeCloseTo(90, 0);
  });

  it('never moves route progress backwards and bounds an implausible forward GPS jump', () => {
    const route: RoadRoute = {
      distanceM: 1000,
      durationS: 600,
      geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45.01 }],
      maneuvers: [{ distanceFromStartM: 700, instruction: 'Поверните направо', street: 'Вторая улица' }]
    };

    const backward = getRoadRouteProgress({
      route,
      position: { lat: 43, lng: 45.004 },
      minimumTraveledDistanceM: 600
    });
    expect(backward.traveledDistanceM).toBe(600);
    expect(backward.remainingDistanceM).toBe(400);
    expect(backward.nextManeuver?.distanceM).toBe(100);

    const forwardJump = getRoadRouteProgress({
      route,
      position: { lat: 43, lng: 45.009 },
      minimumTraveledDistanceM: 600,
      maximumTraveledDistanceM: 650
    });
    expect(forwardJump.traveledDistanceM).toBe(650);
    expect(forwardJump.remainingDistanceM).toBe(350);
    expect(forwardJump.remainingDurationS).toBe(210);
  });

  it('ignores a point off the road and preserves the last stable route position', () => {
    const route: RoadRoute = {
      distanceM: 1000,
      durationS: 600,
      geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45.01 }]
    };
    const progress = getRoadRouteProgress({
      route,
      position: { lat: 43.01, lng: 45.005 },
      minimumTraveledDistanceM: 400,
      maximumSnapDistanceM: 70
    });

    expect(progress.isOnRoute).toBe(false);
    expect(progress.distanceFromRouteM).toBeGreaterThan(1000);
    expect(progress.traveledDistanceM).toBe(400);
    expect(progress.remainingDistanceM).toBe(600);
    expect(progress.snappedPosition.lng).toBeCloseTo(45.004, 5);
    expect('nextManeuver' in progress).toBe(false);
  });

  it('selects the nearest segment of a turning road instead of jumping to another part of the route', () => {
    const route: RoadRoute = {
      distanceM: 1000,
      durationS: 500,
      geometry: [
        { lat: 43, lng: 45 },
        { lat: 43, lng: 45.005 },
        { lat: 43.005, lng: 45.005 }
      ]
    };
    const progress = getRoadRouteProgress({
      route,
      position: { lat: 43.0025, lng: 45.005 }
    });

    expect(progress.isOnRoute).toBe(true);
    expect(progress.distanceFromRouteM).toBeLessThan(1);
    expect(progress.traveledDistanceM).toBeGreaterThan(700);
    expect(progress.traveledDistanceM).toBeLessThan(720);
    expect(progress.remainingDistanceM).toBeGreaterThan(280);
    expect(progress.remainingDistanceM).toBeLessThan(300);
    expect(progress.heading).toBeCloseTo(0, 0);
    expect(progress.snappedPosition.lat).toBeCloseTo(43.0025, 5);
    expect(progress.snappedPosition.lng).toBeCloseTo(45.005, 5);

    const firstLeg = getRoadRouteProgress({
      route,
      position: { lat: 43, lng: 45.0025 }
    });
    expect(firstLeg.traveledDistanceM).toBeGreaterThan(200);
    expect(firstLeg.traveledDistanceM).toBeLessThan(220);
    expect(firstLeg.heading).toBeCloseTo(90, 0);
  });

  it('keeps compatibility with a provider summary that exposes only one next maneuver', () => {
    const route: RoadRoute = {
      distanceM: 1000,
      durationS: 500,
      geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45.01 }],
      nextManeuver: { distanceM: 200, instruction: 'Поверните направо', street: 'Улица' }
    };
    const beforeTurn = getRoadRouteProgress({ route, position: { lat: 43, lng: 45.0005 } });
    expect(beforeTurn.nextManeuver).toEqual({
      distanceM: expect.closeTo(150, 0),
      instruction: 'Поверните направо',
      street: 'Улица'
    });

    const afterTurn = getRoadRouteProgress({ route, position: { lat: 43, lng: 45.003 } });
    expect(afterTurn.nextManeuver).toBeUndefined();

    const toleranceEdge = getRoadRouteProgress({
      route,
      position: { lat: 43, lng: 45.00201 },
      minimumTraveledDistanceM: 201,
      maximumTraveledDistanceM: 201
    });
    expect(toleranceEdge.nextManeuver?.distanceM).toBe(0);
  });

  it('accepts a GPS point exactly on the configured road tolerance boundary', () => {
    const route: RoadRoute = {
      distanceM: 1000,
      durationS: 500,
      geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45.01 }]
    };
    const boundaryLatitude = 43 + (70 / 6_371_000) * (180 / Math.PI);
    const progress = getRoadRouteProgress({
      route,
      position: { lat: boundaryLatitude, lng: 45.005 },
      maximumSnapDistanceM: 70
    });

    expect(progress.distanceFromRouteM).toBeCloseTo(70, 1);
    expect(progress.isOnRoute).toBe(true);

    const eastOfVerticalRoad = getRoadRouteProgress({
      route: {
        ...route,
        geometry: [{ lat: 43, lng: 45 }, { lat: 43.01, lng: 45 }]
      },
      position: { lat: 43.005, lng: 45.0005 },
      maximumSnapDistanceM: 50
    });
    expect(eastOfVerticalRoad.distanceFromRouteM).toBeGreaterThan(39);
    expect(eastOfVerticalRoad.distanceFromRouteM).toBeLessThan(42);
    expect(eastOfVerticalRoad.isOnRoute).toBe(true);
  });

  it('keeps a safe summary when road geometry is unavailable or has zero length', () => {
    const incomplete = getRoadRouteProgress({
      route: {
        distanceM: 1000,
        durationS: 600,
        geometry: [{ lat: 43, lng: 45 }],
        nextManeuver: { distanceM: 100, instruction: 'Поверните направо', street: 'Улица' }
      },
      position: { lat: 43.1, lng: 45.1 },
      minimumTraveledDistanceM: 250
    });
    expect(incomplete).toEqual({
      traveledDistanceM: 250,
      remainingDistanceM: 750,
      remainingDurationS: 450,
      snappedPosition: { lat: 43.1, lng: 45.1 },
      heading: 0,
      distanceFromRouteM: Number.POSITIVE_INFINITY,
      isOnRoute: false,
      nextManeuver: { distanceM: 100, instruction: 'Поверните направо', street: 'Улица' }
    });

    const finishedWithoutGeometry = getRoadRouteProgress({
      route: { distanceM: 0, durationS: 0, geometry: [{ lat: 43, lng: 45 }] },
      position: { lat: 43, lng: 45 }
    });
    expect(finishedWithoutGeometry.remainingDistanceM).toBe(0);
    expect(finishedWithoutGeometry.remainingDurationS).toBe(0);

    const stationary = getRoadRouteProgress({
      route: {
        distanceM: 0,
        durationS: 0,
        geometry: [{ lat: 43, lng: 45 }, { lat: 43, lng: 45 }]
      },
      position: { lat: 43, lng: 45 }
    });
    expect(stationary.remainingDistanceM).toBe(0);
    expect(stationary.remainingDurationS).toBe(0);
    expect(stationary.traveledDistanceM).toBe(0);
    expect(stationary.snappedPosition).toEqual({ lat: 43, lng: 45 });
    expect(stationary.distanceFromRouteM).toBe(0);
    expect(stationary.isOnRoute).toBe(true);
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
