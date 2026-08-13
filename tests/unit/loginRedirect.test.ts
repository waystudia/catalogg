import { describe, expect, it } from 'vitest';
import {
  assertExpectedLoginRole,
  getExpectedLoginRoleForReturnTo,
  getCatalogWorkspaceRedirect
} from '../../src/shared/api/loginRedirectApi';
import { buildProfileLoginPath, resolveProfileLoginTarget } from '../../src/shared/appNavigation';

describe('staff login role selection', () => {
  it('opens every role login inside the client profile and rejects unsafe return paths', () => {
    expect(buildProfileLoginPath('/business/finik')).toBe(
      '/profile?login=1&returnTo=%2Fbusiness%2Ffinik'
    );
    expect(buildProfileLoginPath('//external.example')).toBe(
      '/profile?login=1&returnTo=%2Fprofile'
    );
  });

  it('routes each authenticated role without allowing a client session into a role cabinet', () => {
    expect(resolveProfileLoginTarget('/admin', '/profile')).toBe('/admin/clients');
    expect(resolveProfileLoginTarget('/business/finik', '/profile')).toBe('/business/finik');
    expect(resolveProfileLoginTarget('/profile', '/r/mangal/checkout')).toBe('/r/mangal/checkout');
    expect(resolveProfileLoginTarget('/profile', '/admin/clients')).toBe('/profile');
    expect(resolveProfileLoginTarget('/profile', '/business/finik')).toBe('/profile');
  });

  it('routes groceries to the universal business workspace without changing restaurants', () => {
    expect(getCatalogWorkspaceRedirect({ slug: 'finik', business_type: 'grocery' })).toBe('/business/finik');
    expect(getCatalogWorkspaceRedirect({ slug: 'mangal', business_type: 'restaurant' })).toBe('/mangal/dashboard');
  });

  it('does not let a role login fall back to an ordinary customer account', () => {
    expect(getExpectedLoginRoleForReturnTo('/business/finik')).toBe('restaurant');
    expect(getExpectedLoginRoleForReturnTo('/admin/clients')).toBe('restaurant');
    expect(getExpectedLoginRoleForReturnTo('/driver/orders')).toBe('driver');
    expect(getExpectedLoginRoleForReturnTo('/r/finik/checkout')).toBeUndefined();
  });

  it('accepts the matching driver and restaurant destinations', () => {
    expect(() => assertExpectedLoginRole('/driver', 'driver')).not.toThrow();
    expect(() => assertExpectedLoginRole('/mangal/dashboard', 'restaurant')).not.toThrow();
    expect(() => assertExpectedLoginRole('/business/finik', 'restaurant')).not.toThrow();
    expect(() => assertExpectedLoginRole('/restaurant/activation', 'restaurant')).not.toThrow();
  });

  it('explains when a restaurant account is entered under driver', () => {
    expect(() => assertExpectedLoginRole('/mangal/dashboard', 'driver')).toThrow(
      'Это аккаунт ресторана. Выберите «Ресторан».'
    );
    expect(() => assertExpectedLoginRole('/business/finik', 'driver')).toThrow(
      'Это аккаунт ресторана. Выберите «Ресторан».'
    );
  });

  it('explains when a driver account is entered under restaurant', () => {
    expect(() => assertExpectedLoginRole('/driver', 'restaurant')).toThrow(
      'Это аккаунт водителя. Выберите «Водитель».'
    );
  });

  it('rejects accounts that have no selected staff role', () => {
    expect(() => assertExpectedLoginRole('/', 'restaurant')).toThrow(
      'Этот аккаунт не привязан к ресторану.'
    );
    expect(() => assertExpectedLoginRole('/admin', 'driver')).toThrow(
      'Это аккаунт ресторана. Выберите «Ресторан».'
    );
  });
});
