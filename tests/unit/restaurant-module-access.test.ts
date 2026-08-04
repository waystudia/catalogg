import { describe, expect, it } from 'vitest';
import {
  createDefaultRestaurantModules,
  getRestaurantAdminModuleAccess,
  getModuleAccessMode,
  getRestaurantModulePackageFeatures
} from '../../src/features/platform-admin-modules/restaurantModuleAccess';

describe('restaurant module subscriptions', () => {
  it('keeps every new module disabled for an existing restaurant without an entitlement row', () => {
    expect(createDefaultRestaurantModules('catalog-mangal')).toEqual({
      catalogId: 'catalog-mangal',
      packageCode: 'basic',
      posEnabled: false,
      warehouseEnabled: false,
      recipesEnabled: false,
      financeEnabled: false,
      promotionsEnabled: false,
      loyaltyEnabled: false,
      maxCashiers: 1,
      maxDevices: 1,
      maxLocations: 1,
      maxWarehouses: 0
    });
  });

  it('maps each package to its exact module set', () => {
    expect(getRestaurantModulePackageFeatures('basic')).toEqual({
      posEnabled: false,
      warehouseEnabled: false,
      recipesEnabled: false,
      financeEnabled: false,
      promotionsEnabled: false,
      loyaltyEnabled: false
    });
    expect(getRestaurantModulePackageFeatures('pos')).toEqual({
      posEnabled: true,
      warehouseEnabled: false,
      recipesEnabled: false,
      financeEnabled: false,
      promotionsEnabled: false,
      loyaltyEnabled: false
    });
    expect(getRestaurantModulePackageFeatures('pos_warehouse')).toEqual({
      posEnabled: true,
      warehouseEnabled: true,
      recipesEnabled: true,
      financeEnabled: false,
      promotionsEnabled: false,
      loyaltyEnabled: false
    });
    expect(getRestaurantModulePackageFeatures('full')).toEqual({
      posEnabled: true,
      warehouseEnabled: true,
      recipesEnabled: true,
      financeEnabled: true,
      promotionsEnabled: true,
      loyaltyEnabled: true
    });
  });

  it('grants active access only to enabled modules on a current active or trial subscription', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');

    expect(getModuleAccessMode({ enabled: false, status: 'active', endsAt: null, now })).toBe('disabled');
    expect(getModuleAccessMode({ enabled: true, status: 'active', endsAt: null, now })).toBe('active');
    expect(getModuleAccessMode({ enabled: true, status: 'trial', endsAt: '2026-08-04T12:00:00.000Z', now })).toBe('active');
  });

  it('switches enabled modules to read-only exactly when the subscription expires', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');

    expect(getModuleAccessMode({ enabled: true, status: 'active', endsAt: '2026-08-03T12:00:00.001Z', now })).toBe('active');
    expect(getModuleAccessMode({ enabled: true, status: 'active', endsAt: '2026-08-03T12:00:00.000Z', now })).toBe('read_only');
    expect(getModuleAccessMode({ enabled: true, status: 'active', endsAt: '2026-08-03T11:59:59.999Z', now })).toBe('read_only');
  });

  it('keeps data visible but read-only for every non-current subscription status', () => {
    const now = new Date('2026-08-03T12:00:00.000Z');

    for (const status of ['past_due', 'expired', 'cancelled'] as const) {
      expect(getModuleAccessMode({ enabled: true, status, endsAt: null, now })).toBe('read_only');
    }
  });

  it('builds the restaurant cabinet access from that exact catalog entitlement', () => {
    const modules = {
      ...createDefaultRestaurantModules('catalog-mangal'),
      posEnabled: true,
      warehouseEnabled: false
    };

    expect(getRestaurantAdminModuleAccess({
      modules,
      status: 'active',
      endsAt: null,
      now: new Date('2026-08-04T12:00:00.000Z')
    })).toEqual({
      pos: 'active',
      warehouse: 'disabled'
    });
  });

  it('keeps enabled restaurant modules visible but read-only after expiry', () => {
    const modules = {
      ...createDefaultRestaurantModules('catalog-rizih'),
      posEnabled: true,
      warehouseEnabled: true
    };

    expect(getRestaurantAdminModuleAccess({
      modules,
      status: 'expired',
      endsAt: '2026-08-01T00:00:00.000Z',
      now: new Date('2026-08-04T12:00:00.000Z')
    })).toEqual({
      pos: 'read_only',
      warehouse: 'read_only'
    });
  });
});
