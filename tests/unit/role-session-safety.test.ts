import { describe, expect, it, vi } from 'vitest';
import {
  confirmRoleSignOut,
  getDriverBackTarget,
  getRestaurantCatalogBackTarget
} from '../../src/shared/roleSessionSafety';

describe('role account session safety', () => {
  it('keeps restaurant owners inside their panel when leaving the public catalog', () => {
    expect(getRestaurantCatalogBackTarget({ catalogSlug: 'mangal', isAdmin: true })).toBe('/mangal/dashboard');
    expect(getRestaurantCatalogBackTarget({ catalogSlug: '  mangal  ', isAdmin: true })).toBe('/mangal/dashboard');
    expect(getRestaurantCatalogBackTarget({ catalogSlug: 'mangal', isAdmin: false })).toBe('/');
  });

  it('keeps every driver back action inside the driver application', () => {
    expect(getDriverBackTarget('/driver/settings')).toBe('/driver/profile');
    expect(getDriverBackTarget('/driver/support')).toBe('/driver/profile');
    expect(getDriverBackTarget('/driver/profile')).toBe('/driver');
    expect(getDriverBackTarget('/driver/orders/offer-1')).toBe('/driver/orders');
    expect(getDriverBackTarget('/driver/orders')).toBe('/driver');
    expect(getDriverBackTarget('/driver/map/offer-1')).toBe('/driver/active');
    expect(getDriverBackTarget('/driver/qr')).toBe('/driver/active');
    expect(getDriverBackTarget('/driver/map/offer-1///?tab=route')).toBe('/driver/active');
    expect(getDriverBackTarget('/driver/orders/offer-1?tab=details')).toBe('/driver/orders');
    expect(getDriverBackTarget('')).toBe('/driver');
    expect(getDriverBackTarget('/driver')).toBe('/driver');
  });

  it('allows sign-out only after an explicit confirmation', () => {
    const reject = vi.fn(() => false);
    const accept = vi.fn(() => true);

    expect(confirmRoleSignOut('водителя', reject)).toBe(false);
    expect(confirmRoleSignOut('суперадминистратора', accept)).toBe(true);
    expect(reject).toHaveBeenCalledWith('Выйти из аккаунта водителя?');
    expect(accept).toHaveBeenCalledWith('Выйти из аккаунта суперадминистратора?');
  });
});
