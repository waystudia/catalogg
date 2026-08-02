import { describe, expect, it } from 'vitest';
import {
  coordinatesToMapPoint,
  getNavigationFollowCenter,
  getNavigationLookAheadDistanceM,
  rotateMapPoint
} from '../../src/shared/deliveryMap';

describe('driver map follow anchor', () => {
  it('keeps the driver visible above the mobile order sheet at every navigation zoom', () => {
    const driver = { lat: 43.3181235, lng: 45.6987654 };

    expect(getNavigationLookAheadDistanceM(16)).toBe(192);
    expect(getNavigationLookAheadDistanceM(17)).toBe(96);
    expect(getNavigationLookAheadDistanceM(18)).toBe(48);

    for (const zoom of [16, 17, 17.5, 18]) {
      const heading = 90;
      const center = getNavigationFollowCenter(driver, heading, getNavigationLookAheadDistanceM(zoom));
      const projected = coordinatesToMapPoint(driver, center, zoom, 640, { clampToViewport: false });
      const screenPoint = rotateMapPoint(projected, -heading, { x: 320, y: 320 });

      expect(screenPoint.x).toBeCloseTo(320, 0);
      expect(screenPoint.y).toBeGreaterThan(425);
      expect(screenPoint.y).toBeLessThan(440);
    }
  });
});
