import { describe, expect, it, vi } from 'vitest';
import { loadAsphaltPreferredRoadRoute } from '../../src/shared/asphaltRoadRouting';
import {
  findClosestAsphaltRoadPoint,
  getAsphaltRoadCandidates,
  normalizeAsphaltRoadPoints,
  type AsphaltRoadCorridor
} from '../../src/shared/asphaltRoads';
import type { DeliveryMapCoordinates } from '../../src/shared/deliveryMap';
import type { RoadRoute } from '../../src/shared/deliveryNavigation';

const start = { lat: 43.31, lng: 45.68 };
const end = { lat: 43.31, lng: 45.70 };
const asphaltPoints = [
  { lat: 43.31, lng: 45.682 },
  { lat: 43.311, lng: 45.69 },
  { lat: 43.31, lng: 45.698 }
];

const corridor = (points = asphaltPoints): AsphaltRoadCorridor => ({
  id: 'road-1',
  groupName: 'Грозный',
  name: 'Главная асфальтовая дорога',
  points,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
});

const route = (distanceM: number, points: ReadonlyArray<DeliveryMapCoordinates>): RoadRoute => ({
  distanceM,
  durationS: distanceM / 10,
  geometry: points
});

describe('asphalt road corridors', () => {
  it('normalizes points and removes accidental duplicate taps', () => {
    expect(normalizeAsphaltRoadPoints([
      start,
      { lat: start.lat + 0.000001, lng: start.lng },
      end
    ])).toEqual([start, end]);
  });

  it('orients a saved corridor in the direction of the delivery', () => {
    const candidates = getAsphaltRoadCandidates([start, end], [corridor([...asphaltPoints].reverse())]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].points[0]).toEqual(asphaltPoints[0]);
    expect(candidates[0].points.at(-1)).toEqual(asphaltPoints.at(-1));
  });

  it('snaps a branch point to the nearest saved asphalt segment', () => {
    const snap = findClosestAsphaltRoadPoint(
      { lat: 43.3101, lng: 45.69 },
      [corridor([{ lat: 43.31, lng: 45.68 }, { lat: 43.31, lng: 45.70 }])]
    );

    expect(snap?.corridorId).toBe('road-1');
    expect(snap?.distanceM).toBeLessThan(12);
    expect(snap?.point.lat).toBeCloseTo(43.31, 5);
  });

  it('does not snap to a distant saved asphalt segment', () => {
    expect(findClosestAsphaltRoadPoint(
      { lat: 43.32, lng: 45.69 },
      [corridor([{ lat: 43.31, lng: 45.68 }, { lat: 43.31, lng: 45.70 }])]
    )).toBeNull();
  });

  it('prefers a reasonable route through confirmed asphalt', async () => {
    const routeLoader = vi.fn(async (points: ReadonlyArray<DeliveryMapCoordinates>) =>
      route(points.length > 2 ? 1_300 : 1_000, points)
    );

    const selected = await loadAsphaltPreferredRoadRoute({
      points: [start, end],
      corridors: [corridor()],
      routeLoader
    });

    expect(selected.distanceM).toBe(1_300);
    expect(selected.geometry).toEqual([start, ...asphaltPoints, end]);
    expect(routeLoader).toHaveBeenCalledTimes(2);
  });

  it('keeps the normal route when asphalt requires an excessive detour', async () => {
    const routeLoader = vi.fn(async (points: ReadonlyArray<DeliveryMapCoordinates>) =>
      route(points.length > 2 ? 4_000 : 1_000, points)
    );

    const selected = await loadAsphaltPreferredRoadRoute({
      points: [start, end],
      corridors: [corridor()],
      routeLoader
    });

    expect(selected.distanceM).toBe(1_000);
  });
});
